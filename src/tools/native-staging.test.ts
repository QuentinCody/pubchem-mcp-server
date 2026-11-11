import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { hashCanonicalJson, verifyCitationEnvelope } from "@bio-mcp/shared";
import { DynamicWorkerExecutor } from "@bio-mcp/shared/codemode/execute-tool";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { PubchemDataDO } from "../do";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";
import { postEndpoints } from "../spec/post";
import { cellAssayWorkflow } from "../spec/cell-assay";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function createStore() {
  const database = new DatabaseSync(":memory:");
  let ready = Promise.resolve();
  const exec = (query: string, ...values: any[]) => {
    const rows = database.prepare(query).all(...values);
    const iterator = rows[Symbol.iterator]();
    return { toArray: () => rows, one: () => rows[0], next: () => iterator.next(), [Symbol.iterator]: () => iterator };
  };
  const transactionSync = <T>(run: () => T): T => {
    database.exec("BEGIN");
    try { const result = run(); database.exec("COMMIT"); return result; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  const ctx = { blockConcurrencyWhile: (run: () => Promise<void>) => { ready = run(); return ready; }, storage: { sql: { exec }, transactionSync } };
  const instance = new PubchemDataDO(ctx as unknown as DurableObjectState, {} as Cloudflare.Env);
  return { database, instance, ready };
}

function fixture() {
  // Exercise generated API helpers and user code; replace only the platform isolate.
  vi.spyOn(DynamicWorkerExecutor.prototype, "execute").mockImplementation(async (code, functions) => {
    const staged: Array<Record<string, unknown>> = [];
    try {
      const run = new Function("codemode", "__stagedResults", "console", `return (${code})();`);
      const result = await run(functions, staged, { warn() {}, log() {} });
      return { result: JSON.parse(JSON.stringify(result)), __stagedResults: staged };
    } catch (error) { return { error: String((error as Error).message), __stagedResults: staged }; }
  });
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const namespace = { idFromName: (name: string) => name, get: (id: string) => ({ fetch: async (request: Request) => {
    let store = stores.get(id);
    if (!store) { store = createStore(); stores.set(id, store); }
    await store.ready;
    return store.instance.fetch(request);
  } }) };
  const env = { PUBCHEM_DATA_DO: namespace, CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1];
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, env); registerQueryData(server, env); registerGetSchema(server, env);
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<any> }> })._registeredTools;
  return { tools, close: () => { for (const store of stores.values()) store.database.close(); } };
}

async function recover(f: ReturnType<typeof fixture>, id: string, prefix: string) {
  const rows = async (sql: string) => {
    const output = await f.tools[`${prefix}pubchem_query_data`].handler({ data_access_id: id, sql }, {});
    expect(output.isError, JSON.stringify(output)).not.toBe(true);
    expect(output.structuredContent.staged).not.toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(output)).byteLength).toBeLessThan(30720);
    return output.structuredContent.data.rows;
  };
  const text = async (table: string, column: string, where: string) => {
    const [{ n }] = await rows(`SELECT length(${column}) AS n FROM ${table} WHERE ${where}`);
    let result = "";
    for (let start = 1; start <= n; start += 1000) {
      const [row] = await rows(`SELECT substr(${column}, ${start}, 1000) AS part FROM ${table} WHERE ${where}`);
      result += row.part;
    }
    return result;
  };
  let raw = await text("payloads", "root_json", "id = 1");
  if (raw.startsWith("__CHUNKED__:")) {
    const chunk = raw.slice("__CHUNKED__:".length);
    expect(chunk).toMatch(/^chunk_[a-f0-9]{32}$/);
    const parts = await rows(`SELECT chunk_index FROM content_chunks WHERE content_id = '${chunk}' ORDER BY chunk_index`);
    raw = "";
    for (const part of parts) raw += await text("content_chunks", "chunk_data", `content_id = '${chunk}' AND chunk_index = ${part.chunk_index}`);
  }
  const decoded = JSON.parse(raw);
  return typeof decoded === "string" ? JSON.parse(decoded) : decoded;
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const dataId = (result: any) => result.structuredContent.data_access_id ?? result.structuredContent.data?.data_access_id;

it.each(["", "mcp_"])("executes the cell-assay handoff with %s aliases and staged source tables", async prefix => {
  const f = fixture();
  const associations = { InformationList: { Information: [{ CellAccession: "CVCL_0030", AID: Array.from({ length: 2000 }, (_, i) => i + 1) }] }, note: "native association context ".repeat(1500) };
  const concise = { Table: { Columns: { Column: ["CID", "Activity Outcome", "Value [uM]"] }, Row: Array.from({ length: 1500 }, (_, i) => ({ Cell: [i === 0 ? "2244" : "999", i === 0 ? "Inactive" : "Active", "<0.000000000000001"] })) }, note: "native assay context" };
  const properties = { PropertyTable: { Properties: [{ CID: 2244, InChI: "native full structure", InChIKey: "native full key", SMILES: "native stereo structure" }] } };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/aids/JSON")) return Response.json(associations);
    if (path.endsWith("/description/JSON")) return Response.json({ description: "native assay context" });
    if (path.endsWith("/concise/JSON")) return Response.json(concise);
    if (path.includes("/property/")) return Response.json(properties);
    if (path.endsWith("/xrefs/RegistryID/JSON")) return Response.json({ InformationList: { Information: [{ CID: 2244, RegistryID: ["CHEMBL25", "CHEMBL25"] }] } });
    throw new Error(`Unexpected request ${path}`);
  }));
  try {
    const args = { code: cellAssayWorkflow.code };
    const result = await f.tools[`${prefix}pubchem_execute`].handler(args, {});
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    const full = result.structuredContent.staged ? await recover(f, dataId(result), prefix) : result;
    const data = full.structuredContent.data;
    expect(data).toMatchObject({ step: "compound_handoff", compound_selection: { cid: 2244, source_row: { CID: "2244", "Activity Outcome": "Inactive", "Value [uM]": "<0.000000000000001" } }, handoff: { chembl_registry_candidates: ["CHEMBL25", "CHEMBL25"] } });
    expect(data.associations.__staged).toBe(true); expect(data.concise.__staged).toBe(true);
    expect((await recover(f, data.associations.data_access_id, prefix)).native).toEqual(associations);
    expect((await recover(f, data.concise.data_access_id, prefix)).native).toEqual(concise);
    const proof = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: args,
      ...(result.structuredContent.staged ? { materialized: { value: full } } : {}) });
    expect(proof.verification).toMatchObject({ query: "verified", result: "verified" });
  } finally { f.close(); }
});

it.each(postEndpoints)("executes $path through generated Code Mode helpers on both aliases", async endpoint => {
  const f = fixture(); const native = { IdentifierList: { CID: [2244] } };
  const fetcher = vi.fn(async () => Response.json(native)); vi.stubGlobal("fetch", fetcher);
  const code = endpoint.example!;
  try {
    for (const prefix of ["", "mcp_"]) {
      const result = await f.tools[`${prefix}pubchem_execute`].handler({ code }, {});
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      expect(result.structuredContent.data).toEqual(native);
      const verified = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: { code } });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
    for (const [url, init] of fetcher.mock.calls as unknown as [string, RequestInit][]) {
      const form = new URLSearchParams(init.body as string);
      if (endpoint.category === "similarity") {
        expect(new URL(url).searchParams.get("Threshold")).toBe("90");
        expect(new URL(url).searchParams.get("MaxRecords")).toBe("10");
        expect(form.get("smiles")).toBe("C1C[CH+]1");
      } else if (endpoint.path.includes("inchi")) expect(form.get("inchi")).toBe("InChI=1S/C3H8/c1-3-2/h3H2,1-2H3");
      else expect(form.get("cid")).toBe("2244,1983");
    }
  } finally { f.close(); }
});

it("returns program, API validation and SQL errors with both fields and citations", async () => {
  const f = fixture(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  try {
    for (const prefix of ["", "mcp_"]) {
      for (const code of ["throw new Error('fixture error')", "return await api.post('/compound/cid/property/MolecularFormula/JSON', { cid: { invalid: 1 } });"]) {
        const args = { code };
        const result = await f.tools[`${prefix}pubchem_execute`].handler(args, {});
        expect(result).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: { success: false } });
        const verified = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: args });
        expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
      }
      const args = { data_access_id: "pubchem_missing", sql: "DROP TABLE payloads" };
      const result = await f.tools[`${prefix}pubchem_query_data`].handler(args, {});
      expect(result).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: { success: false } });
      const verified = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: args });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
    expect(fetcher).not.toHaveBeenCalled();
  } finally { f.close(); }
});

it("registers and cites both names for discovery, execution and staged access", async () => {
  const f = fixture();
  try {
    for (const prefix of ["", "mcp_"]) {
      for (const suffix of ["search", "execute", "query_data", "get_schema"]) expect(f.tools[`${prefix}pubchem_${suffix}`]).toBeDefined();
      const args = { query: "cell accession", max_results: 5 };
      const result = await f.tools[`${prefix}pubchem_search`].handler(args, {});
      expect(JSON.stringify(result)).toContain("/cell/cellacc/{id}/summary/JSON");
      const verified = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: args });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
  } finally { f.close(); }
});

it.each(["concise", "associations"])("retains complete native %s evidence alongside SQL rows", async mode => {
  const f = fixture();
  const native = mode === "concise"
    ? { Table: { Columns: { Column: ["CID", "Activity Outcome", "Value [uM]"] }, Row: [{ Cell: ["001122", "Active", "0.000000000000000123"], native_note: "row context" }], description: "table context" }, note: 'α|🧬'.repeat(12000) }
    : { InformationList: { Information: [{ GeneID: 1956, AID: [1259, 1259, 1302], source: "fixture" }, { GeneID: 1, AID: [], source: "no associations" }], native_note: "list context" }, note: 'α|🧬'.repeat(12000) };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(native)));
  const code = ` \nreturn await api.get('${mode === "concise" ? "/assay/aid/1/concise/JSON" : "/gene/geneid/1956,1/aids/JSON"}');\r\n`;
  try {
    for (const prefix of ["", "mcp_"]) {
      const result = await f.tools[`${prefix}pubchem_execute`].handler({ code }, {});
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      expect(bytes(result)).toBeLessThan(30720);
      expect(result.structuredContent._staging).toBeDefined();
      const id = dataId(result); const recovered = await recover(f, id, prefix);
      expect(recovered.native).toEqual(native);
      expect(result.structuredContent._meta.citation.result_hash).toBe(await hashCanonicalJson(recovered));
      const verification = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: { code }, materialized: { value: recovered } });
      expect(verification.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
      const query = await f.tools[`${prefix}pubchem_query_data`].handler({ data_access_id: id, sql: mode === "concise" ? 'SELECT CID, "Value [uM]" FROM rows' : "SELECT GeneID, AID FROM rows ORDER BY AID" }, {});
      expect(query.structuredContent.data.rows).toEqual(mode === "concise" ? [{ CID: "001122", "Value [uM]": "0.000000000000000123" }] : [{ GeneID: 1956, AID: 1259 }, { GeneID: 1956, AID: 1259 }, { GeneID: 1956, AID: 1302 }]);
      const schemaArgs = { data_access_id: id };
      const schema = await f.tools[`${prefix}pubchem_get_schema`].handler(schemaArgs, {});
      const verified = await verifyCitationEnvelope({ citation: schema.structuredContent._meta.citation, structuredContent: schema.structuredContent, toolArguments: schemaArgs });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
  } finally { f.close(); }
});

it("retains and cites large native faults on both aliases", async () => {
  const f = fixture(); const native = { Fault: { Code: "PUGREST.NotFound", Message: "No matches", Details: ['α|🧬'.repeat(12000)] } };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(native, { status: 404 })));
  const code = "return await api.get('/cell/identifier/invalid/cellids/JSON');";
  try {
    for (const prefix of ["", "mcp_"]) {
      const result = await f.tools[`${prefix}pubchem_execute`].handler({ code }, {});
      expect(result).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: { success: false } });
      expect(bytes(result)).toBeLessThan(30720);
      const evidence = result.structuredContent.data.data;
      expect(await recover(f, evidence.data_access_id, prefix)).toBe(JSON.stringify(native));
      const verified = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: { code } });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
  } finally { f.close(); }
});

it.each(["information", "properties", "multiple"])("materializes sparse and separate native %s tables", async mode => {
  const f = fixture();
  const native = mode === "information" ? { InformationList: { Information: [{ GeneID: 1956, Symbol: "EGFR", Description: "α|".repeat(18000) }] } }
    : mode === "properties" ? { PropertyTable: { Properties: [{ CID: 2244, MolecularFormula: "C9H8O4", note: "α|".repeat(18000) }] } }
    : { PC_Compounds: [{ id: { id: { cid: 2244 } }, note: "α|".repeat(18000) }], warnings: [{ message: "source warning" }] };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(native)));
  try {
    const result = await f.tools.pubchem_execute.handler({ code: "return await api.get('/gene/geneid/1956/summary/JSON');" }, {});
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    const id = dataId(result); expect(await recover(f, id, "")).toEqual(native);
    const sql = mode === "information" ? "SELECT GeneID FROM information" : mode === "properties" ? "SELECT CID FROM properties" : "SELECT message FROM warnings";
    const query = await f.tools.pubchem_query_data.handler({ data_access_id: id, sql }, {});
    expect(query.structuredContent.data.rows).toEqual(mode === "information" ? [{ GeneID: 1956 }] : mode === "properties" ? [{ CID: 2244 }] : [{ message: "source warning" }]);
  } finally { f.close(); }
});

it("stages entire escaped program results and large SQL pages", async () => {
  const f = fixture(); const native = { rows: Array.from({ length: 150 }, (_, id) => ({ id, note: 'α|'.repeat(80) })) };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(native)));
  try {
    for (const prefix of ["", "mcp_"]) {
      const program = `return { text: '"'.repeat(15500) };`;
      const result = await f.tools[`${prefix}pubchem_execute`].handler({ code: program }, {});
      expect(bytes(result)).toBeLessThan(30720);
      const recovered = await recover(f, dataId(result), prefix);
      expect(recovered.structuredContent.data.text).toBe('"'.repeat(15500));
      const verified = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: { code: program }, materialized: { value: recovered } });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
      const staged = await f.tools[`${prefix}pubchem_execute`].handler({ code: "return await api.get('/gene/geneid/1956/summary/JSON');" }, {});
      const args = { data_access_id: dataId(staged), sql: "SELECT * FROM rows ORDER BY id LIMIT 150", limit: 150 };
      const query = await f.tools[`${prefix}pubchem_query_data`].handler(args, {});
      expect(query.isError, JSON.stringify(query)).not.toBe(true); expect(bytes(query)).toBeLessThan(30720);
      const materialized = await recover(f, dataId(query), prefix);
      expect(materialized.structuredContent.data.rows).toMatchObject(native.rows);
      const queryVerified = await verifyCitationEnvelope({ citation: query.structuredContent._meta.citation, structuredContent: query.structuredContent, toolArguments: args, materialized: { value: materialized } });
      expect(queryVerified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
  } finally { f.close(); }
});

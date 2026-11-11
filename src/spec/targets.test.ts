import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPubchemApiFetch } from "../lib/api-adapter";
import { pubchemCatalog } from "./catalog";
import { targetEndpoints } from "./targets";

afterEach(() => vi.unstubAllGlobals());
const request = createPubchemApiFetch();
const api = { get: async (path: string, params?: Record<string, string>) => (await request({ method: "GET", path, params })).data };

describe("PubChem target discovery", () => {
  it.each([
    ["gene", "HGNC:3236", "geneids", "HGNC ID", { GeneID: [1956, 9999] }],
    ["protein", "CHEMBL203", "accessions", "ChEMBL Target ID", { ProteinAccession: ["P00533"] }],
    ["taxonomy", "6MB3T", "taxids", "COL ID", { TaxonomyID: [9606] }],
    ["cell", "C18096", "cellids", "NCI Thesaurus Code", { CellID: [31] }],
  ])("executes %s external mapping with an explicit namespace and retains all identifiers", async (domain, external, operation, type, identifiers) => {
    const data = { IdentifierList: identifiers };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(data)); vi.stubGlobal("fetch", fetchMock);
    const endpoint = targetEndpoints.find(e => e.path === `/${domain}/identifier/{id}/${operation}/JSON`)!;
    expect(await runInNewContext(`(async()=>{${endpoint.example}})()`, { api })).toEqual(data);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe(`/rest/pug/${domain}/identifier/${external}/${operation}/JSON`);
    expect(url.searchParams.get("identifier_type")).toBe(type);
  });
  it("keeps namespace discovery as text instead of parsing it as JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ChEMBL Target ID\nUniProt ID\n", { headers: { "content-type": "text/plain" } })));
    expect(await runInNewContext(`(async()=>{${targetEndpoints[0].example}})()`, { api })).toBe("ChEMBL Target ID\nUniProt ID\n");
  });
  it("publishes executable reverse, summary and assay examples including explicit species/cell namespaces", async () => {
    const mockApi = { get: vi.fn().mockResolvedValue({}) };
    for (const endpoint of targetEndpoints) await runInNewContext(`(async()=>{${endpoint.example}})()`, { api: mockApi });
    expect(mockApi.get).toHaveBeenCalledWith("/gene/genesymbol/Egfr/10090/summary/JSON");
    expect(mockApi.get).toHaveBeenCalledWith("/cell/cellacc/CVCL_0030/aids/JSON");
    expect(mockApi.get).toHaveBeenCalledWith("/protein/accession/P00533/identifiers/JSON", { identifier_type: "ChEMBL Target ID" });
    expect(pubchemCatalog.endpointCount).toBe(pubchemCatalog.endpoints.length);
    expect(pubchemCatalog.endpoints.some(e => e.path.startsWith("/pug_view/"))).toBe(true);
  });
  it("retains no-match errors instead of inventing an identifier", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ Fault: { Code: "PUGREST.NotFound" } }, { status: 404 })));
    await expect(api.get("/cell/identifier/invalid/cellids/JSON", { identifier_type: "NCI Thesaurus Code" })).rejects.toThrow("HTTP 404");
  });
  it("normalizes concise assay rows before staging while leaving identifier tables intact", async () => {
    const data = { Table: { Columns: { Column: ["CID", "Activity Outcome"] }, Row: [{ Cell: ["11122", "Inactive"] }] } };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json(data))));
    expect(await api.get("/assay/aid/1/concise/JSON")).toMatchObject({ source_format: "PubChem Table", columns: ["CID", "Activity Outcome"], rows: [{ CID: "11122", "Activity Outcome": "Inactive" }] });
    expect(await api.get("/protein/accession/P00533/identifiers/JSON")).toEqual(data);
  });
  it("exposes cell assay IDs as individual rows for SQL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ InformationList: { Information: [{ CellAccession: "CVCL_0030", AID: [1259, 1302] }] } })));
    expect(await api.get("/cell/cellacc/CVCL_0030/aids/JSON")).toMatchObject({ source_format: "PubChem InformationList", rows: [{ CellAccession: "CVCL_0030", AID: 1259 }, { CellAccession: "CVCL_0030", AID: 1302 }] });
  });
});

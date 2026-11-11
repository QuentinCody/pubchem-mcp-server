import { afterEach, expect, it, vi } from "vitest";
import { createPubchemApiFetch } from "./api-adapter";
import { pubchemFetch } from "./http";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const request = createPubchemApiFetch();

it("encodes native form fields exactly while retaining independent query options", async () => {
  const fetcher = vi.fn(async () => Response.json({ IdentifierList: { CID: [2244] } })); vi.stubGlobal("fetch", fetcher);
  const smiles = "C/C=C\\C[C@H]([NH3+])C(=O)[O-]";
  expect(await request({ method: "POST", path: "/compound/fastsimilarity_2d/smiles/cids/JSON", params: { Threshold: 91, MaxRecords: 10 }, body: { smiles, cid: [2244, 1983], active: false, empty: "", omitted: null } })).toMatchObject({ data: { IdentifierList: { CID: [2244] } } });
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(new URL(url).searchParams.get("Threshold")).toBe("91");
  expect(new URL(url).searchParams.get("MaxRecords")).toBe("10");
  expect(init.method).toBe("POST"); expect(new Headers(init.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
  expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({ smiles, cid: "2244,1983", active: "false", empty: "" });
});

it.each([null, "cid=1", [1], { cid: { nested: 1 } }, { cid: [1, {}] }, { cid: Number.NaN }])("rejects ambiguous form bodies before contacting PubChem: %j", async body => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(request({ method: "POST", path: "/compound/cid/cids/JSON", body })).rejects.toMatchObject({ status: 400 });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  { method: "DELETE", path: "/compound/cid/1/JSON" },
  { method: "PUT", path: "/compound/cid/1/JSON", body: {} },
  { method: "GET", path: "/compound/cid/JSON", body: { cid: [1] } },
])("rejects unsupported method/body combinations: %j", async input => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(request(input)).rejects.toMatchObject({ status: 405 }); expect(fetcher).not.toHaveBeenCalled();
});

it("keeps PUG View GET and JSON POST routing and parameters separate", async () => {
  const native = { Record: { RecordNumber: 2244 } };
  const fetcher = vi.fn(async () => Response.json(native)); vi.stubGlobal("fetch", fetcher);
  for (const method of ["GET", "POST"]) expect(await request({ method, path: "/pug_view/data/compound/2244/JSON", params: { heading: "Names and Identifiers" }, ...(method === "POST" ? { body: { fixture: true } } : {}) })).toEqual({ status: 200, data: native });
  for (const call of fetcher.mock.calls as unknown as [string, RequestInit][]) {
    expect(new URL(call[0]).pathname).toBe("/rest/pug_view/data/compound/2244/JSON");
    expect(new URL(call[0]).searchParams.get("heading")).toBe("Names and Identifiers");
  }
  const post = (fetcher.mock.calls as unknown as [string, RequestInit][])[1][1];
  expect(new Headers(post.headers).get("content-type")).toBe("application/json");
  expect(JSON.parse(post.body as string)).toEqual({ fixture: true });
});

it.each(["GET", "POST"])("retains automatic ListKey polling after a %s request", async method => {
  vi.useFakeTimers();
  const native = { IdentifierList: { CID: [2244, 1983] } };
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ Waiting: { ListKey: "123456789" } }, { status: 202 })).mockResolvedValueOnce(Response.json({ Waiting: { ListKey: "123456789" } }, { status: 202 })).mockResolvedValueOnce(Response.json(native));
  vi.stubGlobal("fetch", fetcher);
  const result = request({ method, path: "/compound/substructure/smiles/CC/JSON", params: { MaxRecords: 2 }, ...(method === "POST" ? { body: { smiles: "CC" } } : {}) });
  await vi.advanceTimersByTimeAsync(4001);
  expect(await result).toEqual({ status: 200, data: native });
  expect(fetcher).toHaveBeenCalledTimes(3);
  for (const [url, init] of fetcher.mock.calls.slice(1) as [string, RequestInit][]) {
    expect(url).toBe("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/listkey/123456789/cids/JSON");
    expect(init.method).toBe("GET"); expect(init.body).toBeUndefined();
  }
});

it.each([{ Waiting: { Message: "pending" } }, { Waiting: { ListKey: "https://example.org" } }])("returns unpollable 202 evidence without consuming its body: %j", async native => {
  const fetcher = vi.fn(async () => Response.json(native, { status: 202 })); vi.stubGlobal("fetch", fetcher);
  expect(await request({ method: "GET", path: "/compound/substructure/smiles/CC/JSON" })).toEqual({ status: 202, data: native });
  expect(fetcher).toHaveBeenCalledOnce();
});

it("supports explicitly skipping polling and retains the Waiting body", async () => {
  const native = { Waiting: { ListKey: "123456" } };
  const fetcher = vi.fn(async () => Response.json(native, { status: 202 })); vi.stubGlobal("fetch", fetcher);
  expect(await (await pubchemFetch("/compound/substructure/smiles/CC/JSON", undefined, { skipPolling: true })).json()).toEqual(native);
  expect(fetcher).toHaveBeenCalledOnce();
});

it("stops polling at the shared deadline without subsequent requests", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => Response.json({ Waiting: { ListKey: "123456" } }, { status: 202 })); vi.stubGlobal("fetch", fetcher);
  const rejected = expect(request({ method: "GET", path: "/compound/substructure/smiles/CC/JSON" })).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(30_001); await rejected;
  const calls = fetcher.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetcher).toHaveBeenCalledTimes(calls); expect(calls).toBeLessThanOrEqual(15);
});

it("retains malformed concise-table evidence on its error path", async () => {
  const native = { Table: { Columns: { Column: ["CID"] }, Row: [{ Cell: [1, 2] }] }, message: "native context" };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(native)));
  await expect(request({ method: "GET", path: "/assay/aid/1/concise/JSON" })).rejects.toMatchObject({ status: 502, data: native });
});

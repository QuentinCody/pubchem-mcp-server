import { expect, it, vi } from "vitest";
import { cellAssayWorkflow } from "./cell-assay";

const run = (get: unknown, query?: unknown, code = cellAssayWorkflow.code) => new Function("api", `return (async () => {${code}})();`)({ get, query });
const links = { rows: [{ CellAccession: "CVCL_0030", AID: 1259 }] };
const concise = { columns: ["CID", "Activity Outcome"], rows: [{ CID: "2244", "Activity Outcome": "Inactive", "Value [uM]": "<0.001" }] };
const properties = { PropertyTable: { Properties: [{ CID: 2244, SMILES: "C[C@H](O)C(=O)O", InChIKey: "retain-full-key", InChI: "retain-full-InChI" }] } };
const registry = { InformationList: { Information: [{ CID: 2244, RegistryID: ["CHEMBL25", "unclassified", "CHEMBL999", "CHEMBL25"] }] } };
function source(changes: Record<number, unknown> = {}) {
  const values = [links, { native_description: "retained" }, concise, properties, registry];
  const get = vi.fn();
  values.forEach((value, index) => { get.mockResolvedValueOnce(index in changes ? changes[index] : value); });
  return get;
}

it("retains the selected row and all identifier candidates without an activity or binding inference", async () => {
  const get = source(); const result = await run(get);
  expect(result).toMatchObject({ step: "compound_handoff", coverage_complete: false,
    compound_selection: { cid: 2244, source_row: concise.rows[0] }, associations: links, concise, properties, registry_ids: registry,
    handoff: { pubchem_cid: 2244, properties: properties.PropertyTable.Properties[0], chembl_registry_candidates: ["CHEMBL25", "CHEMBL999", "CHEMBL25"] } });
  expect(get).toHaveBeenCalledTimes(5);
  expect(get.mock.calls.map(call => call[0])).toEqual([
    "/cell/cellacc/CVCL_0030/aids/JSON", "/assay/aid/1259/description/JSON", "/assay/aid/1259/concise/JSON",
    "/compound/cid/2244/property/InChI,InChIKey,SMILES/JSON", "/compound/cid/2244/xrefs/RegistryID/JSON",
  ]);
});

it.each([{ CellAccession: "CVCL_9999", AID: 1259 }, { CellAccession: "CVCL_0030", AID: 1302 }])("does not follow an unobserved exact association %j", async row => {
  const get = source({ 0: { rows: [row] } });
  expect(await run(get)).toMatchObject({ step: "selected_association_not_observed" });
  expect(get).toHaveBeenCalledTimes(1);
});

it("queries staged native projections and retains their handles", async () => {
  const associations = { __staged: true, data_access_id: "links" }; const table = { __staged: true, data_access_id: "assay" };
  const get = source({ 0: associations, 2: table });
  const query = vi.fn().mockResolvedValueOnce({ results: links.rows }).mockResolvedValueOnce({ results: concise.rows });
  expect(await run(get, query)).toMatchObject({ step: "compound_handoff", associations, concise: table });
  expect(query.mock.calls).toEqual([["links", "SELECT CellAccession, AID FROM rows WHERE CellAccession = 'CVCL_0030' AND AID = 1259 LIMIT 1"], ["assay", "SELECT * FROM rows LIMIT 10"]]);
});

it.each(["", "NA", "001", "2244.5", "9007199254740993", 0, -1, null])("keeps invalid or ambiguous sample CID %j out of downstream requests", async CID => {
  const get = source({ 2: { rows: [{ CID }] } });
  expect(await run(get)).toMatchObject({ step: "no_valid_cid_in_sample" });
  expect(get).toHaveBeenCalledTimes(3);
});

it("does not silently search beyond the declared ten-row sample", async () => {
  const get = source({ 2: { rows: [...Array.from({ length: 10 }, () => ({ CID: "NA" })), ...concise.rows] } });
  expect(await run(get)).toMatchObject({ step: "no_valid_cid_in_sample", sample: { maximum_rows: 10, rows: expect.any(Array) } });
  expect(get).toHaveBeenCalledTimes(3);
});

it.each([
  [3, { PropertyTable: { Properties: [{ CID: 999 }] } }, "compound_identity_mismatch"],
  [3, { PropertyTable: { Properties: [null] } }, "compound_identity_mismatch"],
  [3, { PropertyTable: { Properties: [properties.PropertyTable.Properties[0], properties.PropertyTable.Properties[0]] } }, "compound_identity_mismatch"],
  [4, { InformationList: { Information: [{ CID: 999, RegistryID: ["CHEMBL25"] }] } }, "registry_identity_mismatch"],
  [4, { InformationList: { Information: [null] } }, "registry_identity_mismatch"],
  [4, { InformationList: { Information: [{ CID: 2244, RegistryID: [null] }] } }, "registry_identity_mismatch"],
])("rejects mismatched or malformed identity at step %i", async (index, value, step) => {
  const result = await run(source({ [Number(index)]: value }));
  expect(result).toMatchObject({ step, __api_error: true });
  expect(result.handoff).toBeUndefined();
});

it.each([0, 1, 2, 3, 4])("keeps prior evidence and stops on API failure at request %i", async index => {
  const cause = { __api_error: true, status: 503, data: { Fault: { detail: "native error" } } };
  const get = source({ [index]: cause }); const result = await run(get);
  expect(result).toMatchObject({ __api_error: true, status: 503, cause });
  expect(get).toHaveBeenCalledTimes(index + 1);
});

it.each([3, 4])("retains a staged structure or registry response at request %i", async index => {
  const staged = { __staged: true, data_access_id: "large-identity" };
  const get = source({ [index]: staged }); const result = await run(get);
  expect(result[index === 3 ? "properties" : "registry_ids"]).toEqual(staged);
  expect(result.handoff).toBeUndefined(); expect(get).toHaveBeenCalledTimes(index + 1);
});

it.each([{ CID: 2244 }, { ...properties.PropertyTable.Properties[0], SMILES: " " }])("reports unavailable structure fields before proposing a handoff", async property => {
  const get = source({ 3: { PropertyTable: { Properties: [property] } } });
  const result = await run(get);
  expect(result).toMatchObject({ step: "structure_fields_missing", missing: expect.arrayContaining(["SMILES"]) });
  expect(result.handoff).toBeUndefined(); expect(get).toHaveBeenCalledTimes(4);
});

it("returns explicit SQL failures and rejects invalid selection before I/O", async () => {
  const get = source({ 0: { __staged: true, data_access_id: "links" } });
  expect(await run(get, vi.fn().mockRejectedValue(new Error("missing table")))).toMatchObject({ __api_error: true, step: "association_query_failed" });
  const untouched = vi.fn();
  await expect(run(untouched, undefined, cellAssayWorkflow.code.replace("CVCL_0030", "CVCL_0030' OR 1=1"))).rejects.toThrow("Invalid cell accession");
  expect(untouched).not.toHaveBeenCalled();
});

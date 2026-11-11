import type { WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";

export const cellAssayWorkflow: WorkflowRecipe = {
  title: "Cellosaurus accession to assay and compound evidence",
  description: "Start with an accession checked in Cellosaurus. Verify one explicitly selected AID belongs to that exact cell accession, retain its description and complete concise result, then sample one valid CID from at most ten returned rows. Fetch its full InChI/InChIKey/stereochemical SMILES and registry identifiers for a separate ChEMBL/BindingDB handoff. The example uses HeLa and AID 1259; membership does not establish activity or binding. The CID sample is not ranked or restricted to active outcomes. Staged native evidence remains available through pubchem_get_schema/pubchem_query_data. See the server README for downstream structure checks.",
  keywords: ["Cellosaurus", "cell", "assay", "compound", "ChEMBL", "BindingDB", "identity"],
  code: `const selection = {cell_accession: "CVCL_0030", aid: 1259};
if (!/^CVCL_[A-Z0-9]{4}$/.test(selection.cell_accession) || !Number.isSafeInteger(selection.aid) || selection.aid < 1) throw new Error("Invalid cell accession or AID");
const evidence = {selection, coverage_complete: false};
const read = async (path) => {
  try { return await api.get(path); }
  catch (error) { return {__api_error: true, message: error.message, status: error.status, data: error.data}; }
};
const unavailable = value => !value || value.__api_error || value.__stage_error;
const failure = (step, cause) => ({...evidence, step, __api_error: true, status: cause?.status || 502, message: "Evidence workflow stopped: " + step, cause});
evidence.associations = await read("/cell/cellacc/" + selection.cell_accession + "/aids/JSON");
if (unavailable(evidence.associations)) return failure("association_unavailable", evidence.associations);
let links;
try {
  links = evidence.associations.__staged
    ? (await api.query(evidence.associations.data_access_id, "SELECT CellAccession, AID FROM rows WHERE CellAccession = '" + selection.cell_accession + "' AND AID = " + selection.aid + " LIMIT 1")).results
    : evidence.associations.rows;
} catch (error) { return failure("association_query_failed", {message: error.message}); }
if (!Array.isArray(links)) return failure("association_shape_unknown");
const link = links.find(row => row.CellAccession === selection.cell_accession && row.AID === selection.aid);
if (!link) return {...evidence, step: "selected_association_not_observed"};
evidence.association_match = link;
evidence.description = await read("/assay/aid/" + selection.aid + "/description/JSON");
if (unavailable(evidence.description)) return failure("description_unavailable", evidence.description);
evidence.concise = await read("/assay/aid/" + selection.aid + "/concise/JSON");
if (unavailable(evidence.concise)) return failure("concise_unavailable", evidence.concise);
let sample;
try {
  sample = evidence.concise.__staged
    ? (await api.query(evidence.concise.data_access_id, "SELECT * FROM rows LIMIT 10")).results
    : evidence.concise.rows?.slice(0, 10);
} catch (error) { return failure("concise_query_failed", {message: error.message}); }
if (!Array.isArray(sample)) return failure("concise_shape_unknown");
evidence.sample = {rows: sample, maximum_rows: 10, rule: "First valid CID in this bounded, unranked sample; no outcome filter or stable ordering claim"};
const selected = sample.find(row => typeof row.CID === "number" ? Number.isSafeInteger(row.CID) && row.CID > 0 : typeof row.CID === "string" && /^[1-9][0-9]*$/.test(row.CID) && Number.isSafeInteger(Number(row.CID)));
if (!selected) return {...evidence, step: "no_valid_cid_in_sample"};
const cid = Number(selected.CID);
evidence.compound_selection = {cid, source_row: selected};
evidence.properties = await read("/compound/cid/" + cid + "/property/InChI,InChIKey,SMILES/JSON");
if (unavailable(evidence.properties)) return failure("properties_unavailable", evidence.properties);
if (evidence.properties.__staged) return {...evidence, step: "inspect_properties"};
const properties = evidence.properties.PropertyTable?.Properties;
if (!Array.isArray(properties) || properties.length !== 1 || properties[0]?.CID !== cid) return failure("compound_identity_mismatch");
const missing = ["InChI", "InChIKey", "SMILES"].filter(field => typeof properties[0][field] !== "string" || !properties[0][field].trim());
if (missing.length) return {...evidence, step: "structure_fields_missing", missing};
evidence.registry_ids = await read("/compound/cid/" + cid + "/xrefs/RegistryID/JSON");
if (unavailable(evidence.registry_ids)) return failure("registry_unavailable", evidence.registry_ids);
if (evidence.registry_ids.__staged) return {...evidence, step: "inspect_registry_ids"};
const information = evidence.registry_ids.InformationList?.Information;
if (!Array.isArray(information) || information.length !== 1 || information[0]?.CID !== cid || !Array.isArray(information[0].RegistryID) || !information[0].RegistryID.every(id => typeof id === "string")) return failure("registry_identity_mismatch");
return {...evidence, step: "compound_handoff", handoff: {
  pubchem_cid: cid, properties: properties[0],
  chembl_registry_candidates: information[0].RegistryID.filter(id => /^CHEMBL[0-9]+$/.test(id)),
  interpretation: "Retain all candidates. Compare full standard InChI and InChIKey with ChEMBL molecule records before joining activities. BindingDB getTargetByCompound returns similarity candidates, even with cutoff 1; independently verify each candidate structure. Neither mapping establishes cell activity, binding or a shared experimental sample."
}};`,
};

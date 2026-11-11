import type { ApiEndpoint } from "@bio-mcp/shared/codemode/catalog";

// https://pubchem.ncbi.nlm.nih.gov/pcfe/docs/markdown/pug-rest.md
export const postEndpoints: ApiEndpoint[] = [
  {
    method: "POST", path: "/compound/fastsimilarity_2d/smiles/cids/JSON", category: "similarity",
    summary: "Find similar compounds with a form-encoded SMILES input, preserving special characters",
    body: { contentType: "application/x-www-form-urlencoded", description: "Pass {smiles: string} to api.post; the adapter encodes the form." },
    queryParams: [
      { name: "Threshold", type: "number", required: false, description: "Similarity threshold, 0–100", default: 90 },
      { name: "MaxRecords", type: "number", required: false, description: "Maximum returned compound IDs; request a bounded subset" },
    ],
    example: "return await api.post('/compound/fastsimilarity_2d/smiles/cids/JSON', { smiles: 'C1C[CH+]1' }, { Threshold: 90, MaxRecords: 10 });",
  },
  {
    method: "POST", path: "/compound/inchi/cids/JSON", category: "compound",
    summary: "Resolve InChI to compound IDs using a form body instead of URL path delimiters",
    body: { contentType: "application/x-www-form-urlencoded", description: "Pass {inchi: string}; preserve the complete InChI including slashes and stereochemistry." },
    example: "return await api.post('/compound/inchi/cids/JSON', { inchi: 'InChI=1S/C3H8/c1-3-2/h3H2,1-2H3' });",
  },
  {
    method: "POST", path: "/compound/cid/property/{properties}/JSON", category: "compound",
    summary: "Retrieve selected properties for compound IDs passed as a form-encoded batch",
    pathParams: [{ name: "properties", type: "string", required: true, description: "Comma-separated property names, e.g. MolecularFormula,MolecularWeight" }],
    body: { contentType: "application/x-www-form-urlencoded", description: "Pass {cid: '2244,1983'} or {cid: [2244,1983]}; keep batches bounded." },
    example: "return await api.post('/compound/cid/property/MolecularFormula,MolecularWeight/JSON', { cid: [2244, 1983] });",
  },
];

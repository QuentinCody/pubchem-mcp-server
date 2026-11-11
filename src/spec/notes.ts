import { targetNotes } from "./targets";

export const pubchemNotes = targetNotes +
  "- PUG REST URL pattern: /pug/{domain}/{namespace}/{identifiers}/{operation}/{output}\n" +
  "- All paths are relative to PUG REST, except /pug_view/* which route to PUG View. Formats are included in catalog paths; IdentifierTypes returns text.\n" +
  "- No authentication required. Rate limit: 5 requests/second; add 200ms delay between requests in loops.\n" +
  "- Compound identifiers: CID (integer), name, SMILES or InChIKey.\n" +
  "- Common properties (comma-separated): MolecularWeight, MolecularFormula, XLogP, TPSA, HBondDonorCount, HBondAcceptorCount, RotatableBondCount, ExactMass, MonoisotopicMass, InChI, InChIKey, CanonicalSMILES, IsomericSMILES, IUPACName, Charge, Complexity, HeavyAtomCount, AtomStereoCount, BondStereoCount, CovalentUnitCount.\n" +
  "- Similarity/substructure searches may return 202 with a ListKey; automatic polling shares a 30-second deadline with the response body. Unpollable Waiting responses remain visible. Prefer documented fast synchronous search variants.\n" +
  "- PUG REST api.post sends form fields: api.post('/compound/fastsimilarity_2d/smiles/cids/JSON', { smiles: 'C1C[CH+]1' }, { Threshold: 90, MaxRecords: 10 }). Scalar arrays become comma-separated values; query options remain separate.\n" +
  "- UTF-8 reads are capped at 8 MiB; select smaller subsets when exceeded. Complete tool envelopes over 30KB stage with citations; use query_data/get_schema and payloads.root_json or content_chunks for full evidence.\n" +
  "- PUG View returns compound records with sections such as Safety and Pharmacology.\n" +
  "- Substances (SIDs) are depositor-provided records; compounds (CIDs) are standardized.\n" +
  "- Maximum 100 CIDs per property request, 100 SIDs per substance request.";

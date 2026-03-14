/**
 * PubChem PUG REST + PUG View API catalog — hand-built from
 * https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest and
 * https://pubchem.ncbi.nlm.nih.gov/docs/pug-view
 *
 * Covers ~30 endpoints across 6 categories: compound, assay, substance,
 * property, similarity, and xref.
 *
 * Virtual path convention:
 *   - PUG REST paths start with /compound, /assay, /substance
 *   - PUG View paths start with /pug_view
 *   - The api-adapter routes /pug_view/* to the PUG View base URL,
 *     everything else to the PUG REST base URL.
 *   - All paths end with /JSON to request JSON output.
 */

import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const pubchemCatalog: ApiCatalog = {
    name: "PubChem PUG REST",
    baseUrl: "https://pubchem.ncbi.nlm.nih.gov/rest/pug",
    version: "1.0",
    auth: "none",
    endpointCount: 31,
    notes:
        "- PUG REST URL pattern: /pug/{domain}/{namespace}/{identifiers}/{operation}/{output}\n" +
        "- All paths in this catalog are relative to the PUG REST base URL, except /pug_view/* which route to PUG View\n" +
        "- Append /JSON to all paths for JSON output (already included in catalog paths)\n" +
        "- Rate limit: 5 requests/second — add 200ms delay between requests in loops\n" +
        "- No authentication required\n" +
        "- Compound identifiers: CID (integer), name (string), SMILES (string), InChIKey (string)\n" +
        "- Common properties (comma-separated for property endpoints): MolecularWeight, MolecularFormula, XLogP, TPSA, " +
        "HBondDonorCount, HBondAcceptorCount, RotatableBondCount, ExactMass, MonoisotopicMass, " +
        "InChI, InChIKey, CanonicalSMILES, IsomericSMILES, IUPACName, Charge, Complexity, " +
        "HeavyAtomCount, AtomStereoCount, BondStereoCount, CovalentUnitCount\n" +
        "- Multiple properties can be requested comma-separated: 'MolecularWeight,XLogP,TPSA'\n" +
        "- Similarity/substructure searches may return 202 with a ListKey for async polling — the http client handles this automatically\n" +
        "- For SMILES with special characters, URL-encode them or use POST variants\n" +
        "- PUG View returns richly structured compound records with sections (Safety, Pharmacology, etc.)\n" +
        "- Substance (SID) vs Compound (CID): Substances are depositor-provided records, Compounds are standardized\n" +
        "- Maximum 100 CIDs per property request, 100 SIDs per substance request",
    endpoints: [
        // === Compound Lookup ===
        {
            method: "GET",
            path: "/compound/name/{name}/JSON",
            summary: "Get compound record by name (returns full PUG compound data)",
            category: "compound",
            pathParams: [
                {
                    name: "name",
                    type: "string",
                    required: true,
                    description: "Compound name (e.g. aspirin, ibuprofen, glucose)",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/cid/{cid}/JSON",
            summary: "Get compound record by PubChem CID",
            category: "compound",
            pathParams: [
                {
                    name: "cid",
                    type: "number",
                    required: true,
                    description: "PubChem Compound ID (e.g. 2244 for aspirin)",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/smiles/{smiles}/JSON",
            summary: "Get compound record by SMILES string",
            category: "compound",
            pathParams: [
                {
                    name: "smiles",
                    type: "string",
                    required: true,
                    description:
                        "SMILES string (URL-encode special chars, e.g. CC(=O)Oc1ccccc1C(=O)O for aspirin)",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/inchikey/{inchikey}/JSON",
            summary: "Get compound record by InChIKey",
            category: "compound",
            pathParams: [
                {
                    name: "inchikey",
                    type: "string",
                    required: true,
                    description:
                        "InChIKey string (e.g. BSYNRYMUTXBXSQ-UHFFFAOYSA-N for aspirin)",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/cid/{cids}/cids/JSON",
            summary: "Get CIDs for a comma-separated list of CIDs (useful for validating CIDs)",
            category: "compound",
            pathParams: [
                {
                    name: "cids",
                    type: "string",
                    required: true,
                    description: "Comma-separated CIDs (e.g. 2244,3672)",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/name/{name}/cids/JSON",
            summary: "Get CID(s) for a compound name (lightweight — returns only CIDs)",
            category: "compound",
            pathParams: [
                {
                    name: "name",
                    type: "string",
                    required: true,
                    description: "Compound name",
                },
            ],
            queryParams: [
                {
                    name: "name_type",
                    type: "string",
                    required: false,
                    description: "Name matching type",
                    enum: ["word", "complete"],
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/name/{name}/description/JSON",
            summary: "Get textual descriptions for a compound by name. Returns InformationList.Information[] — iterate to find entries with a Description field (not all entries have one).",
            category: "compound",
            pathParams: [
                {
                    name: "name",
                    type: "string",
                    required: true,
                    description: "Compound name",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/cid/{cid}/description/JSON",
            summary: "Get textual descriptions for a compound by CID",
            category: "compound",
            pathParams: [
                {
                    name: "cid",
                    type: "number",
                    required: true,
                    description: "PubChem Compound ID",
                },
            ],
        },

        // === Synonyms ===
        {
            method: "GET",
            path: "/compound/name/{name}/synonyms/JSON",
            summary: "Get all synonyms/trade names for a compound by name",
            category: "compound",
            pathParams: [
                {
                    name: "name",
                    type: "string",
                    required: true,
                    description: "Compound name",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/cid/{cid}/synonyms/JSON",
            summary: "Get all synonyms/trade names for a compound by CID",
            category: "compound",
            pathParams: [
                {
                    name: "cid",
                    type: "number",
                    required: true,
                    description: "PubChem Compound ID",
                },
            ],
        },

        // === Properties ===
        {
            method: "GET",
            path: "/compound/name/{name}/property/{properties}/JSON",
            summary:
                "Get specific computed properties for a compound by name (MolecularWeight, XLogP, TPSA, etc.)",
            category: "property",
            pathParams: [
                {
                    name: "name",
                    type: "string",
                    required: true,
                    description: "Compound name",
                },
                {
                    name: "properties",
                    type: "string",
                    required: true,
                    description:
                        "Comma-separated property names (e.g. MolecularWeight,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount)",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/cid/{cid}/property/{properties}/JSON",
            summary: "Get specific computed properties for a compound by CID",
            category: "property",
            pathParams: [
                {
                    name: "cid",
                    type: "number",
                    required: true,
                    description: "PubChem Compound ID",
                },
                {
                    name: "properties",
                    type: "string",
                    required: true,
                    description:
                        "Comma-separated property names (e.g. MolecularFormula,MolecularWeight,InChIKey,CanonicalSMILES,IUPACName)",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/smiles/{smiles}/property/{properties}/JSON",
            summary: "Get specific computed properties for a compound by SMILES",
            category: "property",
            pathParams: [
                {
                    name: "smiles",
                    type: "string",
                    required: true,
                    description: "SMILES string (URL-encode special chars)",
                },
                {
                    name: "properties",
                    type: "string",
                    required: true,
                    description: "Comma-separated property names",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/cid/{cids}/property/{properties}/JSON",
            summary:
                "Get properties for multiple compounds by comma-separated CIDs (max 100)",
            category: "property",
            pathParams: [
                {
                    name: "cids",
                    type: "string",
                    required: true,
                    description: "Comma-separated CIDs (e.g. 2244,3672,2519)",
                },
                {
                    name: "properties",
                    type: "string",
                    required: true,
                    description: "Comma-separated property names",
                },
            ],
        },

        // === Cross-references ===
        {
            method: "GET",
            path: "/compound/name/{name}/xrefs/RegistryID/JSON",
            summary:
                "Get external registry cross-references for a compound (CAS, ChEBI, DrugBank, etc.)",
            category: "xref",
            pathParams: [
                {
                    name: "name",
                    type: "string",
                    required: true,
                    description: "Compound name",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/cid/{cid}/xrefs/RegistryID/JSON",
            summary: "Get external registry cross-references for a compound by CID",
            category: "xref",
            pathParams: [
                {
                    name: "cid",
                    type: "number",
                    required: true,
                    description: "PubChem Compound ID",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/name/{name}/xrefs/PatentID/JSON",
            summary: "Get patent cross-references for a compound by name",
            category: "xref",
            pathParams: [
                {
                    name: "name",
                    type: "string",
                    required: true,
                    description: "Compound name",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/cid/{cid}/xrefs/PMID/JSON",
            summary: "Get PubMed article cross-references for a compound by CID",
            category: "xref",
            pathParams: [
                {
                    name: "cid",
                    type: "number",
                    required: true,
                    description: "PubChem Compound ID",
                },
            ],
        },

        // === Similarity Search ===
        {
            method: "GET",
            path: "/compound/fastsimilarity_2d/smiles/{smiles}/cids/JSON",
            summary:
                "Fast 2D similarity search by SMILES — returns similar compound CIDs (Tanimoto >= 0.9 by default)",
            category: "similarity",
            pathParams: [
                {
                    name: "smiles",
                    type: "string",
                    required: true,
                    description: "Query SMILES string",
                },
            ],
            queryParams: [
                {
                    name: "Threshold",
                    type: "number",
                    required: false,
                    description:
                        "Tanimoto similarity threshold (0-100, default 90 = 0.9)",
                },
                {
                    name: "MaxRecords",
                    type: "number",
                    required: false,
                    description: "Maximum number of results to return",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/fastsimilarity_2d/cid/{cid}/cids/JSON",
            summary: "Fast 2D similarity search by CID — returns similar compound CIDs",
            category: "similarity",
            pathParams: [
                {
                    name: "cid",
                    type: "number",
                    required: true,
                    description: "Query compound CID",
                },
            ],
            queryParams: [
                {
                    name: "Threshold",
                    type: "number",
                    required: false,
                    description: "Tanimoto similarity threshold (0-100, default 90)",
                },
                {
                    name: "MaxRecords",
                    type: "number",
                    required: false,
                    description: "Maximum results",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/fastsimilarity_2d/smiles/{smiles}/property/{properties}/JSON",
            summary:
                "Fast 2D similarity search by SMILES with property retrieval for hits",
            category: "similarity",
            pathParams: [
                {
                    name: "smiles",
                    type: "string",
                    required: true,
                    description: "Query SMILES string",
                },
                {
                    name: "properties",
                    type: "string",
                    required: true,
                    description: "Comma-separated property names to retrieve for each hit",
                },
            ],
            queryParams: [
                {
                    name: "Threshold",
                    type: "number",
                    required: false,
                    description: "Tanimoto threshold (0-100)",
                },
                {
                    name: "MaxRecords",
                    type: "number",
                    required: false,
                    description: "Maximum results",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/substructure/smiles/{smiles}/cids/JSON",
            summary:
                "Substructure search by SMILES — find compounds containing the query substructure (async, may return 202)",
            category: "similarity",
            pathParams: [
                {
                    name: "smiles",
                    type: "string",
                    required: true,
                    description: "Query SMILES substructure",
                },
            ],
            queryParams: [
                {
                    name: "MaxRecords",
                    type: "number",
                    required: false,
                    description: "Maximum number of results",
                },
            ],
        },
        {
            method: "GET",
            path: "/compound/superstructure/smiles/{smiles}/cids/JSON",
            summary:
                "Superstructure search by SMILES — find compounds that are substructures of the query",
            category: "similarity",
            pathParams: [
                {
                    name: "smiles",
                    type: "string",
                    required: true,
                    description: "Query SMILES structure",
                },
            ],
            queryParams: [
                {
                    name: "MaxRecords",
                    type: "number",
                    required: false,
                    description: "Maximum number of results",
                },
            ],
        },

        // === Assay ===
        {
            method: "GET",
            path: "/assay/aid/{aid}/JSON",
            summary: "Get bioassay record by AID (assay ID)",
            category: "assay",
            pathParams: [
                {
                    name: "aid",
                    type: "number",
                    required: true,
                    description: "PubChem BioAssay ID",
                },
            ],
        },
        {
            method: "GET",
            path: "/assay/aid/{aid}/description/JSON",
            summary: "Get bioassay description/metadata by AID",
            category: "assay",
            pathParams: [
                {
                    name: "aid",
                    type: "number",
                    required: true,
                    description: "PubChem BioAssay ID",
                },
            ],
        },
        {
            method: "GET",
            path: "/assay/target/genesymbol/{symbol}/aids/JSON",
            summary: "Find bioassay AIDs by gene target symbol (e.g. BRAF, EGFR)",
            category: "assay",
            pathParams: [
                {
                    name: "symbol",
                    type: "string",
                    required: true,
                    description: "Gene symbol (e.g. BRAF, EGFR, TP53)",
                },
            ],
        },
        {
            method: "GET",
            path: "/assay/target/geneid/{geneid}/aids/JSON",
            summary: "Find bioassay AIDs by NCBI Gene ID",
            category: "assay",
            pathParams: [
                {
                    name: "geneid",
                    type: "number",
                    required: true,
                    description: "NCBI Gene ID (e.g. 673 for BRAF)",
                },
            ],
        },
        {
            method: "GET",
            path: "/assay/type/ontology/{heading}/aids/JSON",
            summary: "Find bioassay AIDs by assay classification/ontology heading",
            category: "assay",
            pathParams: [
                {
                    name: "heading",
                    type: "string",
                    required: true,
                    description:
                        "Assay ontology heading (e.g. cytotoxicity, kinase, cell viability)",
                },
            ],
        },

        // === Substance ===
        {
            method: "GET",
            path: "/substance/sid/{sid}/JSON",
            summary: "Get substance record by SID (Substance ID)",
            category: "substance",
            pathParams: [
                {
                    name: "sid",
                    type: "number",
                    required: true,
                    description: "PubChem Substance ID",
                },
            ],
        },
        {
            method: "GET",
            path: "/substance/sid/{sid}/cids/JSON",
            summary:
                "Get compound CIDs associated with a substance (maps SID to standardized CIDs)",
            category: "substance",
            pathParams: [
                {
                    name: "sid",
                    type: "number",
                    required: true,
                    description: "PubChem Substance ID",
                },
            ],
        },

        // === PUG View (detailed compound records) ===
        {
            method: "GET",
            path: "/pug_view/data/compound/{cid}/JSON",
            summary:
                "Get full compound record from PUG View with all sections (Safety, Pharmacology, Toxicity, Literature, etc.)",
            category: "compound",
            pathParams: [
                {
                    name: "cid",
                    type: "number",
                    required: true,
                    description: "PubChem Compound ID",
                },
            ],
            queryParams: [
                {
                    name: "heading",
                    type: "string",
                    required: false,
                    description:
                        "Filter to specific section heading (e.g. Pharmacology and Biochemistry, Safety and Hazards)",
                },
            ],
        },
    ],
};

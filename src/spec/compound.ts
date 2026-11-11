import type { ApiEndpoint } from "@bio-mcp/shared/codemode/catalog";

export const compoundEndpoints: ApiEndpoint[] = [
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

];

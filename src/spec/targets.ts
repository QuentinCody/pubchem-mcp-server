import type { ApiEndpoint } from "@bio-mcp/shared/codemode/catalog";

// Provider reference: https://pubchem.ncbi.nlm.nih.gov/pcfe/docs/markdown/pug-rest-tutorial.md
const domains = [
  { domain: "gene", namespace: "geneid", output: "geneids", id: "1956", external: "HGNC:3236", type: "HGNC ID" },
  { domain: "protein", namespace: "accession", output: "accessions", id: "P00533", external: "CHEMBL203", type: "ChEMBL Target ID" },
  { domain: "taxonomy", namespace: "taxid", output: "taxids", id: "9606", external: "6MB3T", type: "COL ID" },
  { domain: "cell", namespace: "cellid", output: "cellids", id: "31", external: "C18096", type: "NCI Thesaurus Code" },
];
const identifierType: ApiEndpoint["queryParams"] = [{ name: "identifier_type", type: "string", required: false, description: "External namespace from IdentifierTypes; specify explicitly to avoid ambiguous numeric identifiers" }];
const idParam: ApiEndpoint["pathParams"] = [{ name: "id", type: "string", required: true, description: "Identifier in the namespace specified by this path" }];

export const targetNotes =
  "- Gene, protein, taxonomy and cell external identifiers support forward/reverse mappings; discover namespaces with /IdentifierTypes/{domain}/TXT (plain text, not JSON). Specify identifier_type explicitly; preserve multiple mappings.\n" +
  "- Gene symbols default to human; supply a taxonomy ID for another organism. PubChem cell IDs differ from Cellosaurus accessions: use cellacc for CVCL_0030 (HeLa), cellid for 31 (MCF-7).\n" +
  "- Target or cell assay membership does not establish binding, inhibition or causation. Inspect assay descriptions and concise activity outcomes before interpreting compounds.\n" +
  "- Concise assay Table responses normalize to {source_format, columns, rows, native}: rows have named provider columns instead of positional Cell arrays. native retains the complete provider JSON, including row and table context.\n" +
  "- Gene/protein/cell aids responses normalize to {source_format, rows, native}, one numeric AID per row with its source entity ID. native retains empty-association entities, duplicates and all source metadata.\n";

export const targetEndpoints: ApiEndpoint[] = [
  {
    method: "GET", path: "/IdentifierTypes/{domain}/TXT", category: "identifier", summary: "Discover supported external identifier namespaces for a target domain (plain text)",
    pathParams: [{ name: "domain", type: "string", required: true, description: "gene, protein, taxonomy or cell" }],
    example: "return await api.get('/IdentifierTypes/protein/TXT');",
  },
  ...domains.flatMap(({ domain, namespace, output, id, external, type }): ApiEndpoint[] => [
    {
      method: "GET", path: `/${domain}/identifier/{id}/${output}/JSON`, category: domain, summary: `Map an external ${domain} identifier to PubChem identifiers; retain all matches`,
      pathParams: idParam, queryParams: identifierType,
      example: `return await api.get('/${domain}/identifier/${external}/${output}/JSON', { identifier_type: '${type}' });`,
    },
    {
      method: "GET", path: `/${domain}/${namespace}/{id}/identifiers/JSON`, category: domain, summary: `Get external database identifiers for a ${domain}; optionally filter by namespace`,
      pathParams: idParam, queryParams: identifierType,
      example: `return await api.get('/${domain}/${namespace}/${id}/identifiers/JSON', { identifier_type: '${type}' });`,
    },
    {
      method: "GET", path: `/${domain}/${namespace}/{id}/summary/JSON`, category: domain, summary: `Get a ${domain} summary with provider identifiers and biological context`, pathParams: idParam,
      example: `return await api.get('/${domain}/${namespace}/${id}/summary/JSON');`,
    },
  ]),
  {
    method: "GET", path: "/gene/genesymbol/{symbol}/{taxid}/summary/JSON", category: "gene", summary: "Resolve a gene symbol in an explicit organism; avoid the default human assumption",
    pathParams: [{ name: "symbol", type: "string", required: true, description: "Gene symbol, e.g. Egfr" }, { name: "taxid", type: "number", required: true, description: "NCBI taxonomy ID; 10090 mouse, 9606 human" }],
    example: "return await api.get('/gene/genesymbol/Egfr/10090/summary/JSON');",
  },
  ...["summary", "aids"].map((operation): ApiEndpoint => ({
    method: "GET", path: `/cell/cellacc/{id}/${operation}/JSON`, category: "cell", summary: operation === "summary" ? "Get a cell-line summary from a Cellosaurus or ChEMBL cell accession" : "Find assays associated with a cell accession; inspect assay descriptions and outcomes", pathParams: idParam,
    example: `return await api.get('/cell/cellacc/CVCL_0030/${operation}/JSON');`,
  })),
  ...domains.filter(d => d.domain === "gene" || d.domain === "protein").map(({ domain, namespace, id }): ApiEndpoint => ({
    method: "GET", path: `/${domain}/${namespace}/{id}/aids/JSON`, category: domain, summary: `Find assays associated with a ${domain}; membership is not proof of activity`, pathParams: idParam,
    example: `return await api.get('/${domain}/${namespace}/${id}/aids/JSON');`,
  })),
  {
    method: "GET", path: "/assay/aid/{id}/concise/JSON", category: "assay", summary: "Get concise assay activity records and outcomes; large responses auto-stage for SQL", pathParams: idParam,
    example: "return await api.get('/assay/aid/1/concise/JSON');",
  },
];

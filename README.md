# PubChem MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream PubChem API in natural language. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

The server is deployed and ready at:

```
https://pubchem-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "pubchem": {
      "command": "npx",
      "args": ["mcp-remote", "https://pubchem-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8828/mcp` (start it with `./scripts/dev-servers.sh pubchem`):

```json
{
  "mcpServers": {
    "pubchem-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8828/mcp"]
    }
  }
}
```

## Tools

- `pubchem_search` — discover available API operations (Code Mode catalog search, 53 endpoints)
- `pubchem_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `pubchem_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `pubchem_get_schema` — inspect the inferred schema of a staged dataset

All four tools also register their `mcp_pubchem_*` aliases. Code Mode discovery,
isolated JavaScript execution and in-band SQL remain available. Complete tool
responses over 30KB, including composed program results and SQL pages, stage in
the existing Durable Object and return a `data_access_id` with `_staging` metadata.

Every tool returns `content` and `structuredContent`, with verifiable citations;
failures also set `isError`. Native API error evidence survives staging. Use
`pubchem_get_schema` before querying tables. `payloads.root_json` preserves the
complete canonical response; a `__CHUNKED__:` reference points to ordered
`content_chunks` when necessary. Large query pages can themselves stage.

## Target identifiers and cell-line assays

The [PUG REST tutorial](https://pubchem.ncbi.nlm.nih.gov/pcfe/docs/markdown/pug-rest-tutorial.md)
documents forward and reverse external identifier mappings for genes, proteins,
organisms and cells. Discover valid namespaces with `/IdentifierTypes/protein/TXT`
(or `gene`, `taxonomy`, `cell`); this endpoint returns plain text.

```javascript
return await api.get('/protein/identifier/CHEMBL203/accessions/JSON', {
  identifier_type: 'ChEMBL Target ID'
}); // P00533, human EGFR
```

Set `identifier_type` explicitly, especially for numeric IDs, and keep all
matches. Reverse mappings use `/protein/accession/P00533/identifiers/JSON`;
the corresponding gene, taxonomy and cell namespaces are `geneid`, `taxid`
and `cellid`. Summaries use the same paths with `summary` instead of `identifiers`.
Gene-symbol queries default to human; `/gene/genesymbol/Egfr/10090/summary/JSON`
selects mouse explicitly.

For a Cellosaurus accession, query `/cell/cellacc/CVCL_0030/summary/JSON` (HeLa),
then `/cell/cellacc/CVCL_0030/aids/JSON` to discover assays. Select an AID and
inspect its existing `description` route plus `/assay/aid/{id}/concise/JSON`
for activity outcomes. A cell's PubChem numeric ID is a different namespace:
cell `31`, for example, is MCF-7. Assay membership alone does not establish
compound activity, target binding, or inhibition. Large assay responses stage
for SQL rather than filling the MCP response.

Concise assay responses normalize the provider's positional `Table.Row[].Cell`
arrays into `{source_format, columns, rows, native}`. Each row uses the original column
names, including units; values and missing entries remain unchanged. Inspect
the staged schema for SQL column names. Gene/protein/cell `aids` responses become
`{source_format, rows, native}`, one numeric AID per row alongside its source entity ID.
`native` retains the entire provider JSON, including extra row/table fields,
duplicate associations and entities with no assays. Other response shapes stay intact.

PUG REST POSTs use the provider's documented form encoding. The JavaScript body
is an object of scalar fields or scalar arrays (joined with commas); query options
remain separate. Special characters are encoded once:

```javascript
return await api.post('/compound/fastsimilarity_2d/smiles/cids/JSON', {
  smiles: 'C1C[CH+]1'
}, { Threshold: 90, MaxRecords: 10 });
```

UTF-8 responses are limited to 8 MiB and a 30-second deadline covering transport,
retries, automatic legacy ListKey polling and body reads. Text preserves BOM,
line endings and Unicode. Malformed JSON and invalid assay shapes return errors
with available native evidence. These bounds apply locally, independently of
PubChem's own limits; narrower requests can avoid hitting them.

Keep requests below five per second. For offline mapping at scale, the provider
also publishes [target identifier files](https://ftp.ncbi.nlm.nih.gov/pubchem/Target/).

## Cellosaurus → assay → ChEMBL/BindingDB example

Research question: what outcome was reported for a selected compound in a named
cell line, and what separate bioactivity evidence can be linked to its structure?

1. On `cellosaurus_execute`, inspect the accession and exact PubChem cross-reference:

   ```javascript
   return await api.get('/cell-line/CVCL_0030/context', {
     xref_database: 'PubChem_Cell_line', xref_accession: 'CVCL_0030'
   });
   ```

   Retain the native record, species, warnings, accession resolution, release
   observations and citation. Check the returned xref result; an input accession
   or a similar cell name does not establish the join.
2. Discover **Cellosaurus accession to assay and compound evidence** with
   `pubchem_search`, category `workflows`, and run its returned code with
   `pubchem_execute`. Edit its explicit accession/AID selection as needed. The
   example checks HeLa/AID 1259 membership before fetching description/concise
   data. It then selects the first valid CID in an unranked sample of at most ten
   returned rows, including inactive outcomes. This selection is for demonstrating
   the handoff, not identifying an effective compound. The workflow makes at most
   five provider requests and does not fan out over candidate compounds.
3. Keep every returned source object or staged handle. For complete assay rows,
   inspect `pubchem_get_schema`, then query the `rows` table with
   `pubchem_query_data`; inspect `payloads`/`content_chunks` for the original
   complete envelope. Preserve SID/CID, endpoint, outcome, qualifier, unit and
   assay description wherever supplied. No valid CID in the sample is reported
   explicitly and says nothing about other rows or RNAi assay evidence.
4. Use `handoff.properties` and **all** `chembl_registry_candidates` from the
   selected CID. Registry labels are candidates, not verified chemical identity.
   On `chembl_search`, discover **Compare PubChem structure identifiers before
   ChEMBL activity lookup**. Replace its independent aspirin reference example
   with the selected PubChem CID, full `InChI`, full `InChIKey` and one candidate
   ChEMBL molecule ID. The recipe compares both complete structure identifiers
   before reading one activity page, retains all native fields and checks the
   molecule filter and observed release before/after. Preserve multiple candidates
   separately. Follow native `page_meta` for additional pages; a matched sample
   is not complete evidence or an atomic release snapshot.
5. On `bindingdb_search`, discover **PubChem structure to BindingDB similarity
   candidates**. Replace its independent aspirin example with the same selected
   CID and the `SMILES` property. The documented `getTargetByCompound` operation
   is a similarity search. Retain returned monomer IDs, structures and measurements
   separately; even cutoff 1 is not independent structure-identity proof. The
   workflow deliberately leaves `identity_verified: false`. Verify candidate
   structures before attributing their measurements to the PubChem compound.

The aspirin defaults in the downstream recipes are independent reference examples;
they do not assert that aspirin was present in AID 1259. A missing structure,
mismatched identifier, staged response needing inspection or failed request stays
explicit. Keep source citations, hashes, request arguments and observations at
each step. Do not transfer a cell viability/CC50 result to a protein-binding
claim, infer a shared experimental specimen, or combine unlike measurement units.

Use PubChem `SMILES` when stereochemistry/isotopes matter. `ConnectivitySMILES`
omits those layers; an InChIKey prefix is likewise insufficient for the full
comparison. See the [current property specification](https://pubchem.ncbi.nlm.nih.gov/pcfe/docs/markdown/pug-rest.md)
and [BindingDB service contract](https://www.bindingdb.org/rwd/bind/BindingDBRESTfulAPI.jsp).

These recipes have local executable and staging regressions. Fresh live execution
of the complete four-server chain remains unqualified; the previous independent
provider samples do not establish that chain.

## Development

```bash
./scripts/dev-servers.sh pubchem            # run locally (port 8828)
pnpm --filter pubchem-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

---

*Auto-generated baseline README — refine with server-specific detail as needed.*

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from PubChem and stays under the terms of that source: Mostly US public domain; some depositor terms.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->

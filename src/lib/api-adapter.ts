/** Keep PUG REST and PUG View on their existing native hosts. */
import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { pubchemFetch, pubchemPost, pubchemViewFetch } from "./http";
import { normalizeAssayIds, normalizeAssayTable } from "./assay-table";
import { readPubchemResponse } from "./response";

export function createPubchemApiFetch(): ApiFetchFn {
  return async request => {
    if (!["GET", "POST"].includes(request.method) || (request.method === "GET" && request.body !== undefined)) {
      throw Object.assign(new Error("PubChem supports GET without a body and native read-only POST requests"), { status: 405 });
    }
    const view = request.path.startsWith("/pug_view/");
    const path = view ? request.path.slice("/pug_view".length) : request.path;
    const response = await readPubchemResponse(() => {
      if (request.method === "POST") return pubchemPost(path, request.body, { params: request.params,
        ...(view ? { baseUrl: "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view", skipPolling: true } : {}) });
      return view ? pubchemViewFetch(path, request.params) : pubchemFetch(path, request.params);
    });
    // Projection adds SQL-friendly rows while retaining the entire native JSON.
    const data = response.data;
    try {
      if (/^\/(gene|protein|cell)\/.+\/aids\/JSON$/.test(request.path)) return { ...response, data: normalizeAssayIds(data) };
      return { ...response, data: /^\/assay\/aid\/[^/]+\/concise\/JSON$/.test(request.path) ? normalizeAssayTable(data) : data };
    } catch (error) {
      throw Object.assign(new Error((error as Error).message), { status: 502, data });
    }
  };
}

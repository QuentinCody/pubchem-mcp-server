/**
 * PubChem API adapter — wraps pubchemFetch/pubchemPost/pubchemViewFetch
 * into the ApiFetchFn interface for use by the Code Mode __api_proxy tool.
 *
 * Routes virtual paths:
 *   /pug_view/* → PUG View API (https://pubchem.ncbi.nlm.nih.gov/rest/pug_view)
 *   everything else → PUG REST API (https://pubchem.ncbi.nlm.nih.gov/rest/pug)
 *
 * The catalog uses paths like:
 *   /compound/name/{name}/JSON
 *   /compound/cid/{cid}/property/{properties}/JSON
 *   /pug_view/data/compound/{cid}/JSON
 *
 * The adapter strips the leading /pug_view prefix for PUG View calls and
 * passes the rest directly to the appropriate fetch function.
 */

import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { pubchemFetch, pubchemPost, pubchemViewFetch } from "./http";

/**
 * Create an ApiFetchFn that routes through PubChem PUG REST / PUG View.
 * No auth needed — PubChem APIs are public.
 */
export function createPubchemApiFetch(): ApiFetchFn {
    return async (request) => {
        let response: Response;
        const path = request.path;

        // Route /pug_view/* paths to PUG View API
        if (path.startsWith("/pug_view/")) {
            const viewPath = path.slice("/pug_view".length); // keep leading /
            if (request.method === "POST") {
                response = await pubchemPost(viewPath, request.body as object, {
                    baseUrl: "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view",
                });
            } else {
                response = await pubchemViewFetch(viewPath, request.params);
            }
        } else if (request.method === "POST") {
            response = await pubchemPost(path, request.body as object);
        } else {
            response = await pubchemFetch(path, request.params);
        }

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(
                `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
            ) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}

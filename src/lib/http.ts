/**
 * PubChem PUG REST / PUG View HTTP client with rate limit handling.
 *
 * PubChem enforces ~5 req/sec. Uses exponential backoff on 429/503 and
 * handles 202 async polling for similarity/substructure searches.
 */

import { restFetch, type RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const PUBCHEM_PUG_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const PUBCHEM_PUG_VIEW_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view";

/** Maximum number of polling attempts for async (202) operations */
const MAX_POLL_ATTEMPTS = 20;
/** Delay between polling attempts in ms */
const POLL_DELAY_MS = 2000;

export interface PubchemFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    /** Override base URL */
    baseUrl?: string;
    /** If true, skip async 202 polling (return raw response) */
    skipPolling?: boolean;
}

/**
 * Poll an async PubChem request that returned 202 with a ListKey.
 * PUG REST returns 202 + Waiting JSON for long-running operations.
 */
async function pollAsyncResult(listKeyUrl: string, opts?: PubchemFetchOptions): Promise<Response> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, POLL_DELAY_MS));

        const response = await restFetch(listKeyUrl, "", undefined, {
            ...opts,
            headers: {
                Accept: "application/json",
                ...(opts?.headers ?? {}),
            },
            retryOn: [429, 500, 502, 503],
            retries: 2,
            timeout: opts?.timeout ?? 30_000,
            userAgent:
                "pubchem-mcp-server/1.0 (bio-mcp; https://github.com/QuentinCody/pubchem-mcp-server)",
        });

        if (response.status !== 202) {
            return response;
        }
    }

    throw new Error(
        `PubChem async operation timed out after ${MAX_POLL_ATTEMPTS} polling attempts`,
    );
}

/**
 * Fetch from the PubChem PUG REST API with built-in rate limit handling.
 * Handles 202 async polling for similarity/substructure searches.
 */
export async function pubchemFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: PubchemFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? PUBCHEM_PUG_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    const response = await restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent:
            "pubchem-mcp-server/1.0 (bio-mcp; https://github.com/QuentinCody/pubchem-mcp-server)",
    });

    // Handle async 202 responses (similarity/substructure searches)
    if (response.status === 202 && !opts?.skipPolling) {
        try {
            const body = await response.json();
            const waiting = body as Record<string, unknown>;
            const listKey =
                (waiting.Waiting as Record<string, unknown>)?.ListKey as string | undefined;

            if (listKey) {
                const pollUrl = `${baseUrl}/compound/listkey/${listKey}/cids/JSON`;
                return pollAsyncResult(pollUrl, opts);
            }
        } catch { /* best-effort: If we can't parse the 202 body, return the original response */ }
        return response;
    }

    return response;
}

/**
 * POST to PubChem PUG REST API.
 */
export async function pubchemPost(
    path: string,
    body: object,
    opts?: PubchemFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? PUBCHEM_PUG_BASE;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    const response = await restFetch(baseUrl, path, undefined, {
        ...opts,
        method: "POST",
        headers,
        body,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "pubchem-mcp-server/1.0",
    });

    // Handle async 202 responses for POST-based searches
    if (response.status === 202 && !opts?.skipPolling) {
        try {
            const respBody = await response.json();
            const waiting = respBody as Record<string, unknown>;
            const listKey =
                (waiting.Waiting as Record<string, unknown>)?.ListKey as string | undefined;

            if (listKey) {
                const pollUrl = `${baseUrl}/compound/listkey/${listKey}/cids/JSON`;
                return pollAsyncResult(pollUrl, opts);
            }
        } catch { /* best-effort: If we can't parse the 202 body, return the original response */ }
        return response;
    }

    return response;
}

/**
 * Fetch from the PubChem PUG View API (detailed compound records).
 */
export async function pubchemViewFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: PubchemFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? PUBCHEM_PUG_VIEW_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent:
            "pubchem-mcp-server/1.0 (bio-mcp; https://github.com/QuentinCody/pubchem-mcp-server)",
    });
}

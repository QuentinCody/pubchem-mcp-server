/** PubChem transport: native form POSTs and bounded legacy ListKey polling. */
import { restFetch, type RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";
import { readPubchemResponse } from "./response";

const PUBCHEM_PUG_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const PUBCHEM_PUG_VIEW_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view";
export interface PubchemFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
  baseUrl?: string;
  skipPolling?: boolean;
  params?: Record<string, unknown>;
}
const failure = (message: string, status: number, data?: unknown) => Object.assign(new Error(message), { status, data });
const scalar = (value: unknown) => typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

function formBody(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw failure("PubChem POST requires an object of form fields", 400);
  const fields = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    if (scalar(value)) fields.set(key, String(value));
    else if (Array.isArray(value) && value.every(scalar)) fields.set(key, value.join(","));
    else throw failure(`PubChem form field ${key} must be a scalar or scalar array`, 400);
  }
  return fields.toString();
}

async function send(path: string, params: Record<string, unknown> | undefined, opts: PubchemFetchOptions = {}): Promise<Response> {
  const baseUrl = opts.baseUrl ?? PUBCHEM_PUG_BASE;
  const deadlineAt = Date.now() + (opts.deadlineMs ?? opts.timeout ?? 30_000);
  let currentPath = path; let currentParams = params; let pending: unknown;
  for (let attempt = 0; attempt <= 20; attempt++) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw failure("PubChem async operation exceeded its request deadline", 504, pending);
    const response = await restFetch(baseUrl, currentPath, currentParams, {
      ...opts,
      ...(attempt > 0 ? { method: "GET", body: undefined } : {}),
      headers: { Accept: "application/json", ...opts.headers },
      retryOn: [429, 500, 502, 503], retries: opts.retries ?? 3,
      timeout: Math.min(opts.timeout ?? 30_000, remaining), deadlineMs: remaining,
      userAgent: "pubchem-mcp-server/1.0 (bio-mcp; https://github.com/QuentinCody/pubchem-mcp-server)",
    });
    if (response.status !== 202 || opts.skipPolling) return response;
    // Read a bounded clone so a Waiting response without a usable ListKey stays
    // readable. Never reinterpret a provider-supplied value as an arbitrary URL.
    try {
      pending = (await readPubchemResponse(() => Promise.resolve(response.clone()), Math.max(1, deadlineAt - Date.now()))).data;
    } catch (error) {
      void response.body?.cancel().catch(() => undefined);
      throw error;
    }
    const key = (pending as { Waiting?: { ListKey?: unknown } })?.Waiting?.ListKey;
    if (!((typeof key === "string" && /^\d+$/.test(key)) || (Number.isSafeInteger(key) && Number(key) > 0))) return response;
    void response.body?.cancel().catch(() => undefined);
    if (attempt === 20) throw failure("PubChem async polling attempt limit reached", 504, pending);
    currentPath = `/compound/listkey/${key}/cids/JSON`; currentParams = undefined;
    await new Promise(resolve => setTimeout(resolve, Math.min(2000, Math.max(0, deadlineAt - Date.now()))));
  }
  throw failure("PubChem async polling failed", 504, pending);
}

export function pubchemFetch(path: string, params?: Record<string, unknown>, opts?: PubchemFetchOptions): Promise<Response> {
  return send(path, params, opts);
}

export function pubchemPost(path: string, body: unknown, opts: PubchemFetchOptions = {}): Promise<Response> {
  const view = opts.baseUrl === PUBCHEM_PUG_VIEW_BASE;
  return send(path, opts.params, { ...opts, method: "POST", body: view ? body as object : formBody(body),
    headers: { "Content-Type": view ? "application/json" : "application/x-www-form-urlencoded", ...opts.headers } });
}

export function pubchemViewFetch(path: string, params?: Record<string, unknown>, opts?: PubchemFetchOptions): Promise<Response> {
  return send(path, params, { ...opts, baseUrl: opts?.baseUrl ?? PUBCHEM_PUG_VIEW_BASE, skipPolling: true });
}

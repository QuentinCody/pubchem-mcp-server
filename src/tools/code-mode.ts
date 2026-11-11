/**
 * PubChem Code Mode — registers search + execute tools for full API access.
 *
 * search: In-process catalog query, returns matching endpoints with docs.
 * execute: V8 isolate with api.get/api.post + searchSpec/listCategories.
 */

import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { pubchemCatalog } from "../spec/catalog";
import { createPubchemApiFetch } from "../lib/api-adapter";
import { pubchemResponse } from "../lib/tool-result";

interface CodeModeEnv {
    PUBCHEM_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

/**
 * Register pubchem_search and pubchem_execute tools.
 */
export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createPubchemApiFetch();
    const register = server.tool.bind(server) as (...args: unknown[]) => void;
    const dualRegistrar = { tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        const handler = rest.pop() as (args: unknown, extra: unknown) => Promise<any>;
        for (const alias of [String(name), `mcp_${String(name)}`]) register(alias, ...rest,
            (args: unknown, extra: unknown) => pubchemResponse(() => handler(args, extra), env, alias, extra, args));
    } };

    // Register the search tool (in-process, no isolate)
    const searchTool = createSearchTool({
        prefix: "pubchem",
        catalog: pubchemCatalog,
    });
    searchTool.register(dualRegistrar);

    // Register the execute tool (V8 isolate via DynamicWorkerExecutor)
    const executeTool = createExecuteTool({
        prefix: "pubchem",
        // Verifiable provenance: pubchem_execute results carry a _meta.citation.
        source: { id: "pubchem", name: "PubChem", url: "https://pubchem.ncbi.nlm.nih.gov", license: "U.S. Public Domain" },
        catalog: pubchemCatalog,
        apiFetch,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        preserveApiErrors: true,
        timeout: 45_000,
        doNamespace: env.PUBCHEM_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(dualRegistrar);
}

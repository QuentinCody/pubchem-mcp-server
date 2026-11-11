// interlinked-tdd: exempt
import type { McpServer } from "@bio-mcp/shared/mcp";
import { pubchemResponse } from "../lib/tool-result";
import { z } from "zod";
import { createGetSchemaHandler } from "@bio-mcp/shared/staging/utils";

interface SchemaEnv {
	PUBCHEM_DATA_DO?: unknown;
}

export function registerGetSchema(server: McpServer, env?: SchemaEnv): void {
	const handler = createGetSchemaHandler("PUBCHEM_DATA_DO", "pubchem");

	for (const name of ["pubchem_get_schema", "mcp_pubchem_get_schema"]) server.registerTool(
		name,
		{
			title: "Get Staged PubChem Schema",
			description:
				"Get schema information for staged PubChem data. Shows table structures and row counts. " +
				"If called without a data_access_id, lists all staged datasets available in this session.",
			inputSchema: {
				data_access_id: z
					.string()
					.min(1)
					.optional()
					.describe(
						"Data access ID for the staged dataset. If omitted, lists all staged datasets in this session.",
					),
			},
		},
		async (args, extra) => {
			const runtimeEnv = env || (extra as { env?: SchemaEnv })?.env || {};
			return pubchemResponse(() => handler(
				args as Record<string, unknown>,
				runtimeEnv as Record<string, unknown>,
				(extra as Record<string, unknown>),
			), runtimeEnv, name, extra, args);
		},
	);
}

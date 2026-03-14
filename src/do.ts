/**
 * PubchemDataDO — Durable Object for staging large PubChem responses.
 *
 * Extends RestStagingDO with compound, assay, and property-specific schema hints.
 */

import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class PubchemDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        const obj = data as Record<string, unknown>;

        // PUG REST compound responses: { PC_Compounds: [...] }
        if (Array.isArray(obj.PC_Compounds) && obj.PC_Compounds.length > 0) {
            return {
                tableName: "compounds",
                indexes: ["id_cid", "charge", "molecular_formula", "molecular_weight"],
                flatten: { props: 1, atoms: 1, bonds: 1 },
            };
        }

        // Property table responses: { PropertyTable: { Properties: [...] } }
        if (
            obj.PropertyTable &&
            typeof obj.PropertyTable === "object" &&
            Array.isArray((obj.PropertyTable as Record<string, unknown>).Properties)
        ) {
            return {
                tableName: "properties",
                indexes: [
                    "CID",
                    "MolecularFormula",
                    "MolecularWeight",
                    "IUPACName",
                    "InChIKey",
                ],
            };
        }

        // Assay responses: { PC_AssaySubmit: [...] } or { PC_AssayContainer: [...] }
        if (Array.isArray(obj.PC_AssaySubmit) || Array.isArray(obj.PC_AssayContainer)) {
            return {
                tableName: "assays",
                indexes: ["aid", "name", "source_name"],
                flatten: { description: 1, results: 1 },
            };
        }

        // Synonyms: { InformationList: { Information: [...] } }
        if (
            obj.InformationList &&
            typeof obj.InformationList === "object" &&
            Array.isArray((obj.InformationList as Record<string, unknown>).Information)
        ) {
            return {
                tableName: "information",
                indexes: ["CID", "SID"],
            };
        }

        // PUG View record: { Record: { ... } }
        if (obj.Record && typeof obj.Record === "object") {
            const rec = obj.Record as Record<string, unknown>;
            if (Array.isArray(rec.Section)) {
                return {
                    tableName: "record_sections",
                    indexes: ["TOCHeading", "RecordType"],
                    flatten: { Section: 2 },
                };
            }
        }

        // Direct array of results (e.g., similarity search CID lists)
        if (
            Array.isArray(obj.IdentifierList) ||
            (obj.IdentifierList &&
                typeof obj.IdentifierList === "object" &&
                Array.isArray(
                    (obj.IdentifierList as Record<string, unknown>).CID,
                ))
        ) {
            return {
                tableName: "identifiers",
                indexes: ["CID"],
            };
        }

        return undefined;
    }
}

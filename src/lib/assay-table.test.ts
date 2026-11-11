import { describe, expect, it } from "vitest";
import { normalizeAssayIds, normalizeAssayTable } from "./assay-table";

describe("PubChem concise assay table", () => {
  it("keeps activity outcomes, units and missing values paired with provider column names", () => {
    const columns = ["AID", "CID", "Activity Outcome", "Activity Value [uM]"];
    expect(normalizeAssayTable({ Table: { Columns: { Column: columns }, Row: [{ Cell: ["1", "11122", "Inactive", ""] }, { Cell: ["1", "11123", "Active", "0.1"] }] } })).toMatchObject({
      source_format: "PubChem Table", columns,
      rows: [{ AID: "1", CID: "11122", "Activity Outcome": "Inactive", "Activity Value [uM]": "" }, { AID: "1", CID: "11123", "Activity Outcome": "Active", "Activity Value [uM]": "0.1" }],
    });
  });
  it.each([null, {}, { Table: {} }, { Table: { Columns: { Column: [] }, Row: null } }])("rejects a malformed envelope: %j", data => {
    expect(() => normalizeAssayTable(data)).toThrow("missing Table");
  });
  it.each([["CID", "CID"], [""], [1]])("rejects invalid columns: %j", (...columns) => {
    expect(() => normalizeAssayTable({ Table: { Columns: { Column: columns }, Row: [] } })).toThrow("column names");
  });
  it.each([{}, null, { Cell: ["1", "2"] }])("rejects rows whose values cannot be mapped: %j", row => {
    expect(() => normalizeAssayTable({ Table: { Columns: { Column: ["CID"] }, Row: [row] } })).toThrow("column count");
  });
  it("preserves an empty result with its column definitions", () => {
    expect(normalizeAssayTable({ Table: { Columns: { Column: ["CID"] }, Row: [] } })).toMatchObject({ source_format: "PubChem Table", columns: ["CID"], rows: [] });
  });
});

describe("PubChem assay associations", () => {
  it("keeps the source entity beside each assay ID, including multiple entities", () => {
    expect(normalizeAssayIds({ InformationList: { Information: [{ CellAccession: "CVCL_0030", AID: [1259, 1302] }, { GeneID: 1956, AID: [1433] }] } })).toMatchObject({ source_format: "PubChem InformationList", rows: [{ CellAccession: "CVCL_0030", AID: 1259 }, { CellAccession: "CVCL_0030", AID: 1302 }, { GeneID: 1956, AID: 1433 }] });
  });
  it("preserves an empty association list", () => {
    expect(normalizeAssayIds({ InformationList: { Information: [{ GeneID: 1, AID: [] }] } })).toMatchObject({ source_format: "PubChem InformationList", rows: [] });
  });
  it.each([null, {}, { InformationList: {} }])("rejects malformed envelopes: %j", data => {
    expect(() => normalizeAssayIds(data)).toThrow("missing InformationList");
  });
  it.each([null, {}, { AID: [0] }, { AID: ["1"] }, { AID: [-1] }, { AID: [1.5] }])("rejects invalid association records: %j", info => {
    expect(() => normalizeAssayIds({ InformationList: { Information: [info] } })).toThrow("invalid AIDs");
  });
});

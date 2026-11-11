/** Give positional concise-assay values named columns before SQLite staging. */
export function normalizeAssayTable(data: unknown): unknown {
  // SAFETY: this only reads optional properties; all consumed arrays are validated below.
  const table = (data as { Table?: { Columns?: { Column?: unknown }; Row?: unknown } })?.Table;
  if (!table || !Array.isArray(table.Columns?.Column) || !Array.isArray(table.Row)) {
    throw new Error("PubChem concise assay response is missing Table.Columns.Column or Table.Row");
  }
  const columns = table.Columns.Column;
  if (!columns.every(c => typeof c === "string" && c.length > 0) || new Set(columns).size !== columns.length) {
    throw new Error("PubChem concise assay column names are invalid or duplicated");
  }
  const rows = table.Row.map((row: { Cell?: unknown }) => {
    if (!Array.isArray(row?.Cell) || row.Cell.length !== columns.length) {
      throw new Error("PubChem concise assay row does not match its column count");
    }
    const cells = row.Cell;
    return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
  });
  return { source_format: "PubChem Table", columns, rows, native: data };
}

/** One assay association per row, avoiding an opaque array inside one SQL cell. */
export function normalizeAssayIds(data: unknown): unknown {
  // SAFETY: values are only read here; the provider arrays are validated before use.
  const list = (data as { InformationList?: { Information?: unknown } })?.InformationList;
  if (!Array.isArray(list?.Information)) throw new Error("PubChem assay associations are missing InformationList.Information");
  const rows = list.Information.flatMap((info: Record<string, unknown>) => {
    if (!Array.isArray(info?.AID) || !info.AID.every(id => Number.isSafeInteger(id) && id > 0)) {
      throw new Error("PubChem assay associations contain invalid AIDs");
    }
    return info.AID.map(AID => ({ ...info, AID }));
  });
  return { source_format: "PubChem InformationList", rows, native: data };
}

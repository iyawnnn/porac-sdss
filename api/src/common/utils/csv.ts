// Minimal RFC 4180-style CSV writer — hand-rolled rather than a dependency
// since export rows are simple scalars (no embedded CSV, no streaming need
// at current row-count ceilings, see reports.service.ts).
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.header)).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const value = c.value(row);
        return value === null || value === undefined ? '' : escapeCsvField(String(value));
      })
      .join(','),
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}

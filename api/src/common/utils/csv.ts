// Minimal RFC 4180-style CSV writer — hand-rolled rather than a dependency
// since export rows are simple scalars (no embedded CSV, no streaming need
// at current row-count ceilings, see reports.service.ts).
//
// The ONLY place the app builds CSV (csv-writer-only.spec.ts fails if a
// second one appears), so CSV formula-injection neutralisation lives here
// once, for every export (Phase 7, step 7.0) — see neutraliseFormula below.
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | bigint | boolean | null | undefined;
}

// A spreadsheet (Excel, Sheets, LibreOffice) treats a cell that starts with
// one of these as a formula: = + - @, a tab (0x09) or a carriage return
// (0x0D). Only the FIRST character is checked — a leading space before one
// of them is left as it is (decided rule, Phase 7, step 7.0).
const FORMULA_TRIGGERS: ReadonlySet<string> = new Set([
  '=',
  '+',
  '-',
  '@',
  '\t',
  '\r',
]);

// Prefixes a single apostrophe to a text value whose first character is a
// formula trigger, so the spreadsheet shows it as text instead of running
// it (OWASP's CSV-injection mitigation). Only ever applied to string
// values: numbers (a negative count, a 0, a distance in metres) and
// booleans are written as they are and are never turned into text. The
// result starts with an apostrophe, which is not a trigger, so a value is
// never prefixed twice. Empty strings stay empty.
export function neutraliseFormula(value: string): string {
  return value.length > 0 && FORMULA_TRIGGERS.has(value[0])
    ? `'${value}`
    : value;
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// One cell: null/undefined are an empty field; a string is neutralised and
// then quoted; a number, bigint or boolean is written in its plain string
// form (a number's String() never contains a comma, quote or newline, but
// it still goes through the same quoting for uniformity).
function formatCell(
  value: string | number | bigint | boolean | null | undefined,
): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string')
    return escapeCsvField(neutraliseFormula(value));
  return escapeCsvField(String(value));
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => formatCell(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => formatCell(c.value(row))).join(','),
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}

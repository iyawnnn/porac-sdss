import { neutraliseFormula, toCsv } from './csv';

// One-column CSV for a single value: returns just that value's cell.
function cellOf(
  value: string | number | bigint | boolean | null | undefined,
): string {
  const csv = toCsv([{ value }], [{ header: 'Value', value: (r) => r.value }]);
  // Header line, then the cell (which may itself contain a quoted CRLF).
  return csv.slice('Value\r\n'.length, -'\r\n'.length);
}

// Phase 7, step 7.0: CSV formula-injection neutralisation.
describe('toCsv formula-injection neutralisation', () => {
  it.each([
    ['=', '=SUM(A1:A9)', "'=SUM(A1:A9)"],
    ['+', '+639171234567', "'+639171234567"],
    ['-', '-2+3', "'-2+3"],
    ['@', '@SUM(1,2)', `"'@SUM(1,2)"`],
  ])(
    'prefixes one apostrophe to a text cell starting with %s',
    (_trigger, input, expected) => {
      expect(cellOf(input)).toBe(expected);
    },
  );

  it('prefixes a text cell starting with a tab (0x09)', () => {
    expect(cellOf('\tcmd')).toBe("'\tcmd");
  });

  it('prefixes a text cell starting with a carriage return (0x0D), then quotes it', () => {
    // The CR also triggers quoting, so the prefixed value is wrapped.
    expect(cellOf('\rcmd')).toBe(`"'\rcmd"`);
  });

  it('leaves a text cell with a trigger character in the middle or end untouched', () => {
    expect(cellOf('a=b')).toBe('a=b');
    expect(cellOf('Sapang Uwak - Purok 2')).toBe('Sapang Uwak - Purok 2');
    expect(cellOf('jane@porac.gov.ph')).toBe('jane@porac.gov.ph');
    expect(cellOf('1+1')).toBe('1+1');
  });

  it('checks only the first character: a leading space before a trigger is not prefixed', () => {
    expect(cellOf(' =1+1')).toBe(' =1+1');
  });

  it('leaves numbers alone, including negatives, zero and decimals', () => {
    expect(cellOf(-5)).toBe('-5');
    expect(cellOf(0)).toBe('0');
    expect(cellOf(-0.5)).toBe('-0.5');
    expect(cellOf(412)).toBe('412');
  });

  it('leaves bigints and booleans alone', () => {
    expect(cellOf(BigInt('-9007199254740993'))).toBe('-9007199254740993');
    expect(cellOf(true)).toBe('true');
    expect(cellOf(false)).toBe('false');
  });

  it('leaves null, undefined and the empty string empty', () => {
    expect(cellOf(null)).toBe('');
    expect(cellOf(undefined)).toBe('');
    expect(cellOf('')).toBe('');
  });

  it('still quotes commas, quotes and newlines in a prefixed cell', () => {
    expect(cellOf('=HYPERLINK("http://x","y")')).toBe(
      `"'=HYPERLINK(""http://x"",""y"")"`,
    );
    expect(cellOf('-a,b')).toBe(`"'-a,b"`);
    expect(cellOf('+line1\nline2')).toBe(`"'+line1\nline2"`);
  });

  it('never prefixes twice', () => {
    expect(neutraliseFormula(neutraliseFormula('=1+1'))).toBe("'=1+1");
    expect(cellOf("'=1+1")).toBe("'=1+1");
    expect(cellOf('==1')).toBe("'==1");
  });

  it('neutralises the header row the same way', () => {
    const csv = toCsv([], [{ header: '=Header', value: () => 1 }]);
    expect(csv).toBe("'=Header\r\n");
  });

  it('leaves ordinary text exactly as before', () => {
    expect(cellOf('Localized Flooding')).toBe('Localized Flooding');
    expect(cellOf('2026-01-05T00:00:00.000Z')).toBe('2026-01-05T00:00:00.000Z');
  });
});

describe('toCsv', () => {
  it('writes a header row plus one row per input, CRLF-terminated', () => {
    const csv = toCsv(
      [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }],
      [
        { header: 'ID', value: (r) => r.id },
        { header: 'Name', value: (r) => r.name },
      ],
    );
    expect(csv).toBe('ID,Name\r\n1,Alpha\r\n2,Beta\r\n');
  });

  it('quotes and escapes fields containing commas, quotes, or newlines', () => {
    const csv = toCsv(
      [{ note: 'Contains, a comma' }, { note: 'Has "quotes"' }, { note: 'Multi\nline' }],
      [{ header: 'Note', value: (r) => r.note }],
    );
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('"Contains, a comma"');
    expect(lines[2]).toBe('"Has ""quotes"""');
    expect(lines[3]).toBe('"Multi\nline"');
  });

  it('renders null/undefined values as an empty field, not the literal string', () => {
    const csv = toCsv(
      [{ value: null }, { value: undefined }],
      [{ header: 'Value', value: (r) => r.value }],
    );
    expect(csv).toBe('Value\r\n\r\n\r\n');
  });

  it('produces just the header row for an empty dataset', () => {
    const csv = toCsv([], [{ header: 'ID', value: () => 1 }]);
    expect(csv).toBe('ID\r\n');
  });

  it('renders booleans and numbers as their string form', () => {
    const csv = toCsv(
      [{ overdue: true, score: 42 }],
      [
        { header: 'Overdue', value: (r) => r.overdue },
        { header: 'Score', value: (r) => r.score },
      ],
    );
    expect(csv).toBe('Overdue,Score\r\ntrue,42\r\n');
  });
});

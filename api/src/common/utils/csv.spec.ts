import { toCsv } from './csv';

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

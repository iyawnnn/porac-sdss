import { BadRequestException } from '@nestjs/common';
import { ilikeContains, parseMyReportsQuery } from './my-reports-query';

describe('parseMyReportsQuery', () => {
  it('defaults to every report, newest first, page 1 of 10', () => {
    expect(parseMyReportsQuery({})).toEqual({ q: '', status: 'all', sort: 'newest', page: 1, pageSize: 10 });
  });

  it('accepts the supported filters, sorts and paging values', () => {
    expect(parseMyReportsQuery({ q: '  drain ', status: 'Under Review', sort: 'oldest', page: '3', pageSize: '25' })).toEqual({
      q: 'drain',
      status: 'Under Review',
      sort: 'oldest',
      page: 3,
      pageSize: 25,
    });
    expect(parseMyReportsQuery({ status: 'active' }).status).toBe('active');
  });

  it.each([
    { status: 'Closed' },
    { sort: 'priority' },
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { pageSize: '51' },
    { q: 'x'.repeat(101) },
  ])('rejects %p', (raw) => {
    expect(() => parseMyReportsQuery(raw)).toThrow(BadRequestException);
  });
});

describe('ilikeContains', () => {
  it('escapes ILIKE wildcards and the escape character', () => {
    expect(ilikeContains('50%_off\\')).toBe('%50\\%\\_off\\\\%');
  });
});

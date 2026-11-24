import { BadRequestException } from '@nestjs/common';

// Query for GET /reports/mine/page (UI Phase 2C): the citizen's own reports, searched, filtered,
// sorted and paginated in SQL so a long history is never sent whole. "active" groups the three
// unresolved workflow statuses, matching the dashboard and My Reports summary.
export const MY_REPORT_STATUS_FILTERS = ['all', 'active', 'Reported', 'Under Review', 'In Progress', 'Resolved', 'Rejected'] as const;
export const MY_REPORT_SORTS = ['newest', 'oldest'] as const;
export const ACTIVE_STATUSES = ['Reported', 'Under Review', 'In Progress'] as const;

export type MyReportStatusFilter = (typeof MY_REPORT_STATUS_FILTERS)[number];
export type MyReportSort = (typeof MY_REPORT_SORTS)[number];

export interface MyReportsQuery {
  q: string;
  status: MyReportStatusFilter;
  sort: MyReportSort;
  page: number;
  pageSize: number;
}

export const MY_REPORTS_DEFAULT_PAGE_SIZE = 10;
export const MY_REPORTS_MAX_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 100;

function positiveInt(value: string | undefined, fallback: number, max: number) {
  if (value === undefined || value === '') return fallback;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > max) {
    throw new BadRequestException('Paging values must be positive integers within the allowed maximum.');
  }
  return Number(value);
}

export function parseMyReportsQuery(raw: Record<string, string | undefined>): MyReportsQuery {
  const status = (raw.status ?? 'all') as MyReportStatusFilter;
  if (!MY_REPORT_STATUS_FILTERS.includes(status)) throw new BadRequestException('Unknown status filter.');
  const sort = (raw.sort ?? 'newest') as MyReportSort;
  if (!MY_REPORT_SORTS.includes(sort)) throw new BadRequestException('Unknown sort order.');
  const q = (raw.q ?? '').trim();
  if (q.length > MAX_QUERY_LENGTH) throw new BadRequestException(`Search must be ${MAX_QUERY_LENGTH} characters or fewer.`);
  return {
    q,
    status,
    sort,
    page: positiveInt(raw.page, 1, 1_000_000),
    pageSize: positiveInt(raw.pageSize, MY_REPORTS_DEFAULT_PAGE_SIZE, MY_REPORTS_MAX_PAGE_SIZE),
  };
}

// ILIKE treats % and _ as wildcards; a citizen typing them means the characters themselves.
export function ilikeContains(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

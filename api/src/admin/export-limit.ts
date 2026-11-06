import { BadRequestException } from '@nestjs/common';

export const EXPORT_ROW_LIMIT = 5_000;
export const EXPORT_LIMIT_MESSAGE =
  'Too many rows to export (more than 5,000). Narrow your filters and try again.';

export function assertExportLimit(rows: readonly unknown[]): void {
  if (rows.length > EXPORT_ROW_LIMIT) {
    throw new BadRequestException(EXPORT_LIMIT_MESSAGE);
  }
}

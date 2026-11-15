import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

export const POSTGRES_INT_MAX = 2147483647;

export function isPositiveInt(value: unknown): boolean {
  return (
    (typeof value === 'number' ||
      (typeof value === 'string' && /^\d+$/.test(value))) &&
    Number.isInteger(Number(value)) &&
    Number(value) >= 1 &&
    Number(value) <= POSTGRES_INT_MAX
  );
}

export function parsePositiveInt(value: unknown, name: string): number {
  if (!isPositiveInt(value)) {
    throw new BadRequestException(`${name} must be a positive whole number.`);
  }
  return Number(value);
}

@Injectable()
export class PositiveIntPipe implements PipeTransform<unknown, number> {
  transform(value: unknown, metadata: ArgumentMetadata): number {
    return parsePositiveInt(value, metadata.data ?? 'id');
  }
}

import { BadRequestException } from '@nestjs/common';
import { parsePositiveInt } from './positive-int.pipe';

describe('parsePositiveInt', () => {
  it.each([0, -1, 1.5, 'abc', '1e3', 2147483648, '99999999999999999999'])(
    'rejects %p',
    (value) => {
      expect(() => parsePositiveInt(value, 'ticketId')).toThrow(
        new BadRequestException('ticketId must be a positive whole number.'),
      );
    },
  );

  it.each([1, '1', 2147483647, '2147483647'])('accepts %p', (value) => {
    expect(parsePositiveInt(value, 'ticketId')).toBe(Number(value));
  });
});

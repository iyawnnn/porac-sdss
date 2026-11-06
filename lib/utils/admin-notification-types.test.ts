import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_NOTIFICATION_TYPES, ADMIN_NOTIFICATION_TYPE_LABELS } from '../types/admin-notifications';

test('retired urgency notices keep their history label but cannot be selected as a filter', () => {
  assert(!ADMIN_NOTIFICATION_TYPES.some(type => String(type) === 'ticket_critical'));
  assert.equal(ADMIN_NOTIFICATION_TYPE_LABELS.ticket_critical, 'Ticket Urgency Became High (retired)');
});

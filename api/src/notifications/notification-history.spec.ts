import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Manuscript revision Phase 1, steps 2 and 7a: nothing creates
// ticket_escalation (step 2) or ticket_critical (step 7a, which deleted
// RecomputeService) notifications any more, but existing ones must still
// render as history — so the frontend label map keeps both types, and no
// API code creates a new ticket_critical notification.
describe('retired notification types stay readable as history', () => {
  it('the frontend label map still has ticket_critical and ticket_escalation', () => {
    const labels = readFileSync(
      join(__dirname, '../../../lib/types/admin-notifications.ts'),
      'utf8',
    );
    expect(labels).toMatch(/ticket_critical:\s*"/);
    expect(labels).toMatch(/ticket_escalation:\s*"/);
  });

  it('no API source creates a ticket_critical notification', () => {
    const srcRoot = join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
          if (/type:\s*'ticket_critical'/.test(readFileSync(path, 'utf8'))) {
            offenders.push(path);
          }
        }
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});

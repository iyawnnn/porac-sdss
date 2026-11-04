import { Logger } from '@nestjs/common';
import type { TransactionSql } from 'postgres';
import {
  citizenOutcome,
  citizenReferralAgency,
} from '../reports/citizen-report-view';
import type { CitizenOutcome } from '../reports/citizen-report-view';
import type { NotificationsService } from './notifications.service';

export interface CitizenNotice {
  type: string;
  title: string;
  message: string;
}

export const REFERRED_COMPLETION_NOTE =
  "The municipality's handling is complete. The agency may not have resolved the issue yet.";

export function resolvedMessage(outcome: CitizenOutcome | null): string | null {
  if (outcome === 'HANDLED_BY_MUNICIPALITY') {
    return 'Your report has been handled by the municipality.';
  }
  if (outcome === 'REFERRED_OUTSIDE') {
    return `Your report has been referred to an outside agency. ${REFERRED_COMPLETION_NOTE}`;
  }
  return null;
}

export function resolvedNotice(
  input: Parameters<typeof citizenOutcome>[0],
): CitizenNotice {
  return {
    type: 'ticket_resolved',
    title: 'Report resolved',
    message:
      resolvedMessage(citizenOutcome(input)) ??
      'Your report has been marked resolved.',
  };
}

export function reassignedNotice(office: 'MEO' | 'MDRRMO'): CitizenNotice {
  const name =
    office === 'MEO'
      ? 'Municipal Engineering Office'
      : 'Municipal Disaster Risk Reduction and Management Office';
  return {
    type: 'ticket_reassigned',
    title: 'Report routed',
    message: `Your report has been routed to the ${name}.`,
  };
}

export function referredNotice(agency: string | null): CitizenNotice {
  return {
    type: 'ticket_referred',
    title: 'Report referred',
    message: `Your report has been referred to ${citizenReferralAgency(agency)}.`,
  };
}

export const BACK_UNDER_REVIEW: CitizenNotice = {
  type: 'ticket_returned_to_review',
  title: 'Back under review',
  message: 'Your report is back under review by the assigned office.',
};
export const ACKNOWLEDGED: CitizenNotice = {
  type: 'ticket_acknowledged',
  title: 'Report acknowledged',
  message: 'Your report has been acknowledged by municipal monitoring.',
};
export const FEEDBACK_RECEIVED: CitizenNotice = {
  type: 'resolution_feedback_received',
  title: 'Feedback received',
  message: 'Thank you. Your feedback was received.',
};

const logger = new Logger('CitizenNotifications');

// A caught SQL error still aborts a PostgreSQL transaction. A savepoint is
// necessary to keep the staff action and its audit intact when notices fail.
export async function bestEffortNotifications(
  tx: TransactionSql,
  write: (savepoint: TransactionSql) => Promise<void>,
): Promise<void> {
  try {
    await tx.savepoint(write);
  } catch {
    logger.warn('Notification delivery failed; the action can still commit.');
  }
}

export async function ticketReporters(
  tx: TransactionSql,
  ticketId: number,
): Promise<{ citizen_id: number; report_id: number; email: string }[]> {
  return tx<{ citizen_id: number; report_id: number; email: string }[]>`
    SELECT DISTINCT ON (r.citizen_id) r.citizen_id, r.id AS report_id, c.email
    FROM reports r
    JOIN citizens c ON c.id = r.citizen_id
    JOIN tickets t ON t.id = r.ticket_id
    WHERE r.ticket_id = ${ticketId} AND t.merged_into_ticket_id IS NULL
    ORDER BY r.citizen_id, r.id ASC
  `;
}

// Only allowlisted citizen copy enters here; the action's staff input is
// never passed to the notification writer.
export async function notifyTicketCitizens(
  tx: TransactionSql,
  notifications: NotificationsService,
  ticketId: number,
  notice: CitizenNotice,
): Promise<Awaited<ReturnType<typeof ticketReporters>>> {
  let rows: Awaited<ReturnType<typeof ticketReporters>> = [];
  await bestEffortNotifications(tx, async (sp) => {
    rows = await ticketReporters(sp, ticketId);
    for (const row of rows) {
      await notifications.createInTx(sp, {
        recipientType: 'citizen',
        recipientId: row.citizen_id,
        ...notice,
        href: `/dashboard/reports/${row.report_id}`,
        entityType: 'report',
        entityId: row.report_id,
      });
    }
  });
  return rows;
}

export async function notifyFeedbackReceived(
  tx: TransactionSql,
  notifications: NotificationsService,
  ticketId: number,
  citizenId: number,
  reportId: number | null,
): Promise<void> {
  await bestEffortNotifications(tx, async (sp) => {
    // 3g's existing eligibility query chooses the owner's report, including
    // one left on a merged ancestor. The notification target is the live
    // survivor; independently recheck the link's owner before writing.
    const [report] = await sp<{ id: number }[]>`
      SELECT r.id FROM reports r JOIN citizens c ON c.id = r.citizen_id
      JOIN tickets t ON t.id = ${ticketId}
      WHERE r.id = ${reportId} AND r.citizen_id = ${citizenId}
        AND t.merged_into_ticket_id IS NULL
    `;
    if (!report) return;
    await notifications.createInTx(sp, {
      recipientType: 'citizen',
      recipientId: citizenId,
      ...FEEDBACK_RECEIVED,
      href: `/dashboard/reports/${report.id}`,
      entityType: 'report',
      entityId: report.id,
    });
  });
}

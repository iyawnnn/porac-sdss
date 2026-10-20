import { Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import { WeatherService } from './weather.service';
import { AppConfigService } from './app-config.service';
import { computeUrgency } from './urgency';
import { NotificationsService } from '../notifications/notifications.service';

// Hazard Urgency only (priority_score / urgency_level / urgency_band and the
// three *_factor columns). Operational Priority (priority_index) moved to
// OperationalPriorityService in Phase 1 step 1 — callers run both. This
// service is scheduled for removal once the DENR-MGB Hazard Information
// replaces Hazard Urgency (Phase 1 later steps).
@Injectable()
export class RecomputeService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly weather: WeatherService,
    private readonly appConfig: AppConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async recomputeActiveTicketUrgency(rainOverride?: number) {
    const sql = this.pg;
    const rain1hMm = rainOverride ?? (await this.weather.getCurrentRain1hMm());
    const { elevMin, elevMax } = await this.appConfig.getElevationBounds();

    const tickets = await sql<
      {
        id: number;
        // Nullable in the schema (unseeded dem_points at submission time) —
        // computeUrgency() now handles this explicitly rather than the type
        // silently lying that it can't happen.
        elevation_m: number | null;
        member_count: number;
        urgency_band: string | null;
        assigned_office: 'MEO' | 'MDRRMO';
      }[]
    >`
      SELECT t.id, t.elevation_m, t.member_count,
        t.urgency_band, t.assigned_office
      FROM tickets t
      WHERE t.status IN ('Reported', 'Under Review', 'In Progress')
    `;

    if (tickets.length === 0) return { updated: 0, rain1hMm };

    const ids: number[] = [];
    const elevationFactors: number[] = [];
    const precipitationFactors: number[] = [];
    const clusterFactors: number[] = [];
    const urgencyScores: number[] = [];
    const urgencyBands: string[] = [];
    const priorityScores: number[] = [];
    const urgencyLevels: string[] = [];
    const newlyHigh: { id: number; office: 'MEO' | 'MDRRMO' }[] = [];

    for (const ticket of tickets) {
      const urgency = computeUrgency({
        elevationM: ticket.elevation_m,
        elevMin,
        elevMax,
        memberCount: ticket.member_count,
        rain1hMm,
      });
      ids.push(ticket.id);
      elevationFactors.push(urgency.elevationFactor);
      precipitationFactors.push(urgency.precipitationFactor);
      clusterFactors.push(urgency.clusterFactor);
      urgencyScores.push(urgency.urgencyScore);
      urgencyBands.push(urgency.urgencyBand);
      priorityScores.push(urgency.priorityScore);
      urgencyLevels.push(urgency.urgencyLevel);

      // Genuine old-vs-new state comparison, not a "have we already
      // notified" flag — naturally idempotent, since a ticket already at
      // High compares High -> High and notifies nothing.
      if (ticket.urgency_band !== 'High' && urgency.urgencyBand === 'High') {
        newlyHigh.push({ id: ticket.id, office: ticket.assigned_office });
      }
    }

    await sql.begin(async (tx) => {
      await tx`
        UPDATE tickets AS t SET
          elevation_factor = u.elevation_factor,
          precipitation_factor = u.precipitation_factor,
          cluster_factor = u.cluster_factor,
          urgency_score = u.urgency_score,
          urgency_band = u.urgency_band,
          priority_score = u.priority_score,
          urgency_level = u.urgency_level,
          updated_at = now()
        FROM (
          SELECT * FROM unnest(
            ${ids}::int[],
            ${elevationFactors}::real[],
            ${precipitationFactors}::real[],
            ${clusterFactors}::real[],
            ${urgencyScores}::real[],
            ${urgencyBands}::text[],
            ${priorityScores}::int[],
            ${urgencyLevels}::text[]
          ) AS u(id, elevation_factor, precipitation_factor, cluster_factor, urgency_score, urgency_band, priority_score, urgency_level)
        ) AS u
        WHERE t.id = u.id
      `;

      for (const ticket of newlyHigh) {
        await this.notifications.createInTx(tx, {
          recipientType: 'admin',
          recipientOffice: ticket.office,
          type: 'ticket_critical',
          title: 'Ticket urgency became high',
          message: `Ticket #${ticket.id} has crossed into the High Hazard Urgency band.`,
          href: `/admin/tickets/${ticket.id}`,
          entityType: 'ticket',
          entityId: ticket.id,
        });
      }
    });

    return { updated: tickets.length, rain1hMm };
  }
}

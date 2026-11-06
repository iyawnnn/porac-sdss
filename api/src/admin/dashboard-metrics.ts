export interface OperationalMetricRow {
  pending: number;
  resolved: number;
  rejected: number;
  municipal: number;
  referred: number;
  legacy: number;
  acknowledged: number;
  awaiting: number;
  median_ack_hours: number | null;
  classified: number;
  no_classification: number;
  unavailable: number;
  unchecked: number;
}

export function shapeOperationalMetrics(row?: OperationalMetricRow) {
  return {
    ticketCounts: {
      pending: row?.pending ?? 0,
      resolved: row?.resolved ?? 0,
      rejected: row?.rejected ?? 0,
    },
    resolutionOutcomes: [
      { label: 'Handled by the municipality', count: row?.municipal ?? 0 },
      { label: 'Referred to an outside agency', count: row?.referred ?? 0 },
      { label: 'Not recorded (legacy)', count: row?.legacy ?? 0 },
    ],
    acknowledgments: {
      acknowledged: row?.acknowledged ?? 0,
      awaiting: row?.awaiting ?? 0,
      medianHours30d: row?.median_ack_hours ?? null,
    },
    hazardInformation: [
      { label: 'Classified', count: row?.classified ?? 0 },
      { label: 'No classification found', count: row?.no_classification ?? 0 },
      { label: 'Unavailable', count: row?.unavailable ?? 0 },
      { label: 'Pending/not yet checked', count: row?.unchecked ?? 0 },
    ],
  };
}

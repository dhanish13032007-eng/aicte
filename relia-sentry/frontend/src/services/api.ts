import axios from 'axios';
import { ComponentData, TelemetryRecord, MissedDetectionEvent, FeedbackCycleRecord } from '../types';

const API_BASE = '/api';

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // 60s for larger lot generation + screening
});

// ─── Demo / Seed Data ────────────────────────────────────────────────────────
export const DEMO_LOT_ID = 'LOT-2026-A7';

export const DEMO_COMPONENTS: ComponentData[] = [
  {
    component_id: 'C-1002',
    lot_id: DEMO_LOT_ID,
    behavior_type: 'AcceleratingDrift',
    risk_score: 76.4,
    decision: 'REJECT',
    anomaly_score: 84.2,
    predicted_168h: 462.8,
    actual_168h: 471.2,
    prediction_error: 8.4,
    confidence_lower: 445.0,
    confidence_upper: 480.0,
    traditional_decision: 'PASS',
    risk_components: {
      anomaly: 84.2,
      drift: 78.5,
      spec_margin: 62.0,
      prediction_risk: 85.0,
      noise: 28.0,
      lot_deviation: 72.4,
    },
    dominant_factor: 'prediction_risk',
    measurements_0h: { power_consumption: 331.2, voltage: 3.30, current: 100.4, temperature: 45.1 },
    measurements_24h: { power_consumption: 339.8, voltage: 3.31, current: 102.6, temperature: 46.2 },
    measurements_96h: { power_consumption: 378.5, voltage: 3.33, current: 113.6, temperature: 52.8 },
  },
  {
    component_id: 'C-1047',
    lot_id: DEMO_LOT_ID,
    behavior_type: 'GradualDrift',
    risk_score: 34.2,
    decision: 'PASS',
    anomaly_score: 32.0,
    predicted_168h: 348.5,
    actual_168h: 351.0,
    prediction_error: 2.5,
    confidence_lower: 338.0,
    confidence_upper: 359.0,
    traditional_decision: 'PASS',
    risk_components: {
      anomaly: 32.0,
      drift: 35.0,
      spec_margin: 25.0,
      prediction_risk: 30.0,
      noise: 15.0,
      lot_deviation: 20.0,
    },
    dominant_factor: 'drift',
    measurements_0h: { power_consumption: 330.1, voltage: 3.30, current: 100.0, temperature: 45.0 },
    measurements_24h: { power_consumption: 332.4, voltage: 3.30, current: 100.7, temperature: 45.2 },
    measurements_96h: { power_consumption: 339.0, voltage: 3.31, current: 102.4, temperature: 45.9 },
  },
  ...Array.from({ length: 46 }, (_, i) => {
    const idNum = 1003 + i;
    const isSpecial = idNum === 1018 || idNum === 1032;
    const isRisky = idNum === 1011 || idNum === 1025;
    const risk = isRisky ? 72.0 + (i % 8) : isSpecial ? 54.0 + (i % 5) : 18.0 + (i % 16);
    const dec: 'PASS' | 'REVIEW' | 'REJECT' = risk >= 70 ? 'REJECT' : risk >= 40 ? 'REVIEW' : 'PASS';
    return {
      component_id: `C-${idNum}`,
      lot_id: DEMO_LOT_ID,
      behavior_type: (isRisky ? 'SuddenSpike' : isSpecial ? 'Borderline' : 'Healthy') as any,
      risk_score: risk,
      decision: dec,
      anomaly_score: risk * 0.9,
      predicted_168h: 330 + (risk - 20) * 1.5,
      actual_168h: 330 + (risk - 20) * 1.55,
      prediction_error: 1.2,
      confidence_lower: 320 + (risk - 20),
      confidence_upper: 345 + (risk - 20) * 2,
      traditional_decision: 'PASS' as 'PASS' | 'FAIL',
      risk_components: {
        anomaly: risk * 0.9,
        drift: risk * 0.8,
        spec_margin: risk * 0.6,
        prediction_risk: risk * 0.7,
        noise: 12.0,
        lot_deviation: 15.0,
      },
      measurements_0h: { power_consumption: 330.0 + (i % 5) - 2.5 },
      measurements_24h: { power_consumption: 331.0 + (i % 6) - 3 },
      measurements_96h: { power_consumption: 332.0 + (risk > 40 ? 25 : 0) },
    };
  }),
];

export const DEMO_MISSED_DETECTIONS: MissedDetectionEvent[] = [
  {
    component_id: 'C-1047',
    burn_in_decision: 'PASS',
    orbit_anomaly_day: 730,
    anomaly_type: 'PowerDrift',
    description:
      'Component passed burn-in at 24h/96h with low risk score (34.2), but exhibited severe power drift (+268%) at mission day 730 during year 2 in orbit.',
  },
];

export const DEMO_FEEDBACK_CYCLES: FeedbackCycleRecord[] = [
  { cycle: 1, missed_detections: 8, detection_rate: 92.0, false_positive_rate: 4.2, previous_threshold: 40.0, new_threshold: 36.5, adjustment_reason: 'Captured 8 missed flight components by tightening drift tolerance.' },
  { cycle: 2, missed_detections: 5, detection_rate: 95.0, false_positive_rate: 5.1, previous_threshold: 36.5, new_threshold: 34.0, adjustment_reason: 'Adjusted acceleration coefficient penalty for high-orbit thermal swings.' },
  { cycle: 3, missed_detections: 2, detection_rate: 98.0, false_positive_rate: 6.0, previous_threshold: 34.0, new_threshold: 32.5, adjustment_reason: 'Refined multivariate cross-parameter anomaly sensitivity.' },
  { cycle: 4, missed_detections: 1, detection_rate: 99.0, false_positive_rate: 6.5, previous_threshold: 32.5, new_threshold: 32.0, adjustment_reason: 'Optimal screening threshold plateau reached for this component archetype.' },
];

// ─── Live API Functions ──────────────────────────────────────────────────────

/** Map a screening result from the backend into the frontend ComponentData shape */
function mapScreeningResult(r: any, lotId: string): ComponentData {
  const riskComp = r.risk?.components || {};
  return {
    component_id: r.component_id,
    lot_id: lotId,
    behavior_type: (r.behavior_type || 'Healthy') as ComponentData['behavior_type'],
    risk_score: r.risk?.risk_score ?? 0,
    decision: (r.decision || 'PASS') as ComponentData['decision'],
    anomaly_score: r.anomaly_score ?? 0,
    predicted_168h: r.predicted_168h ?? 0,
    actual_168h: r.actual_168h ?? undefined,
    prediction_error: r.prediction_error ?? undefined,
    confidence_lower: r.confidence_lower ?? undefined,
    confidence_upper: r.confidence_upper ?? undefined,
    traditional_decision: 'PASS',
    risk_components: {
      anomaly: riskComp.anomaly ?? r.anomaly_score ?? 0,
      drift: riskComp.drift ?? 0,
      spec_margin: riskComp.spec_margin ?? 0,
      prediction_risk: riskComp.prediction_risk ?? 0,
      noise: riskComp.noise ?? 0,
      lot_deviation: riskComp.lot_deviation ?? 0,
    },
    dominant_factor: r.risk?.dominant_factor,
    measurements_0h: r.measurements_0h,
    measurements_24h: r.measurements_24h,
    measurements_96h: r.measurements_96h,
  };
}

/**
 * POST /api/data/generate — generate a lot on the backend.
 * Returns lot metadata.
 */
export async function generateLot(
  lotId: string,
  nComponents: number,
  temperature: number,
  burnInHours: number,
  seed?: number
): Promise<{ lot_id: string; n_components: number; behavior_summary: Record<string, number> }> {
  const { data } = await apiClient.post('/data/generate', {
    lot_id: lotId,
    n_components: nComponents,
    temperature,
    burn_in_hours: burnInHours,
    seed,
  });
  return data;
}

/**
 * POST /api/screening/screen-lot/{lot_id} — run AI screening on a lot.
 * Returns an array of ComponentData mapped from the backend response.
 */
export async function screenLot(lotId: string): Promise<ComponentData[]> {
  const { data } = await apiClient.post(
    `/screening/screen-lot/${encodeURIComponent(lotId)}`
  );
  return (data.results as any[]).map((r) => mapScreeningResult(r, lotId));
}

/**
 * GET /api/screening/component/{component_id} — get details for a single component.
 */
export async function getComponentDetail(componentId: string): Promise<any> {
  const { data } = await apiClient.get(
    `/screening/component/${encodeURIComponent(componentId)}`
  );
  return data;
}

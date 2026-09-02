export type DecisionType = 'PASS' | 'REVIEW' | 'REJECT';
export type BehaviorType =
  | 'Healthy'
  | 'GradualDrift'
  | 'AcceleratingDrift'
  | 'SuddenSpike'
  | 'Noisy'
  | 'Borderline'
  | 'Multivariate';

export type SubsystemType = 'Power' | 'Thermal' | 'Communication' | 'Attitude Control' | 'Payload';

export interface ComponentMeasurement {
  voltage: number;
  current: number;
  resistance: number;
  leakage_current: number;
  power_consumption: number;
  temperature: number;
  frequency: number;
  noise: number;
}

export interface ComponentData {
  component_id: string;
  lot_id: string;
  behavior_type: BehaviorType;
  risk_score: number;
  decision: DecisionType;
  anomaly_score: number;
  predicted_168h: number;
  actual_168h?: number;
  prediction_error?: number;
  confidence_lower?: number;
  confidence_upper?: number;
  traditional_decision?: 'PASS' | 'FAIL';
  risk_components?: {
    anomaly: number;
    drift: number;
    spec_margin: number;
    prediction_risk: number;
    noise: number;
    lot_deviation: number;
  };
  dominant_factor?: string;
  measurements_0h?: Record<string, number>;
  measurements_24h?: Record<string, number>;
  measurements_96h?: Record<string, number>;
  review_status?: string;
  assigned_to?: string;
  notes?: string;
}

export interface LotSummary {
  lot_id: string;
  total_components: number;
  pass_count: number;
  review_count: number;
  reject_count: number;
  avg_risk: number;
  max_risk: number;
  anomaly_rate: number;
  burn_in_duration: number;
  temperature: number;
}

export interface TelemetryRecord {
  component_id: string;
  subsystem: SubsystemType;
  degradation_archetype: string;
  mission_day: number;
  power_consumption: number;
  current: number;
  voltage: number;
  temperature: number;
  frequency: number;
  signal_strength: number;
  is_anomalous: boolean;
  anomaly_type?: string;
  expected_power: number;
  deviation_pct: number;
}

export interface MissedDetectionEvent {
  component_id: string;
  burn_in_decision: string;
  orbit_anomaly_day: number;
  anomaly_type: string;
  description: string;
}

export interface FeedbackCycleRecord {
  cycle: number;
  missed_detections: number;
  detection_rate: number;
  false_positive_rate: number;
  previous_threshold: number;
  new_threshold: number;
  adjustment_reason: string;
}

export interface ModelMetrics {
  is_trained: boolean;
  training_samples: number;
  mae?: number;
  rmse?: number;
  version: string;
  feature_importance?: Record<string, number>;
}

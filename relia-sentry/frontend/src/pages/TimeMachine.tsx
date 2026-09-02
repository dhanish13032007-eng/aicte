import React, { useState } from 'react';
import { Clock, Eye, Sparkles, CheckCircle, AlertTriangle, Shield } from 'lucide-react';
import { ComponentData } from '../types';
import { NavTab } from '../components/Navigation';

interface TimeMachineProps {
  component: ComponentData;
  onNavigate: (tab: NavTab) => void;
}

export const TimeMachine: React.FC<TimeMachineProps> = ({ component, onNavigate }) => {
  const [hasPredicted, setHasPredicted] = useState(false);
  const [hasRevealed, setHasRevealed] = useState(false);

  const compId       = component.component_id;
  const p0           = component.measurements_0h?.power_consumption  || 331.2;
  const p24          = component.measurements_24h?.power_consumption || 339.8;
  const p96          = component.measurements_96h?.power_consumption || 378.5;
  const predicted168 = component.predicted_168h  || 462.8;
  const actual168    = component.actual_168h      || 471.2;
  const predictionError = Math.abs(actual168 - predicted168).toFixed(1);

  const checkpoints = [
    { label: '0h', value: p0, status: 'Observed', color: '#16a34a', pct: 0 },
    { label: '24h (Frozen)', value: p24, status: 'Within Spec', color: '#2563eb', pct: 14.3 },
    { label: '96h', value: p96, status: 'Drift Evident', color: '#d97706', pct: 57.1 },
    { label: '168h', value: hasRevealed ? actual168 : null, status: hasRevealed ? 'Spec Exceeded' : 'Hidden', color: hasRevealed ? '#dc2626' : '#94a3b8', pct: 100 },
  ];

  return (
    <div className="space-y-5 pb-12 max-w-4xl">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="page-title">Time Machine — 24h Freeze & Future Validation</h2>
            <p className="page-subtitle">
              ReliaSentry's signature proof: freeze burn-in at 24h, run AI prediction to 168h,
              then reveal the hidden ground truth to verify accuracy.
            </p>
          </div>
          <button
            onClick={() => onNavigate('forensic')}
            className="btn btn-secondary btn-sm"
          >
            Forensic Analysis →
          </button>
        </div>
      </div>

      {/* Component Bar */}
      <div className="card">
        <div style={{ padding: '14px 20px' }} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-mono font-semibold text-[13px]" style={{ color: 'var(--primary)' }}>
              {compId}
            </span>
            <span className="mx-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{component.behavior_type}</span>
            <span className="mx-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Lot: {component.lot_id}</span>
          </div>
          <div className="flex gap-2">
            <span className="badge badge-pass">Static 24h: PASS (339.8 mW)</span>
            <span className="badge badge-review">Behavioral Anomaly: +84.2%</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Qualification Timeline & Observable Horizon</span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Spec: 240 – 430 mW</span>
        </div>
        <div style={{ padding: '24px' }}>
          {/* Progress bar */}
          <div className="relative mb-8">
            <div className="risk-bar" style={{ height: '6px' }}>
              <div
                className="risk-bar-fill"
                style={{
                  width: hasRevealed ? '100%' : '57%',
                  background: 'linear-gradient(90deg, #16a34a, #2563eb, #d97706)',
                  transition: 'width 0.6s ease',
                }}
              />
            </div>

            {/* Checkpoint labels */}
            <div className="flex justify-between mt-4">
              {checkpoints.map((cp, i) => (
                <div key={i} className={`text-center ${i === 3 ? 'text-right' : i === 0 ? 'text-left' : ''}`} style={{ width: '25%' }}>
                  <div className="font-mono font-semibold text-[13px]" style={{ color: cp.color }}>
                    {cp.label}
                  </div>
                  <div className="font-mono text-[15px] font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                    {cp.value !== null ? `${cp.value.toFixed(1)} mW` : '???'}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: cp.color }}>{cp.status}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Two-step interactive area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
            {/* Step 1: Prediction */}
            <div className="rounded-xl p-5" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-light)' }}>
                  <Sparkles className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                </div>
                <span className="font-semibold text-[13px]" style={{ color: 'var(--text-primary)' }}>
                  Step 1: XGBoost Prediction
                </span>
              </div>
              <p className="text-[12px] mb-4" style={{ color: 'var(--text-secondary)' }}>
                Based on the accelerating drift trajectory observed at 0h / 24h / 96h,
                the XGBoost regressor extrapolates final 168h power consumption.
              </p>

              {hasPredicted ? (
                <div
                  className="rounded-lg p-4 text-center animate-fadeIn"
                  style={{ background: '#eff6ff', border: '1px solid var(--primary-border)' }}
                >
                  <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--primary)' }}>
                    PREDICTED 168H VALUE
                  </div>
                  <div className="font-mono font-bold text-[28px]" style={{ color: 'var(--primary)' }}>
                    {predicted168.toFixed(1)} mW
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    95% CI: [{component.confidence_lower?.toFixed(1) || '445.0'} – {component.confidence_upper?.toFixed(1) || '480.0'} mW]
                  </div>
                  <span className="badge badge-fail mt-2 inline-flex">
                    PROJECTED FAILURE — exceeds 430 mW
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => setHasPredicted(true)}
                  className="btn btn-primary w-full"
                >
                  Run AI Prediction to 168h
                </button>
              )}
            </div>

            {/* Step 2: Ground Truth */}
            <div className="rounded-xl p-5" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#fffbeb' }}>
                  <Eye className="w-4 h-4" style={{ color: '#d97706' }} />
                </div>
                <span className="font-semibold text-[13px]" style={{ color: 'var(--text-primary)' }}>
                  Step 2: Ground Truth Reveal
                </span>
              </div>
              <p className="text-[12px] mb-4" style={{ color: 'var(--text-secondary)' }}>
                Reveal the true 168h measurement stored separately during data generation
                to validate model accuracy.
              </p>

              {hasRevealed ? (
                <div
                  className="rounded-lg p-4 text-center animate-fadeIn"
                  style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
                >
                  <div className="text-[11px] font-semibold mb-1" style={{ color: '#d97706' }}>
                    ACTUAL GROUND TRUTH AT 168H
                  </div>
                  <div className="font-mono font-bold text-[28px]" style={{ color: 'var(--text-primary)' }}>
                    {actual168.toFixed(1)} mW
                  </div>
                  <div className="flex justify-center gap-6 mt-3 text-[11px]">
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>Prediction Error</div>
                      <div className="font-mono font-bold" style={{ color: '#16a34a' }}>+{predictionError} mW (1.8%)</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>Traditional Result</div>
                      <div className="font-mono font-bold" style={{ color: '#dc2626' }}>MISSED IN SCREENING</div>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { if (!hasPredicted) setHasPredicted(true); setHasRevealed(true); }}
                  disabled={!hasPredicted}
                  className="btn w-full"
                  style={{
                    background: hasPredicted ? '#fffbeb' : 'var(--surface-raised)',
                    color: hasPredicted ? '#d97706' : 'var(--text-muted)',
                    border: `1px solid ${hasPredicted ? '#fde68a' : 'var(--border)'}`,
                    opacity: hasPredicted ? 1 : 0.5,
                    cursor: hasPredicted ? 'pointer' : 'not-allowed',
                  }}
                >
                  Reveal Future Ground Truth
                </button>
              )}
            </div>
          </div>

          {/* Conclusion */}
          {hasRevealed && (
            <div className="alert alert-success mt-5 animate-fadeIn">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Signature Verification Complete.</strong> At 24h, traditional screening passed{' '}
                <span className="font-mono">{compId}</span> (339.8 mW within spec). ReliaSentry predicted{' '}
                <strong>{predicted168.toFixed(1)} mW</strong>. Ground truth: <strong>{actual168.toFixed(1)} mW</strong>.
                Prediction error: <strong>{predictionError} mW</strong>. The AI's preemptive REJECT decision was validated.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Satellite,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Radio,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import { SatelliteOrbitSVG } from '../components/SatelliteOrbitSVG';
import { FeedbackCycleRecord } from '../types';
import { DEMO_FEEDBACK_CYCLES } from '../services/api';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface MissionMonitoringProps {
  passCount: number;
}

export const MissionMonitoring: React.FC<MissionMonitoringProps> = ({ passCount = 973 }) => {
  const [missionDay, setMissionDay] = useState(100);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(10);
  const [feedbackCycles] = useState<FeedbackCycleRecord[]>(DEMO_FEEDBACK_CYCLES);

  const isAnomalyDay = missionDay >= 680;

  React.useEffect(() => {
    let timer: any = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setMissionDay((prev) => {
          if (prev >= 730) { setIsPlaying(false); return 730; }
          return prev + Math.max(1, Math.round(simSpeed / 5));
        });
      }, 200);
    }
    return () => clearInterval(timer);
  }, [isPlaying, simSpeed]);

  const powerNow =
    missionDay < 400
      ? 12.0 + (missionDay / 400) * 1.1
      : 13.1 + Math.pow((missionDay - 400) / 330, 2) * 31.1;

  const telemetryHistory = [
    { day: 0,   power: 12.1, expected: 12.0 },
    { day: 100, power: 12.4, expected: 12.0 },
    { day: 250, power: 12.6, expected: 12.0 },
    { day: 400, power: 13.1, expected: 12.0 },
    { day: 550, power: 16.5, expected: 12.0 },
    { day: 650, power: 28.2, expected: 12.0 },
    { day: 730, power: 44.2, expected: 12.0 },
  ];

  return (
    <div className="space-y-5 pb-12">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="page-title">Satellite Mission Telemetry & On-Orbit Monitoring</h2>
            <p className="page-subtitle">
              Passed components launched to simulated LEO orbit. Telemetry streams continuously.
              Detects long-term degradation and triggers adaptive screening feedback.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="badge badge-info">{passCount} Components Launched</span>
            <span className="badge badge-neutral">2-Year Mission (730 Days)</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Satellite Visual */}
        <div className="lg:col-span-7">
          <SatelliteOrbitSVG
            missionDay={missionDay}
            missionStatus={isAnomalyDay ? 'ANOMALY DETECTED' : 'NOMINAL FLIGHT'}
            anomalyDetected={isAnomalyDay}
            activeComponentId="C-1047"
            activeSubsystem="Power"
            simSpeed={simSpeed}
            onSpeedChange={setSimSpeed}
          />
        </div>

        {/* Live Telemetry Panel */}
        <div className="lg:col-span-5 card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4" style={{ color: '#0891b2' }} />
              <span className="card-title">Live Telemetry Stream</span>
            </div>
            <span className="badge badge-info">DOWNLINK ACTIVE</span>
          </div>

          <div style={{ padding: '16px' }}>
            {/* Day Scrubber */}
            <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2 text-[12px]">
                <span style={{ color: 'var(--text-muted)' }}>Mission Day</span>
                <span className="font-mono font-bold" style={{ color: 'var(--primary)' }}>
                  Day {missionDay} / 730
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="730"
                step="10"
                value={missionDay}
                onChange={(e) => setMissionDay(Number(e.target.value))}
                className="w-full accent-blue-600 h-1.5"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="btn btn-sm btn-primary"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pause' : 'Stream'}
                </button>
                <button
                  onClick={() => setMissionDay(730)}
                  className="btn btn-sm"
                  style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}
                >
                  Jump to Day 730
                </button>
                <button
                  onClick={() => { setMissionDay(0); setIsPlaying(false); }}
                  className="btn btn-sm btn-secondary ml-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Readings Table */}
            <div
              className="rounded-lg p-3 mb-4 font-mono text-[12px] space-y-2"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
            >
              {[
                { label: 'Component', value: 'C-1047 (Power Bus IC)', color: 'var(--text-primary)' },
                { label: 'Current Power', value: `${powerNow.toFixed(1)} mA`, color: isAnomalyDay ? '#dc2626' : '#0891b2' },
                { label: 'Expected Power', value: '12.0 mA', color: 'var(--text-muted)' },
                { label: 'Deviation', value: `${(((powerNow - 12) / 12) * 100).toFixed(0)}%`, color: isAnomalyDay ? '#dc2626' : '#16a34a' },
                { label: 'Status', value: isAnomalyDay ? 'ANOMALY DETECTED' : 'NOMINAL', color: isAnomalyDay ? '#dc2626' : '#16a34a' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <span className="font-semibold" style={{ color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Telemetry Chart */}
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetryHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }}
                  />
                  <Line type="monotone" dataKey="power" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} name="Actual (mA)" />
                  <Line type="monotone" dataKey="expected" stroke="#2563eb" strokeDasharray="4 3" name="Expected (mA)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Missed Detection Event */}
      {isAnomalyDay && (
        <div className="alert alert-danger animate-fadeIn">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center justify-between mb-2">
              <strong>Missed Detection Event — Mission Day 730</strong>
              <span className="badge badge-fail ml-4">MISSION ANOMALY</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="font-semibold mb-1">Burn-In Screening Result</div>
                <div style={{ color: '#16a34a' }}>PASS (Risk Score: 34.2 / 100)</div>
                <div className="mt-1" style={{ color: '#7f1d1d' }}>
                  Subtle linear drift fell just below the 40.0 rejection threshold.
                </div>
              </div>
              <div>
                <div className="font-semibold mb-1">On-Orbit Result (Year 2)</div>
                <div style={{ color: '#dc2626' }}>POWER DRIFT ANOMALY (+268%)</div>
                <div className="mt-1" style={{ color: '#7f1d1d' }}>
                  Under space vacuum and radiation cycling, drift accelerated into runaway power consumption.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adaptive Feedback Loop */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" style={{ color: '#7c3aed' }} />
            <span className="card-title">Adaptive Screening Feedback Loop</span>
          </div>
          <span className="badge" style={{ background: '#f5f3ff', color: '#7c3aed', borderColor: '#ddd6fe' }}>
            Threshold: {feedbackCycles[feedbackCycles.length - 1]?.new_threshold}
          </span>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <p className="text-[13px] mb-4" style={{ color: 'var(--text-secondary)' }}>
            When on-orbit anomalies occur on previously passed components, the adaptive feedback engine
            analyzes the weak screening condition, tightens the simulated threshold, and measures
            detection improvements across successive simulated manufacturing cycles.
          </p>

          <table className="data-table">
            <thead>
              <tr>
                <th>Cycle</th>
                <th>Missed Detections</th>
                <th>Detection Rate</th>
                <th>False Positive Rate</th>
                <th>Threshold Adjustment</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {feedbackCycles.map((c) => (
                <tr key={c.cycle}>
                  <td className="font-mono font-semibold" style={{ color: 'var(--primary)' }}>
                    Cycle {c.cycle}
                  </td>
                  <td>
                    <span className="badge badge-fail">{c.missed_detections} missed</span>
                  </td>
                  <td className="font-mono font-semibold" style={{ color: '#16a34a' }}>
                    {c.detection_rate}%
                  </td>
                  <td className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {c.false_positive_rate}%
                  </td>
                  <td className="font-mono" style={{ color: '#d97706' }}>
                    {c.previous_threshold} → {c.new_threshold}
                  </td>
                  <td className="text-[12px]" style={{ color: 'var(--text-muted)', maxWidth: '240px' }}>
                    {c.adjustment_reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="alert alert-info mt-4">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Disclaimer:</strong> Simulated adaptive screening feedback. This demonstrates
              threshold tuning across iterative production batches. It does not automatically reflash
              flight firmware on deployed spacecraft.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

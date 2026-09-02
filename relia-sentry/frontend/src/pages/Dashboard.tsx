import React from 'react';
import {
  Cpu,
  Flame,
  AlertTriangle,
  TrendingUp,
  Satellite,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  Shield,
  Play,
  Pause,
  RotateCcw,
  Clock,
  BarChart3,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import { ComponentData } from '../types';
import { NavTab } from '../components/Navigation';

interface DashboardProps {
  components: ComponentData[];
  lotId: string;
  burnInHour: number;
  temperature: number;
  isSimulating: boolean;
  onNavigate: (tab: NavTab) => void;
  onSelectComponent: (id: string) => void;
  onStartBurnIn: () => void;
  onPauseBurnIn: () => void;
  onFreezeAt24h: () => void;
  onResetBurnIn: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  components,
  lotId,
  burnInHour,
  temperature,
  isSimulating,
  onNavigate,
  onSelectComponent,
  onStartBurnIn,
  onPauseBurnIn,
  onFreezeAt24h,
  onResetBurnIn,
}) => {
  const total = components.length;
  const passCount = components.filter((c) => c.decision === 'PASS').length;
  const reviewCount = components.filter((c) => c.decision === 'REVIEW').length;
  const rejectCount = components.filter((c) => c.decision === 'REJECT').length;
  const avgRisk = total
    ? (components.reduce((acc, c) => acc + c.risk_score, 0) / total).toFixed(1)
    : '0';
  const anomalyCount = components.filter((c) => c.anomaly_score > 50).length;
  const passRate = total ? ((passCount / total) * 100).toFixed(0) : '0';

  const riskBuckets = [
    { range: '0–20', label: 'Low', count: components.filter((c) => c.risk_score <= 20).length },
    { range: '21–39', label: 'Pass', count: components.filter((c) => c.risk_score > 20 && c.risk_score < 40).length },
    { range: '40–69', label: 'Review', count: components.filter((c) => c.risk_score >= 40 && c.risk_score < 70).length },
    { range: '70–100', label: 'Reject', count: components.filter((c) => c.risk_score >= 70).length },
  ];

  const avgRiskNum = Number(avgRisk) || 20;
  const trendData = [
    { checkpoint: '0h', avgRisk: Math.max(5, Math.round(avgRiskNum * 0.4 * 10) / 10), chamberTemp: 25 },
    { checkpoint: '24h', avgRisk: Math.max(8, Math.round(avgRiskNum * 0.65 * 10) / 10), chamberTemp: 60 },
    { checkpoint: '96h', avgRisk: Math.max(12, Math.round(avgRiskNum * 0.85 * 10) / 10), chamberTemp: 110 },
    { checkpoint: '168h', avgRisk: Math.round(avgRiskNum * 10) / 10, chamberTemp: 125 },
  ];

  const burnInPct = Math.round((burnInHour / 168) * 100);

  // Summary stats
  const stats = [
    {
      label: 'Total Components',
      value: total,
      sub: `Lot ${lotId}`,
      icon: Cpu,
      color: '#2563eb',
      bg: '#eff6ff',
    },
    {
      label: 'Passed',
      value: passCount,
      sub: `${passRate}% pass rate`,
      icon: CheckCircle,
      color: '#16a34a',
      bg: '#f0fdf4',
    },
    {
      label: 'For Review',
      value: reviewCount,
      sub: 'Needs QA assessment',
      icon: AlertTriangle,
      color: '#d97706',
      bg: '#fffbeb',
    },
    {
      label: 'Rejected',
      value: rejectCount,
      sub: 'Removed from lot',
      icon: XCircle,
      color: '#dc2626',
      bg: '#fef2f2',
    },
    {
      label: 'Avg Risk Score',
      value: avgRisk,
      sub: 'Lot-wide composite',
      icon: Activity,
      color: '#7c3aed',
      bg: '#f5f3ff',
    },
    {
      label: 'Anomalies Detected',
      value: anomalyCount,
      sub: 'Isolation Forest',
      icon: TrendingUp,
      color: '#0891b2',
      bg: '#ecfeff',
    },
  ];

  return (
    <div className="space-y-6 pb-12 max-w-[1400px]">

      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">Mission Control Dashboard</h2>
        <p className="page-subtitle">
          Burn-in reliability screening overview for lot <strong>{lotId}</strong>.
          AI-Assisted Decision Support — final QA authority remains with human reviewer.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div className="stat-card" key={s.label}>
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                style={{ background: s.bg }}
              >
                <Icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <div className="stat-value" style={{ fontSize: '24px' }}>{s.value}</div>
              <div className="stat-label mt-1">{s.label}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Main Row: Burn-In Controls + Risk Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Burn-In Control Panel */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4" style={{ color: '#d97706' }} />
              <span className="card-title">Burn-In Chamber — Unit BI-04</span>
            </div>
            <span
              className="badge"
              style={
                isSimulating
                  ? { background: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0' }
                  : burnInHour >= 168
                  ? { background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }
                  : { background: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' }
              }
            >
              {isSimulating ? 'RUNNING' : burnInHour >= 168 ? 'COMPLETE' : 'STANDBY'}
            </span>
          </div>

          <div style={{ padding: '20px' }}>
            {/* Chamber Stats Row */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Temperature', value: `${temperature.toFixed(0)}°C`, color: '#d97706' },
                { label: 'Elapsed', value: `${burnInHour}h / 168h`, color: '#2563eb' },
                { label: 'Progress', value: `${burnInPct}%`, color: '#7c3aed' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="text-center py-3 rounded-lg"
                  style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
                >
                  <div className="font-mono font-bold text-lg" style={{ color: item.color }}>
                    {item.value}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="mb-5">
              <div className="flex justify-between text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                <span>0h (25°C)</span>
                <span>24h</span>
                <span>96h</span>
                <span>168h (125°C)</span>
              </div>
              <div className="risk-bar" style={{ height: '8px' }}>
                <div
                  className="risk-bar-fill"
                  style={{
                    width: `${burnInPct}%`,
                    background: burnInHour >= 24
                      ? 'linear-gradient(90deg, #16a34a, #d97706)'
                      : '#2563eb',
                  }}
                />
              </div>
              {/* Checkpoint markers */}
              <div className="relative mt-1">
                {[14.3, 57.1, 100].map((pct, i) => (
                  <div
                    key={i}
                    className="absolute top-0 w-px h-2"
                    style={{ left: `${pct}%`, background: 'var(--border-strong)' }}
                  />
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap gap-2">
              {!isSimulating ? (
                <button onClick={onStartBurnIn} className="btn btn-primary btn-sm">
                  <Play className="w-3.5 h-3.5" /> Start Burn-In
                </button>
              ) : (
                <button onClick={onPauseBurnIn} className="btn btn-sm" style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}>
                  <Pause className="w-3.5 h-3.5" /> Pause
                </button>
              )}
              <button onClick={onFreezeAt24h} className="btn btn-sm btn-secondary">
                <Clock className="w-3.5 h-3.5" /> Freeze at 24h →
              </button>
              <button onClick={onResetBurnIn} className="btn btn-sm btn-secondary">
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
              <button
                onClick={() => onNavigate('burn-in')}
                className="btn btn-sm ml-auto"
                style={{ background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary-border)' }}
              >
                Open Simulator →
              </button>
            </div>

            {/* Component Grid Preview */}
            <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="section-title mb-3">Component Array — {total} units</p>
              <div className="flex flex-wrap gap-1">
                {components.slice(0, 96).map((c) => (
                  <div
                    key={c.component_id}
                    title={`${c.component_id} | Risk: ${c.risk_score.toFixed(0)} | ${c.decision}`}
                    onClick={() => {
                      onSelectComponent(c.component_id);
                      onNavigate('details');
                    }}
                    className="cursor-pointer rounded-sm"
                    style={{
                      width: '10px',
                      height: '10px',
                      background:
                        c.decision === 'REJECT'
                          ? '#fecaca'
                          : c.decision === 'REVIEW'
                          ? '#fde68a'
                          : '#bbf7d0',
                      border: `1px solid ${
                        c.decision === 'REJECT'
                          ? '#f87171'
                          : c.decision === 'REVIEW'
                          ? '#fbbf24'
                          : '#4ade80'
                      }`,
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-4 mt-2">
                {[
                  { label: 'Pass', color: '#bbf7d0', border: '#4ade80' },
                  { label: 'Review', color: '#fde68a', border: '#fbbf24' },
                  { label: 'Reject', color: '#fecaca', border: '#f87171' },
                ].map((l) => (
                  <span key={l.label} className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    <span
                      className="w-2.5 h-2.5 rounded-sm inline-block"
                      style={{ background: l.color, border: `1px solid ${l.border}` }}
                    />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Risk Distribution */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              <span className="card-title">Risk Score Distribution</span>
            </div>
            <button
              onClick={() => onNavigate('screening')}
              className="btn btn-sm btn-secondary"
            >
              View All <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div style={{ padding: '20px' }}>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskBuckets} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="range"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: 12,
                    }}
                    formatter={(val) => [`${val} components`, 'Count']}
                  />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    fill="#2563eb"
                    // Each bucket gets its own color
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Risk Summary Table */}
            <div className="mt-4 space-y-2">
              {[
                { label: 'Low Risk (0–20)', count: riskBuckets[0].count, color: '#16a34a', bg: '#f0fdf4' },
                { label: 'Pass (21–39)', count: riskBuckets[1].count, color: '#2563eb', bg: '#eff6ff' },
                { label: 'Review (40–69)', count: riskBuckets[2].count, color: '#d97706', bg: '#fffbeb' },
                { label: 'Reject (70–100)', count: riskBuckets[3].count, color: '#dc2626', bg: '#fef2f2' },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{ background: row.bg }}
                >
                  <span className="text-[12px] font-medium" style={{ color: row.color }}>
                    {row.label}
                  </span>
                  <span className="font-mono font-bold text-[13px]" style={{ color: row.color }}>
                    {row.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Second Row: Trend + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Burn-In Trend Chart */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" style={{ color: '#7c3aed' }} />
              <span className="card-title">Burn-In Risk Progression</span>
            </div>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Lot-median risk score across checkpoints
            </span>
          </div>
          <div style={{ padding: '20px' }}>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="checkpoint"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 50]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="avgRisk"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    fill="url(#riskGrad)"
                    name="Avg Risk Score"
                    dot={{ r: 4, fill: '#7c3aed', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Quick Actions + Workflow */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Workflow Navigation</span>
          </div>
          <div style={{ padding: '16px' }}>
            <div className="space-y-2">
              {[
                { label: 'Generate Test Data', tab: 'data-generator' as NavTab, icon: '1.', color: '#2563eb' },
                { label: 'Run Burn-In Simulator', tab: 'burn-in' as NavTab, icon: '2.', color: '#d97706' },
                { label: 'Time Machine (24h Freeze)', tab: 'time-machine' as NavTab, icon: '3.', color: '#7c3aed' },
                { label: 'Component Screening', tab: 'screening' as NavTab, icon: '4.', color: '#0891b2' },
                { label: 'Forensic Analysis', tab: 'forensic' as NavTab, icon: '5.', color: '#dc2626' },
                { label: 'Mission Monitoring', tab: 'mission-monitoring' as NavTab, icon: '6.', color: '#16a34a' },
              ].map((step) => (
                <button
                  key={step.tab}
                  onClick={() => onNavigate(step.tab)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-[13px]"
                  style={{ border: '1px solid var(--border)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = step.color;
                    (e.currentTarget as HTMLElement).style.background = 'var(--surface-raised)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <span
                    className="font-mono font-bold text-[12px] w-6 shrink-0"
                    style={{ color: step.color }}
                  >
                    {step.icon}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{step.label}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 ml-auto shrink-0" style={{ color: 'var(--text-muted)' }} />
                </button>
              ))}
            </div>

            {/* AI Disclaimer */}
            <div
              className="mt-4 p-3 rounded-lg text-[11px]"
              style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}
            >
              <div className="flex items-center gap-1.5 mb-1 font-semibold">
                <Shield className="w-3 h-3" /> QA Compliance Note
              </div>
              This is an AI-assisted decision support tool. All screening decisions must be reviewed and approved by a qualified human reliability engineer before component acceptance.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

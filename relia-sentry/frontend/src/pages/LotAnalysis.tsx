import React from 'react';
import { BarChart3, Layers, CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { ComponentData } from '../types';

interface LotAnalysisProps {
  components: ComponentData[];
  lotId: string;
}

export const LotAnalysis: React.FC<LotAnalysisProps> = ({ components, lotId }) => {
  const total = components.length;
  const pass = components.filter((c) => c.decision === 'PASS').length;
  const review = components.filter((c) => c.decision === 'REVIEW').length;
  const reject = components.filter((c) => c.decision === 'REJECT').length;
  const avgRisk = total ? (components.reduce((a, b) => a + b.risk_score, 0) / total).toFixed(1) : '0';
  const maxRisk = total ? Math.max(...components.map((c) => c.risk_score)).toFixed(1) : '0';

  const decisionPie = [
    { name: 'PASS', value: pass, color: '#16a34a' },
    { name: 'REVIEW', value: review, color: '#d97706' },
    { name: 'REJECT', value: reject, color: '#dc2626' },
  ];

  // Dynamic Risk Distribution Histogram
  const riskHistogram = [
    { bin: '0–20 (Low)', count: components.filter((c) => c.risk_score <= 20).length },
    { bin: '21–40 (Nominal)', count: components.filter((c) => c.risk_score > 20 && c.risk_score <= 40).length },
    { bin: '41–60 (Elevated)', count: components.filter((c) => c.risk_score > 40 && c.risk_score <= 60).length },
    { bin: '61–80 (Warning)', count: components.filter((c) => c.risk_score > 60 && c.risk_score <= 80).length },
    { bin: '81–100 (Critical)', count: components.filter((c) => c.risk_score > 80).length },
  ];

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Header */}
      <div className="page-header">
        <h2 className="page-title">Lot Analysis & Population Statistics — {lotId}</h2>
        <p className="page-subtitle">
          Aggregate distribution analytics, screening yield profiles, and risk histograms across the complete manufacturing batch.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="stat-label">QUALIFICATION BATCH</div>
          <div className="stat-value text-slate-800 mt-1">{total} Units</div>
          <div className="stat-sub">Screened with XGBoost & IF</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">LOT YIELD (PASS)</div>
          <div className="stat-value text-emerald-600 mt-1">
            {total ? ((pass / total) * 100).toFixed(1) : 0}%
          </div>
          <div className="stat-sub">{pass} Qualified Units</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">AVERAGE RISK SCORE</div>
          <div className="stat-value text-blue-600 mt-1">{avgRisk}</div>
          <div className="stat-sub">Lot Mean Index</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">PEAK OUTLIER RISK</div>
          <div className="stat-value text-rose-600 mt-1">{maxRisk}</div>
          <div className="stat-sub">Highest Flagged Risk</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Yield Pie Chart */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-bold text-slate-800">Screening Yield Breakdown</h3>
            <span className="text-xs text-slate-500 font-mono">Lot {lotId}</span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={decisionPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {decisionPie.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                  formatter={(value: any) => [`${value} Units (${((Number(value) / (total || 1)) * 100).toFixed(1)}%)`, 'Count']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="text-center p-2 rounded bg-emerald-50 border border-emerald-200">
              <div className="text-xs font-semibold text-emerald-800">PASS</div>
              <div className="text-lg font-bold text-emerald-600">{pass}</div>
              <div className="text-[11px] text-emerald-700">{total ? ((pass / total) * 100).toFixed(0) : 0}%</div>
            </div>
            <div className="text-center p-2 rounded bg-amber-50 border border-amber-200">
              <div className="text-xs font-semibold text-amber-800">REVIEW</div>
              <div className="text-lg font-bold text-amber-600">{review}</div>
              <div className="text-[11px] text-amber-700">{total ? ((review / total) * 100).toFixed(0) : 0}%</div>
            </div>
            <div className="text-center p-2 rounded bg-rose-50 border border-rose-200">
              <div className="text-xs font-semibold text-rose-800">REJECT</div>
              <div className="text-lg font-bold text-rose-600">{reject}</div>
              <div className="text-[11px] text-rose-700">{total ? ((reject / total) * 100).toFixed(0) : 0}%</div>
            </div>
          </div>
        </div>

        {/* Risk Distribution Bar Chart */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-bold text-slate-800">Risk Score Histogram</h3>
            <span className="text-xs text-slate-500 font-mono">5 Bins</span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskHistogram} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="bin" tick={{ fill: '#64748b', fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                  formatter={(val: any) => [`${val} Units`, 'Frequency']}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              Risk distribution reflects combined isolation forest anomaly scores, parameter drift rates, and predicted 168h margins.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

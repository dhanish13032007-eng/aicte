import React, { useState } from 'react';
import {
  Cpu,
  Search,
  SlidersHorizontal,
  ChevronRight,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
} from 'lucide-react';
import { ComponentData } from '../types';
import { NavTab } from '../components/Navigation';

interface ComponentScreeningProps {
  components: ComponentData[];
  selectedComponentId: string;
  onSelectComponent: (id: string) => void;
  onNavigate: (tab: NavTab) => void;
}

type SortKey = 'risk_score' | 'anomaly_score' | 'component_id' | 'decision';

export const ComponentScreening: React.FC<ComponentScreeningProps> = ({
  components,
  selectedComponentId,
  onSelectComponent,
  onNavigate,
}) => {
  const [search, setSearch] = useState('');
  const [filterDecision, setFilterDecision] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('risk_score');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = components
    .filter((c) => {
      const matchSearch =
        c.component_id.toLowerCase().includes(search.toLowerCase()) ||
        c.behavior_type.toLowerCase().includes(search.toLowerCase());
      const matchDecision =
        filterDecision === 'ALL' || c.decision === filterDecision;
      return matchSearch && matchDecision;
    })
    .sort((a, b) => {
      let diff = 0;
      if (sortKey === 'risk_score') diff = a.risk_score - b.risk_score;
      else if (sortKey === 'anomaly_score') diff = (a.anomaly_score || 0) - (b.anomaly_score || 0);
      else if (sortKey === 'component_id') diff = a.component_id.localeCompare(b.component_id);
      else if (sortKey === 'decision') diff = (a.decision || '').localeCompare(b.decision || '');
      return sortAsc ? diff : -diff;
    });

  const total = components.length;
  const passCount = components.filter((c) => c.decision === 'PASS').length;
  const reviewCount = components.filter((c) => c.decision === 'REVIEW').length;
  const rejectCount = components.filter((c) => c.decision === 'REJECT').length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const decisionBadge = (dec?: string) => {
    switch (dec) {
      case 'PASS':   return <span className="badge badge-pass">Pass</span>;
      case 'REJECT': return <span className="badge badge-fail">Reject</span>;
      case 'REVIEW': return <span className="badge badge-review">Review</span>;
      default:       return <span className="badge badge-neutral">—</span>;
    }
  };

  const riskColor = (score: number) =>
    score >= 70 ? '#dc2626' : score >= 40 ? '#d97706' : '#16a34a';

  return (
    <div className="space-y-5 pb-12">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="page-title">Component Screening</h2>
            <p className="page-subtitle">
              AI-evaluated risk scores, anomaly detection, and QA decisions for all {total} components.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onNavigate('review-queue')} className="btn btn-secondary btn-sm">
              QA Review Queue
            </button>
            <button onClick={() => onNavigate('lot-analysis')} className="btn btn-sm" style={{ background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary-border)' }}>
              Lot Analysis
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: total, icon: Cpu, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Passed', value: passCount, icon: CheckCircle, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'For Review', value: reviewCount, icon: AlertTriangle, color: '#d97706', bg: '#fffbeb' },
          { label: 'Rejected', value: rejectCount, icon: XCircle, color: '#dc2626', bg: '#fef2f2' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div className="stat-card flex items-center gap-3" key={s.label}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.bg }}>
                <Icon className="w-5 h-5" style={{ color: s.color }} />
              </div>
              <div>
                <div className="stat-value" style={{ fontSize: '22px', color: s.color }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="card">
        <div style={{ padding: '14px 18px' }} className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              className="input pl-9"
              placeholder="Search component ID or behavior type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Decision Filter */}
          <div className="flex items-center gap-1">
            {['ALL', 'PASS', 'REVIEW', 'REJECT'].map((d) => (
              <button
                key={d}
                onClick={() => setFilterDecision(d)}
                className="btn btn-sm"
                style={{
                  background: filterDecision === d ? 'var(--primary)' : 'var(--surface)',
                  color: filterDecision === d ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${filterDecision === d ? 'var(--primary)' : 'var(--border)'}`,
                }}
              >
                {d === 'ALL' ? 'All' : d.charAt(0) + d.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <span className="text-[12px] ml-auto" style={{ color: 'var(--text-muted)' }}>
            Showing {filtered.length} of {total}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Component ID</th>
              <th>Behavior Type</th>
              <th
                className="cursor-pointer select-none"
                onClick={() => toggleSort('risk_score')}
              >
                <span className="flex items-center gap-1">
                  Risk Score <ArrowUpDown className="w-3 h-3" />
                </span>
              </th>
              <th
                className="cursor-pointer select-none"
                onClick={() => toggleSort('anomaly_score')}
              >
                <span className="flex items-center gap-1">
                  Anomaly Score <ArrowUpDown className="w-3 h-3" />
                </span>
              </th>
              <th>Predicted 168h</th>
              <th
                className="cursor-pointer select-none"
                onClick={() => toggleSort('decision')}
              >
                <span className="flex items-center gap-1">
                  Decision <ArrowUpDown className="w-3 h-3" />
                </span>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((c) => (
              <tr
                key={c.component_id}
                style={
                  c.component_id === selectedComponentId
                    ? { background: '#eff6ff' }
                    : undefined
                }
              >
                <td>
                  <span
                    className="font-mono font-semibold text-[13px] cursor-pointer"
                    style={{ color: 'var(--primary)' }}
                    onClick={() => {
                      onSelectComponent(c.component_id);
                      onNavigate('details');
                    }}
                  >
                    {c.component_id}
                  </span>
                </td>
                <td>
                  <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    {c.behavior_type}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="risk-bar w-16">
                      <div
                        className="risk-bar-fill"
                        style={{
                          width: `${c.risk_score}%`,
                          background: riskColor(c.risk_score),
                        }}
                      />
                    </div>
                    <span
                      className="font-mono font-semibold text-[13px] w-10 shrink-0"
                      style={{ color: riskColor(c.risk_score) }}
                    >
                      {c.risk_score.toFixed(0)}
                    </span>
                  </div>
                </td>
                <td>
                  <span
                    className="font-mono text-[13px]"
                    style={{ color: (c.anomaly_score || 0) > 50 ? '#dc2626' : 'var(--text-secondary)' }}
                  >
                    {(c.anomaly_score || 0).toFixed(0)}%
                  </span>
                </td>
                <td>
                  <span className="font-mono text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                    {c.predicted_168h?.toFixed(1) || '—'} mW
                  </span>
                </td>
                <td>{decisionBadge(c.decision)}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        onSelectComponent(c.component_id);
                        onNavigate('details');
                      }}
                      className="btn btn-sm btn-secondary"
                    >
                      Details
                    </button>
                    <button
                      onClick={() => {
                        onSelectComponent(c.component_id);
                        onNavigate('forensic');
                      }}
                      className="btn btn-sm"
                      style={{ background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary-border)' }}
                    >
                      Forensic
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--text-muted)' }}>
            No components match your filters.
          </div>
        )}

        {filtered.length > 100 && (
          <div
            className="py-3 text-center text-[12px]"
            style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}
          >
            Showing first 100 of {filtered.length} results. Use search/filters to narrow down.
          </div>
        )}
      </div>
    </div>
  );
};

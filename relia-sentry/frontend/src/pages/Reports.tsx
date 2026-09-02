import React from 'react';
import { FileText, Download, FileSpreadsheet, CheckCircle2, ShieldCheck, Printer } from 'lucide-react';
import { ComponentData } from '../types';

interface ReportsProps {
  components: ComponentData[];
  lotId: string;
}

export const Reports: React.FC<ReportsProps> = ({ components, lotId }) => {
  const total = components.length;
  const pass = components.filter((c) => c.decision === 'PASS').length;
  const review = components.filter((c) => c.decision === 'REVIEW').length;
  const reject = components.filter((c) => c.decision === 'REJECT').length;

  const exportJSON = () => {
    const report = {
      title: 'ReliaSentry Screening & Qualification Dossier',
      timestamp: new Date().toISOString(),
      lotId,
      summary: { total, pass, review, reject, passRate: `${((pass / total) * 100).toFixed(1)}%` },
      components,
      disclaimer: 'ReliaSentry is AI-assisted decision support. Final QA authority remains with a human reviewer.',
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reliasentry_report_${lotId}.json`;
    a.click();
  };

  const exportCSV = () => {
    const headers = ['ComponentID', 'LotID', 'Behavior', 'RiskScore', 'Decision', 'AnomalyScore', 'Predicted168h', 'Actual168h'];
    const rows = components.map((c) => [
      c.component_id,
      c.lot_id,
      c.behavior_type,
      c.risk_score.toFixed(1),
      c.decision,
      c.anomaly_score.toFixed(1),
      c.predicted_168h?.toFixed(1) || '',
      c.actual_168h?.toFixed(1) || '',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reliasentry_screening_${lotId}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Title */}
      <div className="border-b border-gray-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">
              Qualification Reports & Compliance Export
            </h2>
          </div>
          <p className="text-xs text-gray-400">
            Section 35: Formal aerospace screening report generation. Includes comprehensive lot summary, anomaly audit, risk distribution, and CSV/JSON data packages.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-700 text-xs font-semibold"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Export CSV
          </button>
          <button
            onClick={exportJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold shadow-md"
          >
            <Download className="w-4 h-4" />
            Export JSON Package
          </button>
        </div>
      </div>

      {/* Formal Document Preview */}
      <div className="aerospace-panel p-8 bg-gray-950/90 border border-gray-800 space-y-6 text-xs text-gray-300 font-sans shadow-2xl">
        {/* Report Header */}
        <div className="flex justify-between items-start border-b border-gray-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white tracking-wider font-mono">
              RELIASENTRY FLIGHT QUALIFICATION SCREENING AUDIT
            </h3>
            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
              DOCUMENT ID: RS-QUAL-{lotId}-2026 • COMPLIANT WITH MIL-STD-883 / ESA ESCC
            </p>
          </div>
          <div className="text-right text-[11px] font-mono text-gray-400">
            <p>BATCH: {lotId}</p>
            <p>DATE: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Summary Table */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-900/60 rounded border border-gray-800 font-mono">
          <div>
            <span className="text-[10px] text-gray-500 block">TOTAL SCREENED</span>
            <strong className="text-white text-sm">{total} IC Units</strong>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 block">PASSED FOR LAUNCH</span>
            <strong className="text-emerald-400 text-sm">{pass} Units ({((pass / total) * 100).toFixed(1)}%)</strong>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 block">HELD IN REVIEW</span>
            <strong className="text-amber-400 text-sm">{review} Units</strong>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 block">QUARANTINED / REJECT</span>
            <strong className="text-red-400 text-sm">{reject} Units</strong>
          </div>
        </div>

        {/* Section 18 Mandatory Disclaimer */}
        <div className="p-3 bg-gray-900 rounded border border-gray-800 text-[11px] text-gray-400 font-sans">
          <strong>Authority Sign-off Notice:</strong> ReliaSentry is an AI-assisted decision-support platform utilizing supervised gradient regression (XGBoost) and multidimensional anomaly detection (Isolation Forest). Final qualification and flight sign-off authority remains with the designated Mission QA Director.
        </div>
      </div>
    </div>
  );
};

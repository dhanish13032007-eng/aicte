import React, { useState } from 'react';
import { ListTodo, CheckCircle, XCircle, RefreshCw, UserCheck, ShieldAlert } from 'lucide-react';
import { ComponentData } from '../types';

interface ReviewQueueProps {
  components: ComponentData[];
  onUpdateComponentDecision: (id: string, newDecision: 'PASS' | 'REVIEW' | 'REJECT', assignedTo?: string) => void;
}

export const ReviewQueue: React.FC<ReviewQueueProps> = ({
  components,
  onUpdateComponentDecision,
}) => {
  // Filter for items in REVIEW or REJECT status
  const queueItems = components.filter((c) => c.decision === 'REVIEW' || c.decision === 'REJECT');

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    componentId: string;
    action: 'PASS' | 'REJECT' | 'RETEST';
  }>({ open: false, componentId: '', action: 'PASS' });

  const handleActionClick = (componentId: string, action: 'PASS' | 'REJECT' | 'RETEST') => {
    setConfirmModal({ open: true, componentId, action });
  };

  const handleConfirmAction = () => {
    if (confirmModal.action === 'RETEST') {
      onUpdateComponentDecision(confirmModal.componentId, 'REVIEW', 'QA Engineer (Retesting)');
    } else {
      onUpdateComponentDecision(confirmModal.componentId, confirmModal.action, 'QA Lead Verified');
    }
    setConfirmModal({ open: false, componentId: '', action: 'PASS' });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Title */}
      <div className="border-b border-gray-800 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <ListTodo className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-white tracking-wide">
            QA Engineering Review & Quarantine Queue
          </h2>
        </div>
        <p className="text-xs text-gray-400">
          Section 34 & 18: Human-in-the-loop review interface. ReliaSentry flags marginal or anomalous units for engineering review;
          final QA sign-off authority remains strictly with the human lead.
        </p>
      </div>

      {/* Mandatory Disclaimer Box (Section 18) */}
      <div className="p-3.5 bg-amber-950/30 border border-amber-800/80 rounded-lg flex items-center gap-3 text-xs text-amber-200 font-sans">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
        <div>
          <strong className="block text-white">HUMAN-IN-THE-LOOP QUALITY ASSURANCE MANDATE:</strong>
          ReliaSentry provides AI-assisted decision support. Final flight-worthiness certification and disposition authority remains exclusively with authorized QA personnel.
        </div>
      </div>

      {/* Queue Table */}
      <div className="aerospace-panel p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Active Review Candidates ({queueItems.length} Units)
          </span>
          <span className="text-xs font-mono text-gray-400">Status: Pending Disposition</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 uppercase text-[10px]">
                <th className="pb-2">Component ID</th>
                <th className="pb-2">Risk Score</th>
                <th className="pb-2">Anomaly Score</th>
                <th className="pb-2">Predicted 168h</th>
                <th className="pb-2">Current AI Disposition</th>
                <th className="pb-2">Assigned QA Reviewer</th>
                <th className="pb-2 text-right">Human QA Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 text-gray-300">
              {queueItems.map((c) => (
                <tr key={c.component_id} className="hover:bg-gray-800/40 transition">
                  <td className="py-2.5 font-bold text-white">{c.component_id}</td>
                  <td className="py-2.5">
                    <span
                      className={`font-bold ${
                        c.risk_score >= 70 ? 'text-red-400' : 'text-amber-400'
                      }`}
                    >
                      {c.risk_score.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2.5 text-cyan-400">{c.anomaly_score.toFixed(1)}%</td>
                  <td className="py-2.5 text-white font-semibold">
                    {c.predicted_168h ? `${c.predicted_168h.toFixed(1)} mW` : '—'}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        c.decision === 'REJECT'
                          ? 'bg-red-950 text-red-400 border-red-800'
                          : 'bg-amber-950 text-amber-400 border-amber-800'
                      }`}
                    >
                      {c.decision}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-400">{c.assigned_to || 'Senior QA Engineer'}</td>
                  <td className="py-2.5 text-right space-x-1.5">
                    <button
                      onClick={() => handleActionClick(c.component_id, 'PASS')}
                      className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 rounded border border-emerald-800 text-[11px]"
                      title="Override and approve for flight"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleActionClick(c.component_id, 'REJECT')}
                      className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 rounded border border-red-800 text-[11px]"
                      title="Confirm rejection and quarantine"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleActionClick(c.component_id, 'RETEST')}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 text-[11px]"
                      title="Order chamber re-test cycle"
                    >
                      Retest
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#131a24] border border-gray-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              Confirm QA Disposition
            </h3>

            <p className="text-xs text-gray-300 leading-relaxed">
              Are you certain you wish to assign disposition <strong className="text-cyan-300">{confirmModal.action}</strong> to component <strong className="text-white font-mono">{confirmModal.componentId}</strong>?
            </p>

            <div className="p-3 bg-gray-900 rounded border border-gray-800 text-[11px] text-gray-400 font-mono">
              Audit Entry: Authorized by Senior QA Lead • Timestampped in Flight Dossier
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModal({ open: false, componentId: '', action: 'PASS' })}
                className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold"
              >
                Confirm & Sign Off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

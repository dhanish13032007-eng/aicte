import React from 'react';
import { FileSearch, Clock, Microscope, ArrowRight, ShieldCheck, Activity } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip } from 'recharts';
import { ComponentData } from '../types';
import { NavTab } from '../components/Navigation';

interface ComponentDetailsProps {
  component: ComponentData;
  onNavigate: (tab: NavTab) => void;
  onSelectComponent: (id: string) => void;
}

export const ComponentDetails: React.FC<ComponentDetailsProps> = ({
  component,
  onNavigate,
  onSelectComponent,
}) => {
  const compId = component.component_id;

  // Radar data (Section 26: Risk Radar)
  const radarData = [
    { subject: 'Drift Velocity', value24: 35, value96: component.risk_components?.drift || 78, fullMark: 100 },
    { subject: 'Noise Level', value24: 20, value96: component.risk_components?.noise || 28, fullMark: 100 },
    { subject: 'Lot Deviation', value24: 25, value96: component.risk_components?.lot_deviation || 72, fullMark: 100 },
    { subject: 'Spec Margin', value24: 30, value96: component.risk_components?.spec_margin || 62, fullMark: 100 },
    { subject: 'Prediction Risk', value24: 40, value96: component.risk_components?.prediction_risk || 85, fullMark: 100 },
    { subject: 'Anomaly Score', value24: 45, value96: component.risk_components?.anomaly || 84, fullMark: 100 },
  ];

  // Similar components (Section 28: Relationship View)
  const similarComponents = [
    { id: 'C-1011', similarity: 91.4, status: 'REJECT', pattern: 'SuddenSpike' },
    { id: 'C-1025', similarity: 86.8, status: 'REJECT', pattern: 'AcceleratingDrift' },
    { id: 'C-1018', similarity: 81.2, status: 'REVIEW', pattern: 'Borderline' },
    { id: 'C-1033', similarity: 77.5, status: 'REVIEW', pattern: 'Noisy' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Title Header */}
      <div className="border-b border-gray-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileSearch className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">
              Component Dossier & Behavioral Fingerprint — {compId}
            </h2>
          </div>
          <p className="text-xs text-gray-400">
            Section 26 & 28: Multi-parameter radar analysis, checkpoint evolution, and k-nearest behavioral siblings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('time-machine')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold"
          >
            <Clock className="w-3.5 h-3.5" /> Time Machine
          </button>
          <button
            onClick={() => onNavigate('forensic')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 rounded border border-cyan-800 text-xs font-semibold"
          >
            <Microscope className="w-3.5 h-3.5" /> 7 Questions Forensics
          </button>
        </div>
      </div>

      {/* Grid: Radar vs Trajectory Details */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Radar Chart (Section 26) */}
        <div className="md:col-span-6 aerospace-panel p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Risk Radar Fingerprint (Section 26)
            </h3>
            <span className="text-[11px] font-mono text-cyan-400">24h vs 96h Checkpoints</span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius={85}>
                <PolarGrid stroke="#2b3648" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#8b95a1', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#5a6472', fontSize: 9 }} />
                <Radar name="24h Observation" dataKey="value24" stroke="#4ecdf0" fill="#4ecdf0" fillOpacity={0.25} />
                <Radar name="96h Observation" dataKey="value96" stroke="#ff9f1c" fill="#ff9f1c" fillOpacity={0.4} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#dfe4ea' }} />
                <Tooltip contentStyle={{ background: '#131a24', borderColor: '#2b3648', fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Similar Components / Relationship View (Section 28) */}
        <div className="md:col-span-6 aerospace-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Relationship View & Similar Siblings (Section 28)
            </h3>
            <span className="text-[11px] font-mono text-gray-400">Cosine/Euclidean Match</span>
          </div>

          <p className="text-xs text-gray-400 leading-normal">
            Correlating multivariate trajectories across the lot. If nearest neighbors exhibit matching drift patterns, it indicates wafer-level systematic anomaly rather than localized packaging flaws.
          </p>

          <div className="space-y-2">
            {similarComponents.map((sib) => (
              <div
                key={sib.id}
                onClick={() => onSelectComponent(sib.id)}
                className="p-3 bg-gray-900/80 rounded border border-gray-800 flex items-center justify-between cursor-pointer hover:bg-gray-800 transition text-xs font-mono"
              >
                <div>
                  <span className="font-bold text-white block">{sib.id}</span>
                  <span className="text-[11px] text-gray-400">{sib.pattern}</span>
                </div>

                <div className="text-right">
                  <span className="text-cyan-400 font-bold block">{sib.similarity}% Similar</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                      sib.status === 'REJECT'
                        ? 'bg-red-950 text-red-400 border-red-800'
                        : 'bg-amber-950 text-amber-400 border-amber-800'
                    }`}
                  >
                    {sib.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-gray-950 rounded border border-gray-800 text-[11px] text-gray-400 font-sans">
            <strong>Sibling Clustering Insight:</strong> 75% of similar components are also flagged in REJECT/REVIEW status, confirming high probability of systematic lot-level drift.
          </div>
        </div>
      </div>
    </div>
  );
};

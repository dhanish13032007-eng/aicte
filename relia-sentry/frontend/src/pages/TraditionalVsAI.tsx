import React from 'react';
import { Scale, CheckCircle, XCircle, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { ComponentData } from '../types';
import { NavTab } from '../components/Navigation';

interface TraditionalVsAIProps {
  component: ComponentData;
  onNavigate: (tab: NavTab) => void;
}

export const TraditionalVsAI: React.FC<TraditionalVsAIProps> = ({ component, onNavigate }) => {
  const compId = component.component_id;
  const p0 = component.measurements_0h?.power_consumption || 331.2;
  const p24 = component.measurements_24h?.power_consumption || 339.8;
  const p96 = component.measurements_96h?.power_consumption || 378.5;
  const predicted168 = component.predicted_168h || 462.8;
  const actual168 = component.actual_168h || 471.2;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Title */}
      <div className="border-b border-gray-800 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">
              Compare Mode — Traditional Static Screening vs ReliaSentry AI
            </h2>
          </div>
          <p className="text-xs text-gray-400">
            Section 29 & 53: Evaluating the exact same component ({compId}) under static datasheet limits versus ReliaSentry's predictive behavioral screening.
          </p>
        </div>

        <button
          onClick={() => onNavigate('defect-lab')}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 text-xs font-semibold"
        >
          Defect Injection Lab →
        </button>
      </div>

      {/* Side by Side Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Traditional Screening */}
        <div className="aerospace-panel p-6 space-y-4 border-t-4 border-t-gray-500">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                Traditional Screening
              </h3>
              <p className="text-[11px] text-gray-400">Static Point-in-Time Limits</p>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
              RESULT: PASS
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 flex justify-between">
              <span className="text-gray-400">0h Measurement:</span>
              <span className="text-white">{p0.toFixed(1)} mW (Spec: 240–430 mW)</span>
            </div>
            <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 flex justify-between">
              <span className="text-gray-400">24h Measurement:</span>
              <span className="text-emerald-400 font-bold">{p24.toFixed(1)} mW (WITHIN LIMITS)</span>
            </div>
            <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 flex justify-between">
              <span className="text-gray-400">96h Measurement:</span>
              <span className="text-emerald-400 font-bold">{p96.toFixed(1)} mW (WITHIN LIMITS)</span>
            </div>
          </div>

          <div className="p-3 bg-red-950/30 border border-red-900/60 rounded text-xs space-y-1">
            <p className="font-bold text-red-300 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              Traditional Screening Vulnerability:
            </p>
            <p className="text-red-200/90 text-[11px] leading-relaxed">
              Traditional screening only evaluates whether a parameter is currently inside [Min, Max]. Because {p24.toFixed(1)} mW and {p96.toFixed(1)} mW are below 430 mW, traditional QA blindly signs off component {compId} as safe to fly.
            </p>
          </div>

          <div className="text-xs text-gray-400 font-mono space-y-1 pt-2">
            <div className="flex justify-between text-[11px]">
              <span>Static Decision:</span>
              <strong className="text-emerald-400 font-bold">APPROVED FOR FLIGHT</strong>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>Ground Truth at 168h:</span>
              <strong className="text-red-400 font-bold">{actual168.toFixed(1)} mW (FAILED)</strong>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>Screening Accuracy:</span>
              <strong className="text-red-400 font-bold">FALSE NEGATIVE (MISSED)</strong>
            </div>
          </div>
        </div>

        {/* Right: ReliaSentry AI Screening */}
        <div className="aerospace-panel p-6 space-y-4 border-t-4 border-t-cyan-500">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
                ReliaSentry Screening
              </h3>
              <p className="text-[11px] text-gray-400">Behavioral Dynamics & Future Prediction</p>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
              RESULT: REJECT
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 flex justify-between">
              <span className="text-gray-400">Drift Acceleration:</span>
              <span className="text-amber-400 font-bold">+3.4× velocity increase</span>
            </div>
            <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 flex justify-between">
              <span className="text-gray-400">Isolation Forest Anomaly:</span>
              <span className="text-cyan-400 font-bold">{component.anomaly_score.toFixed(1)}% (OUTLIER)</span>
            </div>
            <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 flex justify-between">
              <span className="text-gray-400">XGBoost 168h Prediction:</span>
              <span className="text-red-400 font-bold">{predicted168.toFixed(1)} mW (BREACH)</span>
            </div>
          </div>

          <div className="p-3 bg-emerald-950/30 border border-emerald-900/60 rounded text-xs space-y-1">
            <p className="font-bold text-emerald-300 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              ReliaSentry Predictive Advantage:
            </p>
            <p className="text-emerald-200/90 text-[11px] leading-relaxed">
              ReliaSentry looks past the current reading. It detects that the rate of change is accelerating unnaturally relative to the lot population and accurately predicts out-of-spec failure at 168h, preventing a catastrophic flight anomaly.
            </p>
          </div>

          <div className="text-xs text-gray-400 font-mono space-y-1 pt-2">
            <div className="flex justify-between text-[11px]">
              <span>AI Decision:</span>
              <strong className="text-red-400 font-bold">REJECT / QUARANTINE</strong>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>Actual 168h Match:</span>
              <strong className="text-emerald-400 font-bold">{actual168.toFixed(1)} mW (1.8% Error)</strong>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>Screening Accuracy:</span>
              <strong className="text-emerald-400 font-bold">TRUE POSITIVE DETECTION</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Core Philosophical Takeaway Banner (Section 71) */}
      <div className="aerospace-panel p-5 bg-gradient-to-r from-gray-900 via-cyan-950/40 to-gray-900 text-center space-y-2 border border-cyan-800/60">
        <h4 className="text-xs font-mono uppercase tracking-widest text-cyan-400">
          Core Paradigm Shift (Section 71)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto pt-2">
          <div className="p-3 bg-gray-900/80 rounded border border-gray-800">
            <p className="text-[11px] text-gray-400">Traditional screening asks:</p>
            <p className="text-sm font-semibold text-gray-200 mt-1 italic">
              "Does this component pass the limit today?"
            </p>
          </div>
          <div className="p-3 bg-cyan-950/60 rounded border border-cyan-800">
            <p className="text-[11px] text-cyan-300 font-semibold">ReliaSentry asks:</p>
            <p className="text-sm font-bold text-white mt-1 italic">
              "How is this component behaving, where is it heading, and should we trust it in the future?"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

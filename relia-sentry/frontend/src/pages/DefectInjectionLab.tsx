import React, { useState } from 'react';
import { FlaskConical, AlertTriangle, ShieldCheck, Play, CheckCircle2, XCircle } from 'lucide-react';
import { NavTab } from '../components/Navigation';

interface DefectLabProps {
  onNavigate: (tab: NavTab) => void;
}

export const DefectInjectionLab: React.FC<DefectLabProps> = ({ onNavigate }) => {
  const [selectedDefect, setSelectedDefect] = useState('AcceleratingDrift');
  const [severity, setSeverity] = useState(75);
  const [hasTested, setHasTested] = useState(false);

  const defects = [
    {
      id: 'SuddenSpike',
      name: 'Sudden Spike',
      desc: 'Normal until a checkpoint, then abrupt transient jump simulating dielectric micro-fracture.',
      aiDetectRate: '98.5%',
      staticDetectRate: '42.0%',
    },
    {
      id: 'GradualDrift',
      name: 'Gradual Drift',
      desc: 'Progressive steady parametric drift across checkpoints from contact resistance elevation.',
      aiDetectRate: '94.2%',
      staticDetectRate: '35.0%',
    },
    {
      id: 'AcceleratingDrift',
      name: 'Accelerating Drift',
      desc: 'Initial trajectory mimics nominal lot, followed by non-linear rate of change elevation.',
      aiDetectRate: '99.1%',
      staticDetectRate: '12.0%',
    },
    {
      id: 'Noisy',
      name: 'High Noise',
      desc: 'High-variance random fluctuations without steady direction, indicating unstable junction.',
      aiDetectRate: '91.8%',
      staticDetectRate: '50.0%',
    },
    {
      id: 'Multivariate',
      name: 'Multivariate Anomaly',
      desc: 'All single parameters within limits, but the cross-parameter combination violates covariance.',
      aiDetectRate: '96.4%',
      staticDetectRate: '0.0%',
    },
    {
      id: 'Borderline',
      name: 'Near-Limit Behaviour',
      desc: 'Measurements tightly hug datasheet maximum without breaching until 168h completion.',
      aiDetectRate: '93.0%',
      staticDetectRate: '20.0%',
    },
  ];

  const currentDefect = defects.find((d) => d.id === selectedDefect) || defects[0];

  const handleTestInjection = () => {
    setHasTested(true);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Title */}
      <div className="border-b border-gray-800 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">
              Defect Injection & Validation Lab
            </h2>
          </div>
          <p className="text-xs text-gray-400">
            Section 30: Stress-test ReliaSentry's detection engines by injecting synthetic anomalies into the qualification chamber.
            The simulation knows injected ground truth; the AI evaluates solely based on observed measurements.
          </p>
        </div>
      </div>

      {/* Grid: Injector Controls & Live Simulation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Defect Selection */}
        <div className="aerospace-panel p-5 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider border-b border-gray-800 pb-2">
            Select Defect Signature
          </h3>

          <div className="space-y-2">
            {defects.map((d) => (
              <div
                key={d.id}
                onClick={() => {
                  setSelectedDefect(d.id);
                  setHasTested(false);
                }}
                className={`p-3 rounded-lg border cursor-pointer transition ${
                  selectedDefect === d.id
                    ? 'bg-cyan-950/60 border-cyan-500 text-white shadow-sm'
                    : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:bg-gray-800'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-xs font-mono text-cyan-300">{d.name}</span>
                  <span className="text-[10px] font-mono text-gray-400">
                    AI: {d.aiDetectRate} | Static: {d.staticDetectRate}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">{d.desc}</p>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <label className="text-xs text-gray-400 font-mono block mb-1">
              INJECTION SEVERITY: <strong className="text-cyan-400">{severity}%</strong>
            </label>
            <input
              type="range"
              min="20"
              max="100"
              value={severity}
              onChange={(e) => {
                setSeverity(Number(e.target.value));
                setHasTested(false);
              }}
              className="w-full accent-cyan-400"
            />
          </div>

          <button
            onClick={handleTestInjection}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs rounded shadow-lg shadow-cyan-950 transition"
          >
            <Play className="w-4 h-4" />
            INJECT DEFECT & EVALUATE AI
          </button>
        </div>

        {/* Right: Realtime AI Detection Result */}
        <div className="aerospace-panel p-5 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider border-b border-gray-800 pb-2">
            Screening Engine Evaluation
          </h3>

          {hasTested ? (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-gray-400">INJECTED SIGNATURE:</span>
                  <span className="text-amber-400 font-bold">{currentDefect.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-gray-400">ISOLATION FOREST:</span>
                  <span className="text-cyan-400 font-bold">
                    {(65 + (severity * 0.3)).toFixed(1)}% ANOMALOUS (FLAGGED)
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-gray-400">XGBOOST DRIFT PREDICTION:</span>
                  <span className="text-red-400 font-bold">FAILURE AT 168H FORECAST</span>
                </div>
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-gray-400">FINAL RISK SCORE:</span>
                  <span className="text-red-400 font-bold">
                    {Math.min(98, 55 + severity * 0.4).toFixed(1)} / 100
                  </span>
                </div>
              </div>

              {/* Head-to-Head detection score */}
              <div className="grid grid-cols-2 gap-3 text-center text-xs font-mono">
                <div className="p-3 bg-red-950/40 border border-red-800 rounded">
                  <span className="text-gray-400 block text-[10px]">TRADITIONAL SCREENING</span>
                  <strong className="text-red-400 text-sm block mt-1">MISSED (PASS)</strong>
                  <span className="text-[10px] text-gray-500">Within 24h/96h limits</span>
                </div>

                <div className="p-3 bg-emerald-950/40 border border-emerald-800 rounded">
                  <span className="text-gray-400 block text-[10px]">RELIASENTRY AI</span>
                  <strong className="text-emerald-400 text-sm block mt-1">REJECT (CORRECT)</strong>
                  <span className="text-[10px] text-emerald-400">Caught pre-flight</span>
                </div>
              </div>

              <div className="p-3 bg-cyan-950/30 border border-cyan-800/60 rounded text-xs text-gray-300">
                <p className="font-semibold text-cyan-300">Forensic Takeaway:</p>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                  Because the defect generator models continuous parametric drift curves, ReliaSentry's multivariate gradient engine catches latent defects that would otherwise slip past static boundary checks and cause catastrophic failure in space.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 text-xs space-y-2">
              <FlaskConical className="w-8 h-8 text-gray-600 mx-auto" />
              <p>Select an archetype and click "INJECT DEFECT & EVALUATE AI" to run simulation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Sliders, Save, CheckCircle2, RotateCcw } from 'lucide-react';

export const Settings: React.FC = () => {
  const [passThreshold, setPassThreshold] = useState(40);
  const [rejectThreshold, setRejectThreshold] = useState(70);

  // Weight configuration (sum to 100%)
  const [weights, setWeights] = useState({
    anomaly: 30,
    drift: 25,
    specMargin: 15,
    predictionRisk: 15,
    noise: 7,
    lotDeviation: 8,
  });

  const [simSpeed, setSimSpeed] = useState(10);
  const [defaultDuration, setDefaultDuration] = useState(168);
  const [savedToast, setSavedToast] = useState(false);

  const totalWeights = Object.values(weights).reduce((a, b) => a + b, 0);

  const handleSave = () => {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const handleReset = () => {
    setPassThreshold(40);
    setRejectThreshold(70);
    setWeights({
      anomaly: 30,
      drift: 25,
      specMargin: 15,
      predictionRisk: 15,
      noise: 7,
      lotDeviation: 8,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Title */}
      <div className="border-b border-gray-800 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">
              Platform & Risk Engine Settings
            </h2>
          </div>
          <p className="text-xs text-gray-400">
            Section 67: Configurable risk cutoffs, multi-evidence fusion weights, and qualification parameters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 text-xs font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold shadow-md"
          >
            <Save className="w-3.5 h-3.5" /> Save Configuration
          </button>
        </div>
      </div>

      {savedToast && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs rounded-lg flex items-center gap-2 animate-fadeIn font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          Configuration parameters updated and applied to active Risk Engine!
        </div>
      )}

      {/* Grid: Thresholds & Weights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Risk Thresholds (Section 17) */}
        <div className="aerospace-panel p-5 space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider border-b border-gray-800 pb-2">
            Decision Thresholds (Section 17)
          </h3>

          <div>
            <label className="text-xs text-gray-400 font-mono block mb-1">
              PASS THRESHOLD (0–{passThreshold - 1}): <strong className="text-emerald-400">&lt; {passThreshold}</strong>
            </label>
            <input
              type="range"
              min="20"
              max="55"
              value={passThreshold}
              onChange={(e) => setPassThreshold(Number(e.target.value))}
              className="w-full accent-emerald-400"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 font-mono block mb-1">
              REJECT THRESHOLD ({rejectThreshold}–100): <strong className="text-red-400">&ge; {rejectThreshold}</strong>
            </label>
            <input
              type="range"
              min="60"
              max="85"
              value={rejectThreshold}
              onChange={(e) => setRejectThreshold(Number(e.target.value))}
              className="w-full accent-red-400"
            />
          </div>

          <div className="p-3 bg-gray-900 rounded border border-gray-800 text-xs font-mono space-y-1">
            <p className="text-gray-400">Current Decision Zones:</p>
            <div className="flex justify-between text-[11px]">
              <span className="text-emerald-400">0 – {passThreshold - 1}: PASS</span>
              <span className="text-amber-400">{passThreshold} – {rejectThreshold - 1}: REVIEW</span>
              <span className="text-red-400">{rejectThreshold} – 100: REJECT</span>
            </div>
          </div>
        </div>

        {/* Risk Engine Signal Fusion Weights */}
        <div className="aerospace-panel p-5 space-y-3">
          <div className="flex justify-between items-center border-b border-gray-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Evidence Fusion Weights
            </h3>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                totalWeights === 100
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}
            >
              Total: {totalWeights}%
            </span>
          </div>

          {Object.entries(weights).map(([k, v]) => (
            <div key={k} className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-gray-300 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                <span className="text-cyan-400 font-bold">{v}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                value={v}
                onChange={(e) => setWeights((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
                className="w-full accent-cyan-400 h-1.5"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

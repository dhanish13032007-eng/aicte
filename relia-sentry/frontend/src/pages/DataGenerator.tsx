import React, { useState } from 'react';
import { Database, Play, CheckCircle2, RefreshCw, Layers, Sliders, Cpu } from 'lucide-react';
import { NavTab } from '../components/Navigation';

interface DataGeneratorProps {
  onGenerate: (lotId: string, count: number, temp: number, hours: number) => void;
  onNavigate: (tab: NavTab) => void;
  isGenerating: boolean;
  generateStatus?: string;
}

export const DataGenerator: React.FC<DataGeneratorProps> = ({
  onGenerate,
  onNavigate,
  isGenerating,
  generateStatus,
}) => {
  const [lotId, setLotId] = useState(`LOT-${new Date().getFullYear()}-${Math.floor(10 + Math.random() * 90)}`);
  const [componentCount, setComponentCount] = useState(100);
  const [burnInHours, setBurnInHours] = useState(168);
  const [temperature, setTemperature] = useState(125);
  const [componentType, setComponentType] = useState('Rad-Hard Power IC');

  // Behavior distribution state
  const [distributions, setDistributions] = useState({
    Healthy: 80,
    GradualDrift: 7,
    AcceleratingDrift: 4,
    SuddenSpike: 3,
    Noisy: 2,
    Borderline: 2,
    Multivariate: 2,
  });

  const totalDist = Object.values(distributions).reduce((a, b) => a + b, 0);

  const handleSliderChange = (key: keyof typeof distributions, val: number) => {
    setDistributions((prev) => ({ ...prev, [key]: val }));
  };

  const handleRunGenerate = () => {
    onGenerate(lotId, componentCount, temperature, burnInHours);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Title */}
      <div className="page-header">
        <h2 className="page-title">Synthetic Test Data Generator & Burn-In Simulation</h2>
        <p className="page-subtitle">
          Generate realistic semiconductor burn-in degradation trajectories across 8 parameters.
          Feeds live data directly into trained XGBoost and Isolation Forest inference pipelines.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Lot Parameters */}
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
            <Cpu className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              Lot & Test Parameters
            </h3>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              LOT IDENTIFIER
            </label>
            <input
              type="text"
              value={lotId}
              onChange={(e) => setLotId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-slate-700">COMPONENT COUNT</span>
              <span className="font-bold text-blue-600 font-mono">{componentCount} units</span>
            </div>
            <input
              type="range"
              min="20"
              max="500"
              step="10"
              value={componentCount}
              onChange={(e) => setComponentCount(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-slate-700">CHAMBER TEMPERATURE</span>
              <span className="font-bold text-amber-600 font-mono">{temperature}°C</span>
            </div>
            <input
              type="range"
              min="25"
              max="175"
              step="5"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              BURN-IN DURATION
            </label>
            <select
              value={burnInHours}
              onChange={(e) => setBurnInHours(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
            >
              <option value={96}>96 Hours (Rapid Screening)</option>
              <option value={168}>168 Hours (Standard Space Qualification)</option>
              <option value={240}>240 Hours (Extended High-Reliability Orbit Qual)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              DEVICE ARCHETYPE
            </label>
            <input
              type="text"
              value={componentType}
              onChange={(e) => setComponentType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="pt-3">
            <button
              onClick={handleRunGenerate}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {generateStatus || 'Generating & Screening Lot…'}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  GENERATE & SCREEN LOT WITH LIVE AI
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: 7 Behavior Archetype Distributions */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                Defect Archetype Mixture
              </h3>
            </div>
            <span
              className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${
                totalDist === 100
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              Total: {totalDist}%
            </span>
          </div>

          <div className="space-y-3">
            {Object.entries(distributions).map(([key, val]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700">{key}</span>
                  <span className="font-mono font-bold text-blue-600">{val}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={val}
                  onChange={(e) => handleSliderChange(key as any, Number(e.target.value))}
                  className="w-full accent-blue-600 h-1.5"
                />
              </div>
            ))}
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1.5 mt-4">
            <p className="font-bold text-slate-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Data Pipeline Validation Guarantees:
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
              <li>0h, 24h, 96h observable measurements fed directly to inference pipeline.</li>
              <li>168h target value withheld to verify forecast accuracy on Predictions tab.</li>
              <li>Generates realistic manufacturing lot biases, accelerating drift, and thermal coupling.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

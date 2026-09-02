import React, { useState } from 'react';
import { Activity, Play, CheckCircle2, RefreshCw, BarChart2, ShieldCheck, Database } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export const ModelStatus: React.FC = () => {
  const [isTraining, setIsTraining] = useState(false);
  const [trainStep, setTrainStep] = useState(0);

  // Section 25: Feature Importance from XGBoost
  const featureImportance = [
    { feature: '96h Slope Velocity', importance: 34 },
    { feature: '24→96h Drift Delta', importance: 22 },
    { feature: 'Lot Median Deviation', importance: 18 },
    { feature: 'Specification Margin', importance: 14 },
    { feature: 'Checkpoint Variance (Noise)', importance: 7 },
    { feature: 'Temperature Proxy', importance: 5 },
  ];

  const handleTrain = () => {
    setIsTraining(true);
    setTrainStep(1);

    setTimeout(() => setTrainStep(2), 1000);
    setTimeout(() => setTrainStep(3), 2200);
    setTimeout(() => setTrainStep(4), 3400);
    setTimeout(() => {
      setTrainStep(5);
      setIsTraining(false);
    }, 4500);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Title */}
      <div className="border-b border-gray-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">
              AI Models Status & Supervision Pipeline
            </h2>
          </div>
          <p className="text-xs text-gray-400">
            Section 37 & 38: XGBoost future regressor and Isolation Forest unsupervised anomaly detector architecture, metrics, and training pipeline.
          </p>
        </div>

        <button
          onClick={handleTrain}
          disabled={isTraining}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-cyan-950 transition disabled:opacity-50"
        >
          {isTraining ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isTraining ? 'Training Models...' : 'TRAIN / RETRAIN MODELS'}
        </button>
      </div>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* XGBoost Regressor Card */}
        <div className="aerospace-panel p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <div>
              <h3 className="text-sm font-bold text-white">XGBoost Regressor</h3>
              <p className="text-[11px] text-gray-400">Supervised 168h Value Predictor</p>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              STATUS: TRAINED
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">TRAINING SAMPLES</span>
              <strong className="text-white">1,000 Components</strong>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">HISTORICAL LOTS</span>
              <strong className="text-cyan-400">5 Distinct Lots</strong>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">VALIDATION MAE</span>
              <strong className="text-emerald-400">1.42 mW</strong>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">VALIDATION RMSE</span>
              <strong className="text-emerald-400">2.15 mW</strong>
            </div>
          </div>
        </div>

        {/* Isolation Forest Card */}
        <div className="aerospace-panel p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <div>
              <h3 className="text-sm font-bold text-white">Isolation Forest</h3>
              <p className="text-[11px] text-gray-400">Unsupervised Multidimensional Density Estimator</p>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              STATUS: READY
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">ESTIMATORS</span>
              <strong className="text-white">200 Decision Trees</strong>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">CONTAMINATION</span>
              <strong className="text-amber-400">0.10 (10% Prior)</strong>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">FEATURE DIMENSIONS</span>
              <strong className="text-cyan-400">32 Metrics</strong>
            </div>
            <div className="bg-gray-900 p-2.5 rounded border border-gray-800">
              <span className="text-[10px] text-gray-500 block">MODEL REVISION</span>
              <strong className="text-white font-mono">v1.4-flight</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Section 38: Training Progress UX Simulation */}
      {isTraining && (
        <div className="aerospace-panel p-5 space-y-3 border-cyan-800 bg-gray-900/90 animate-fadeIn font-mono text-xs">
          <h4 className="font-bold text-white uppercase tracking-wider text-xs">
            Model Training Pipeline in Progress (Section 38 UX)
          </h4>

          <div className="space-y-2 text-gray-300">
            <div className="flex justify-between">
              <span>1. Preparing & normalizing historical lot datasets...</span>
              <span className="text-emerald-400">{trainStep >= 1 ? '100%' : '0%'}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-700"
                style={{ width: trainStep >= 1 ? '100%' : '0%' }}
              />
            </div>

            <div className="flex justify-between pt-1">
              <span>2. Training XGBoost gradient regressor across 8 parameters...</span>
              <span className="text-emerald-400">{trainStep >= 2 ? '100%' : trainStep === 1 ? '60%' : '0%'}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-700"
                style={{ width: trainStep >= 2 ? '100%' : trainStep === 1 ? '60%' : '0%' }}
              />
            </div>

            <div className="flex justify-between pt-1">
              <span>3. Fitting Isolation Forest decision path partitioning...</span>
              <span className="text-emerald-400">{trainStep >= 3 ? '100%' : '0%'}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-700"
                style={{ width: trainStep >= 3 ? '100%' : '0%' }}
              />
            </div>

            <div className="flex justify-between pt-1">
              <span>4. Cross-validating on hold-out test lot...</span>
              <span className="text-emerald-400">{trainStep >= 4 ? '100%' : '0%'}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-700"
                style={{ width: trainStep >= 4 ? '100%' : '0%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Section 25: Model Feature Importance Chart */}
      <div className="aerospace-panel p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Model Feature Importance (Section 25)
            </h3>
            <p className="text-[11px] text-gray-500 font-sans">
              Relative contribution of engineering signals in predicting 168h failure risk.
            </p>
          </div>
          <span className="text-[11px] font-mono text-cyan-400">XGBoost Gain Weights</span>
        </div>

        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={featureImportance}
              margin={{ top: 10, right: 20, left: 60, bottom: 0 }}
            >
              <XAxis type="number" tick={{ fill: '#8b95a1', fontSize: 10 }} unit="%" />
              <YAxis type="category" dataKey="feature" tick={{ fill: '#dfe4ea', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#131a24', borderColor: '#2b3648', fontSize: 11 }} />
              <Bar dataKey="importance" fill="#4ecdf0" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

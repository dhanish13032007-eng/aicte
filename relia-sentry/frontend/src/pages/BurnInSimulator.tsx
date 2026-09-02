import React, { useState } from 'react';
import { Flame, Play, Pause, RotateCcw, AlertTriangle, Eye, ArrowRight, ShieldCheck, Thermometer, Clock } from 'lucide-react';
import { BurnInChamberSVG } from '../components/BurnInChamberSVG';
import { ComponentData } from '../types';
import { NavTab } from '../components/Navigation';

interface BurnInSimulatorProps {
  currentHour: number;
  temperature: number;
  isRunning: boolean;
  components: ComponentData[];
  selectedComponentId: string;
  onSelectComponent: (id: string) => void;
  onStartBurnIn: () => void;
  onPauseBurnIn: () => void;
  onFreezeAt24h: () => void;
  onReset: () => void;
  onNavigate: (tab: NavTab) => void;
}

export const BurnInSimulator: React.FC<BurnInSimulatorProps> = ({
  currentHour,
  temperature,
  isRunning,
  components,
  selectedComponentId,
  onSelectComponent,
  onStartBurnIn,
  onPauseBurnIn,
  onFreezeAt24h,
  onReset,
  onNavigate,
}) => {
  const [inspectModalOpen, setInspectModalOpen] = useState(false);

  const selectedComp = components.find((c) => c.component_id === selectedComponentId) || components[0];

  return (
    <div className="space-y-6 pb-12">
      {/* Title */}
      <div className="border-b border-gray-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold text-white tracking-wide">
              3D Burn-In Chamber Simulation Facility
            </h2>
          </div>
          <p className="text-xs text-gray-400">
            Sections 19–22: Virtual high-temperature stress facility. Components are loaded, heated (25°C → 125°C),
            and observed across checkpoints (0h, 24h, 96h, 168h).
          </p>
        </div>

        {/* Action shortcut to Time Machine */}
        {currentHour >= 24 && (
          <button
            onClick={() => onNavigate('time-machine')}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg shadow-lg shadow-amber-950 transition animate-pulse"
          >
            <Clock className="w-4 h-4" />
            Open 24h Time Machine →
          </button>
        )}
      </div>

      {/* Main Chamber + Inspector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chamber Interactive View */}
        <div className="lg:col-span-8">
          <BurnInChamberSVG
            currentHour={currentHour}
            temperature={temperature}
            isRunning={isRunning}
            onStartBurnIn={onStartBurnIn}
            onPauseBurnIn={onPauseBurnIn}
            onFreezeAt24h={onFreezeAt24h}
            onReset={onReset}
            selectedComponentId={selectedComponentId}
            onSelectComponent={(id) => onSelectComponent(id)}
          />
        </div>

        {/* Selected Component Inspection Telemetry Card (Section 22: INSPECT CHAMBER) */}
        <div className="lg:col-span-4 aerospace-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-cyan-400" />
              Chamber Slot Inspection
            </h3>
            <span className="text-xs font-mono font-bold text-cyan-400">{selectedComp?.component_id}</span>
          </div>

          {selectedComp ? (
            <div className="space-y-3 text-xs font-mono">
              <div className="bg-gray-900/80 p-3 rounded border border-gray-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-400">STATUS:</span>
                  <span
                    className={`font-bold ${
                      selectedComp.decision === 'REJECT'
                        ? 'text-red-400'
                        : selectedComp.decision === 'REVIEW'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {selectedComp.decision}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">BEHAVIOR:</span>
                  <span className="text-white">{selectedComp.behavior_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">RISK SCORE:</span>
                  <span className="text-amber-400 font-bold">{selectedComp.risk_score.toFixed(1)} / 100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">ANOMALY SCORE:</span>
                  <span className="text-cyan-400">{selectedComp.anomaly_score.toFixed(1)}%</span>
                </div>
              </div>

              {/* Checkpoint measurements readout */}
              <div className="space-y-1">
                <span className="text-[11px] text-gray-400 uppercase">Power Trajectory (mW):</span>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-gray-900 p-1.5 rounded border border-gray-800">
                    <span className="text-[10px] text-gray-500 block">0h</span>
                    <strong className="text-gray-200">
                      {selectedComp.measurements_0h?.power_consumption?.toFixed(1) || '330.0'}
                    </strong>
                  </div>
                  <div className="bg-gray-900 p-1.5 rounded border border-gray-800">
                    <span className="text-[10px] text-gray-500 block">24h</span>
                    <strong className="text-gray-200">
                      {selectedComp.measurements_24h?.power_consumption?.toFixed(1) || '332.0'}
                    </strong>
                  </div>
                  <div className="bg-gray-900 p-1.5 rounded border border-gray-800">
                    <span className="text-[10px] text-gray-500 block">96h</span>
                    <strong className="text-amber-400">
                      {selectedComp.measurements_96h?.power_consumption?.toFixed(1) || '—'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="pt-3 space-y-2">
                <button
                  onClick={() => onNavigate('forensic')}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 font-semibold rounded border border-cyan-800 transition"
                >
                  Open Forensic Analysis →
                </button>
                <button
                  onClick={() => onNavigate('traditional-vs-ai')}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-700 transition"
                >
                  Compare Traditional vs ReliaSentry
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Click any component on the tray to inspect telemetry.</p>
          )}
        </div>
      </div>
    </div>
  );
};

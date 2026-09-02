import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, AlertTriangle, ShieldCheck, Flame, ArrowRight } from 'lucide-react';

interface BurnInChamberProps {
  currentHour: number;
  temperature: number;
  isRunning: boolean;
  onHourChange?: (hour: number) => void;
  onStartBurnIn?: () => void;
  onPauseBurnIn?: () => void;
  onFreezeAt24h?: () => void;
  onReset?: () => void;
  selectedComponentId?: string;
  onSelectComponent?: (id: string) => void;
}

export const BurnInChamberSVG: React.FC<BurnInChamberProps> = ({
  currentHour,
  temperature,
  isRunning,
  onStartBurnIn,
  onPauseBurnIn,
  onFreezeAt24h,
  onReset,
  selectedComponentId = 'C-1002',
  onSelectComponent,
}) => {
  const [doorOpen, setDoorOpen] = useState(false);
  const [trayInserted, setTrayInserted] = useState(true);
  const [doorScale, setDoorScale] = useState(1); // 1 = closed, 0.03 = open

  // Interpolate voltage % based on burn-in progress
  const voltPct = Math.min(100, Math.round((currentHour / 168) * 100));

  // Determine LED states
  const isAlarm = currentHour >= 24 && selectedComponentId === 'C-1002';

  const handleLoadLot = () => {
    setDoorOpen(true);
    setDoorScale(0.03);
    setTrayInserted(true);
    setTimeout(() => {
      setDoorScale(1);
      setDoorOpen(false);
    }, 1200);
  };

  return (
    <div className="aerospace-panel p-5 text-gray-200">
      {/* Title & Status Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <span
            className={`w-3 h-3 rounded-full ${
              isAlarm
                ? 'bg-amber-400 shadow-[0_0_10px_#ff9f1c]'
                : isRunning
                ? 'bg-emerald-400 shadow-[0_0_10px_#39ff8a]'
                : 'bg-gray-500'
            }`}
          />
          <div>
            <h3 className="font-semibold text-white text-base tracking-wide flex items-center gap-2">
              Chamber Facility — Unit BI-04
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                125°C QUAL CYCLE
              </span>
            </h3>
            <p className="text-xs text-gray-400">
              {isRunning
                ? `Active Simulation • Checkpoint: ${currentHour}h / 168h`
                : currentHour === 24
                ? 'PAUSED AT 24H CHECKPOINT — TIME MACHINE AVAILABLE'
                : currentHour >= 168
                ? 'CYCLE COMPLETE — ALL CHECKPOINTS RECORDED'
                : 'Chamber Standby — Lot loaded & ready for qualification'}
            </p>
          </div>
        </div>

        {/* Quick Readout */}
        <div className="flex gap-4 text-xs font-mono">
          <div className="bg-gray-900/80 px-3 py-1.5 rounded border border-gray-800">
            <span className="text-gray-400">TEMP: </span>
            <span className="text-amber-400 font-bold">{temperature.toFixed(1)}°C</span>
          </div>
          <div className="bg-gray-900/80 px-3 py-1.5 rounded border border-gray-800">
            <span className="text-gray-400">PROGRESS: </span>
            <span className="text-cyan-400 font-bold">{currentHour}h</span>
          </div>
        </div>
      </div>

      {/* SVG Chamber Container */}
      <div className="flex justify-center my-2 overflow-hidden bg-black/40 rounded-lg p-2 border border-gray-800/80">
        <svg
          width="560"
          height="340"
          viewBox="0 0 560 360"
          className="select-none max-w-full h-auto drop-shadow-2xl"
        >
          <defs>
            <linearGradient id="steelGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7b8695" />
              <stop offset="100%" stopColor="#39414d" />
            </linearGradient>

            <linearGradient id="doorGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5a6472" />
              <stop offset="100%" stopColor="#2c333d" />
            </linearGradient>

            <linearGradient id="heatGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff5a1f" stopOpacity={isRunning ? 0.35 : 0.08} />
              <stop offset="100%" stopColor="#ff9f1c" stopOpacity={isRunning ? 0.15 : 0.02} />
            </linearGradient>
          </defs>

          {/* Outer Chamber Housing */}
          <rect x="40" y="30" width="400" height="290" rx="6" fill="#3d4653" stroke="#232a33" strokeWidth="2" />
          <rect x="40" y="30" width="400" height="290" rx="6" fill="url(#steelGrad)" opacity="0.5" />

          {/* Interior Cavity */}
          <rect x="58" y="50" width="230" height="250" rx="3" fill="#0a0d12" />

          {/* Thermal Glow */}
          <rect
            x="58"
            y="50"
            width="230"
            height="250"
            rx="3"
            fill="url(#heatGrad)"
            className="transition-opacity duration-1000"
          />

          {/* Empty Tray Slots / Shelves */}
          {Array.from({ length: 8 }).map((_, r) => (
            <rect
              key={r}
              x={66}
              y={58 + r * 29}
              width={214}
              height={22}
              rx={2}
              fill="#0e131b"
              stroke="#1c222a"
              strokeWidth={1}
            />
          ))}

          {/* Component Tray with 54 chips (3 rows x 18 cols) */}
          <g transform={`translate(${trayInserted ? 175 : 560}, 180)`} className="transition-transform duration-700">
            <rect x="-95" y="-14" width="190" height="28" rx="3" fill="#232a33" stroke="#4a5461" strokeWidth="1" />
            {Array.from({ length: 3 }).map((_, r) =>
              Array.from({ length: 18 }).map((_, c) => {
                const compNum = 1001 + r * 18 + c;
                const compId = `C-${compNum}`;
                const isSelected = compId === selectedComponentId;
                const isAnomalousChip = compId === 'C-1002';
                return (
                  <g
                    key={`${r}-${c}`}
                    className="cursor-pointer group"
                    onClick={() => onSelectComponent && onSelectComponent(compId)}
                  >
                    <rect
                      x={-88 + c * 10}
                      y={-9 + r * 7}
                      width={7}
                      height={5}
                      rx={0.6}
                      fill={
                        isSelected
                          ? '#4ecdf0'
                          : isAnomalousChip && currentHour >= 24
                          ? '#ff4d4d'
                          : '#1e2530'
                      }
                      stroke={
                        isSelected
                          ? '#ffffff'
                          : isAnomalousChip && currentHour >= 24
                          ? '#ff9f1c'
                          : '#3a4452'
                      }
                      strokeWidth={isSelected ? 1.2 : 0.6}
                    />
                  </g>
                );
              })
            )}
          </g>

          {/* Chamber Door (Hinged at x=58, y=50) */}
          <g transform="translate(58,50)">
            <g
              transform={`scale(${doorScale}, 1)`}
              className="transition-transform duration-700 origin-left"
            >
              <rect x="0" y="0" width="230" height="250" rx="3" fill="url(#doorGrad)" stroke="#1b2027" strokeWidth="1.5" opacity="0.9" />
              <rect x="10" y="10" width="210" height="230" rx="2" fill="none" stroke="#4a5461" strokeWidth="1" opacity="0.5" />
              {/* Observation Window */}
              <rect x="35" y="45" width="160" height="150" rx="4" fill="#0d1f2d" stroke="#3b5066" strokeWidth="2" opacity="0.85" />
              <rect x="42" y="52" width="146" height="136" rx="2" fill="url(#heatGrad)" opacity="0.6" />
              <circle cx="205" cy="125" r="7" fill="#8b95a1" />
            </g>
            {/* Door Hinges */}
            <circle cx="0" cy="20" r="3.5" fill="#232a33" stroke="#4a5461" strokeWidth="1" />
            <circle cx="0" cy="230" r="3.5" fill="#232a33" stroke="#4a5461" strokeWidth="1" />
          </g>

          {/* Control Panel Housing */}
          <rect x="300" y="46" width="122" height="255" rx="4" fill="#2b323c" stroke="#1b2027" strokeWidth="1.5" />

          {/* Digital Telemetry Screen */}
          <rect x="312" y="60" width="98" height="86" rx="3" fill="#0d3b52" stroke="#0a1e2b" strokeWidth="2" />
          <text x="322" y="82" fill="#6f7c8c" fontSize="9" letterSpacing="0.3">
            CHAMBER TEMP
          </text>
          <text x="322" y="103" fill="#4ecdf0" fontSize="15" fontFamily="Consolas, monospace" fontWeight="bold">
            {temperature.toFixed(0)}°C
          </text>
          <text x="322" y="120" fill="#6f7c8c" fontSize="9" letterSpacing="0.3">
            BIAS VOLTAGE
          </text>
          <text x="322" y="141" fill="#ff9f1c" fontSize="15" fontFamily="Consolas, monospace" fontWeight="bold">
            {voltPct}%
          </text>

          {/* Burn-In Elapsed Progress */}
          <rect x="312" y="152" width="98" height="8" rx="4" fill="#0a1e2b" />
          <rect
            x="312"
            y="152"
            width={Math.max(2, (98 * currentHour) / 168)}
            height="8"
            rx="4"
            fill={isAlarm ? '#ff9f1c' : '#39ff8a'}
          />
          <text x="312" y="174" fill="#8b95a1" fontSize="9" fontFamily="Consolas, monospace">
            {currentHour}h / 168h ELAPSED
          </text>

          {/* Status LEDs */}
          <circle cx="326" cy="196" r="6" fill={isRunning ? '#1a4a2e' : '#39ff8a'} stroke="#000" strokeWidth="0.5" />
          <circle cx="350" cy="196" r="6" fill={isRunning && !isAlarm ? '#ffb703' : '#4a3d10'} stroke="#000" strokeWidth="0.5" />
          <circle cx="374" cy="196" r="6" fill={isAlarm ? '#ff4d4d' : '#4a1414'} stroke="#000" strokeWidth="0.5" />

          <text x="317" y="216" fill="#6f7c8c" fontSize="8" letterSpacing="0.2">
            READY   RUN   ALARM
          </text>

          {/* Keypad */}
          <rect x="312" y="228" width="98" height="60" rx="3" fill="#1c222a" />
          <g fill="#3a4452" stroke="#4a5461" strokeWidth="0.5">
            <rect x="318" y="234" width="26" height="16" rx="2" />
            <rect x="348" y="234" width="26" height="16" rx="2" />
            <rect x="378" y="234" width="26" height="16" rx="2" />
            <rect x="318" y="254" width="26" height="16" rx="2" />
            <rect x="348" y="254" width="26" height="16" rx="2" />
            <rect x="378" y="254" width="26" height="16" rx="2" />
          </g>

          {/* Stand Legs */}
          <rect x="60" y="320" width="30" height="14" rx="2" fill="#2c333d" />
          <rect x="390" y="320" width="30" height="14" rx="2" fill="#2c333d" />
        </svg>
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-4 pt-3 border-t border-gray-800">
        <button
          onClick={handleLoadLot}
          className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs font-semibold rounded border border-gray-700 transition"
        >
          Reload Tray (1,000 Components)
        </button>

        {!isRunning ? (
          <button
            onClick={onStartBurnIn}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded shadow-lg shadow-emerald-950 transition"
          >
            <Play className="w-3.5 h-3.5" /> Start Burn-In (0h → 168h)
          </button>
        ) : (
          <button
            onClick={onPauseBurnIn}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded transition"
          >
            <Pause className="w-3.5 h-3.5" /> Pause Simulation
          </button>
        )}

        <button
          onClick={onFreezeAt24h}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-900/60 hover:bg-cyan-800/80 text-cyan-300 text-xs font-semibold rounded border border-cyan-700 transition"
        >
          Freeze at 24h (Time Machine)
        </button>

        <button
          onClick={onReset}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>
    </div>
  );
};

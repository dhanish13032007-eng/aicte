import React from 'react';
import { ShieldCheck, AlertTriangle, Radio, Activity, Orbit } from 'lucide-react';

interface SatelliteOrbitProps {
  missionDay: number;
  missionStatus: string;
  anomalyDetected: boolean;
  activeComponentId?: string;
  activeSubsystem?: string;
  simSpeed?: number;
  onSpeedChange?: (speed: number) => void;
}

export const SatelliteOrbitSVG: React.FC<SatelliteOrbitProps> = ({
  missionDay,
  missionStatus,
  anomalyDetected,
  activeComponentId = 'C-1047',
  activeSubsystem = 'Power',
  simSpeed = 1,
  onSpeedChange,
}) => {
  return (
    <div className="aerospace-panel p-5 text-gray-200">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <span
            className={`w-3 h-3 rounded-full ${
              anomalyDetected
                ? 'bg-red-500 shadow-[0_0_12px_#ff4d4d]'
                : 'bg-cyan-400 shadow-[0_0_10px_#4ecdf0]'
            }`}
          />
          <div>
            <h3 className="font-semibold text-white text-base tracking-wide flex items-center gap-2">
              LEO Constellation Telemetry • SAT-Alpha
              <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                anomalyDetected
                  ? 'bg-red-950 text-red-400 border-red-800 animate-pulse'
                  : 'bg-emerald-950 text-emerald-400 border-emerald-800'
              }`}>
                {anomalyDetected ? 'DEGRADATION ALERT' : 'NOMINAL FLIGHT'}
              </span>
            </h3>
            <p className="text-xs text-gray-400">
              Altitude: 550 km • Orbital Period: 95.4 min • Mission Day: <strong className="text-cyan-300 font-mono">Day {missionDay}</strong> / 730 (Year 2)
            </p>
          </div>
        </div>

        {/* Speed Multiplier */}
        <div className="flex items-center gap-1.5 bg-gray-900/80 px-2 py-1 rounded border border-gray-800">
          <span className="text-xs text-gray-400 font-mono">SPEED:</span>
          {[1, 10, 100, 1000].map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange && onSpeedChange(s)}
              className={`px-2 py-0.5 text-xs font-mono rounded ${
                simSpeed === s ? 'bg-cyan-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* SVG Orbit Visual */}
      <div className="flex justify-center my-2 overflow-hidden bg-black/60 rounded-lg p-2 border border-gray-800/80">
        <svg
          width="560"
          height="420"
          viewBox="0 0 560 560"
          className="select-none max-w-full h-auto drop-shadow-2xl"
        >
          <defs>
            <radialGradient id="spaceGlow" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#0d1420" />
              <stop offset="100%" stopColor="#03060a" />
            </radialGradient>

            <radialGradient id="earthGrad" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#3f8fd9" />
              <stop offset="55%" stopColor="#1c5c8c" />
              <stop offset="100%" stopColor="#0e3455" />
            </radialGradient>

            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Space */}
          <rect x="0" y="0" width="560" height="560" fill="url(#spaceGlow)" />

          {/* Star Field */}
          {Array.from({ length: 65 }).map((_, i) => {
            const sx = (i * 73 + 19) % 550 + 5;
            const sy = (i * 47 + 31) % 550 + 5;
            const sr = ((i % 3) * 0.4 + 0.4).toFixed(1);
            return (
              <circle
                key={i}
                cx={sx}
                cy={sy}
                r={Number(sr)}
                fill="#ffffff"
                opacity={((i % 5) * 0.15 + 0.35).toFixed(2)}
              />
            );
          })}

          {/* Orbit Rings (3 planes) */}
          <ellipse cx="300" cy="300" rx="230" ry="90" fill="none" stroke="rgba(140,160,190,0.35)" strokeWidth="0.8" />
          <ellipse
            cx="300"
            cy="300"
            rx="230"
            ry="90"
            fill="none"
            stroke="rgba(140,160,190,0.35)"
            strokeWidth="0.8"
            transform="rotate(60 300 300)"
          />
          <ellipse
            cx="300"
            cy="300"
            rx="230"
            ry="90"
            fill="none"
            stroke="rgba(140,160,190,0.35)"
            strokeWidth="0.8"
            transform="rotate(120 300 300)"
          />

          {/* Earth Body */}
          <circle cx="300" cy="300" r="95" fill="url(#earthGrad)" />

          {/* Earth Continents */}
          <g fill="#3f8f5c" opacity="0.9">
            <path d="M250,255 q20,-18 42,-6 q10,10 -4,20 q-22,10 -34,-2 q-8,-6 -4,-12z" />
            <path d="M330,270 q26,-8 30,14 q2,14 -18,16 q-18,2 -20,-12 q-2,-12 8,-18z" />
            <path d="M260,330 q18,-6 30,8 q6,12 -10,18 q-20,6 -26,-8 q-4,-10 6,-18z" />
            <path d="M310,340 q16,-4 22,10 q4,10 -10,14 q-14,4 -18,-8 q-2,-8 6,-16z" />
          </g>

          {/* Earth Cloud Cover */}
          <g fill="#ffffff" opacity="0.45">
            <ellipse cx="270" cy="290" rx="18" ry="6" />
            <ellipse cx="320" cy="250" rx="14" ry="5" />
            <ellipse cx="345" cy="330" rx="16" ry="5" />
          </g>

          {/* ================= SATELLITE 1 (Primary Monitored Spacecraft) ================= */}
          <g className="sat-orbit sat-orbit-1">
            <g transform="translate(530,300)">
              {/* Telemetry pulse if anomaly */}
              {anomalyDetected && (
                <circle cx="0" cy="0" r="28" fill="none" stroke="#ff4d4d" strokeWidth="1.5" className="animate-ping opacity-75" />
              )}

              {/* Satellite Body & Solar Panels */}
              <rect
                x="-7"
                y="-18"
                width="14"
                height="36"
                rx="2"
                fill={anomalyDetected ? '#ffbaba' : '#e3e7eb'}
                stroke={anomalyDetected ? '#ff4d4d' : '#ffffff'}
                strokeWidth="1.2"
              />

              {/* Subsystem Highlight: Power Area */}
              {anomalyDetected && (
                <rect x="-6" y="-6" width="12" height="12" fill="#ff4d4d" opacity="0.85" filter="url(#glow)" />
              )}

              {/* Solar Array Left */}
              <rect x="-42" y="-11" width="32" height="22" fill="#1a3a6b" stroke="#8fa8c5" strokeWidth="1" />
              <line x1="-34" y1="-11" x2="-34" y2="11" stroke="#162d4a" strokeWidth="1" />
              <line x1="-26" y1="-11" x2="-26" y2="11" stroke="#162d4a" strokeWidth="1" />

              {/* Solar Array Right */}
              <rect x="10" y="-11" width="32" height="22" fill="#1a3a6b" stroke="#8fa8c5" strokeWidth="1" />
              <line x1="26" y1="-11" x2="26" y2="11" stroke="#162d4a" strokeWidth="1" />
              <line x1="34" y1="-11" x2="34" y2="11" stroke="#162d4a" strokeWidth="1" />

              {/* Antenna Mast */}
              <line x1="0" y1="-18" x2="0" y2="-30" stroke="#cfd8e3" strokeWidth="2" />
              <circle cx="0" cy="-32" r="3" fill={anomalyDetected ? '#ff4d4d' : '#ffffff'} />
            </g>
          </g>

          {/* ================= SATELLITE 2 (Plane 2) ================= */}
          <g className="sat-orbit sat-orbit-2">
            <g transform="rotate(60 300 300) translate(530,300) rotate(-60)">
              <rect x="-6" y="-15" width="12" height="30" rx="2" fill="#e3e7eb" stroke="#ffffff" strokeWidth="0.8" />
              <rect x="-36" y="-9" width="27" height="18" fill="#1a3a6b" stroke="#8fa8c5" strokeWidth="0.8" />
              <rect x="9" y="-9" width="27" height="18" fill="#1a3a6b" stroke="#8fa8c5" strokeWidth="0.8" />
              <line x1="0" y1="-15" x2="0" y2="-25" stroke="#cfd8e3" strokeWidth="1.5" />
              <circle cx="0" cy="-26" r="2.5" fill="#39ff8a" />
            </g>
          </g>

          {/* ================= SATELLITE 3 (Plane 3) ================= */}
          <g className="sat-orbit sat-orbit-3">
            <g transform="rotate(120 300 300) translate(530,300) rotate(-120)">
              <rect x="-6" y="-15" width="12" height="30" rx="2" fill="#e3e7eb" stroke="#ffffff" strokeWidth="0.8" />
              <rect x="-36" y="-9" width="27" height="18" fill="#1a3a6b" stroke="#8fa8c5" strokeWidth="0.8" />
              <rect x="9" y="-9" width="27" height="18" fill="#1a3a6b" stroke="#8fa8c5" strokeWidth="0.8" />
              <line x1="0" y1="-15" x2="0" y2="-25" stroke="#cfd8e3" strokeWidth="1.5" />
              <circle cx="0" cy="-26" r="2.5" fill="#4ecdf0" />
            </g>
          </g>
        </svg>
      </div>

      {/* Subsystem Telemetry Card */}
      {anomalyDetected && (
        <div className="mt-3 p-3 bg-red-950/40 border border-red-700/60 rounded-lg flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-xs font-bold text-red-300">
                ACTIVE TELEMETRY ANOMALY DETECTED IN ORBIT
              </p>
              <p className="text-xs text-red-200">
                Component <span className="font-mono font-semibold">{activeComponentId}</span> ({activeSubsystem} Subsystem) power consumption reached <strong className="font-mono">44.2 mA</strong> (Expected: ~12 mA • +268% Deviation).
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-red-900/80 text-red-200 text-xs font-mono font-bold rounded border border-red-600">
            DAY {missionDay}
          </span>
        </div>
      )}
    </div>
  );
};

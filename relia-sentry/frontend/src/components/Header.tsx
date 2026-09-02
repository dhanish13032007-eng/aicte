import React from 'react';
import { Shield, Sparkles, Cpu, ChevronDown } from 'lucide-react';

interface HeaderProps {
  currentLot: string;
  isLiveML: boolean;
  onToggleMode: () => void;
  onQuickDemoSeed: () => void;
  burnInHour: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentLot,
  isLiveML,
  onToggleMode,
  onQuickDemoSeed,
  burnInHour,
}) => {
  return (
    <header
      className="h-14 px-6 flex items-center justify-between shrink-0 z-10"
      style={{
        background: '#ffffff',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Left: breadcrumb + lot info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>Active Lot</span>
          <span style={{ color: 'var(--border-strong)' }}>/</span>
          <span
            className="font-semibold font-mono text-[13px]"
            style={{ color: 'var(--primary)' }}
          >
            {currentLot}
          </span>
        </div>

        <div
          className="h-4"
          style={{ width: '1px', background: 'var(--border)' }}
        />

        <div className="flex items-center gap-1.5 text-[12px]">
          <span style={{ color: 'var(--text-muted)' }}>Burn-In:</span>
          <span
            className="font-mono font-semibold"
            style={{ color: burnInHour >= 24 ? 'var(--warning)' : 'var(--text-secondary)' }}
          >
            {burnInHour}h / 168h
          </span>
        </div>

        {/* QA Notice */}
        <div
          className="hidden xl:flex items-center gap-1.5 text-[11px] pl-4"
          style={{ borderLeft: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <Shield className="w-3 h-3" />
          AI-Assisted Decision Support · Final QA authority remains with human reviewer
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onQuickDemoSeed}
          className="btn btn-sm btn-secondary"
        >
          <Sparkles className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
          Demo Scenario
        </button>

        <button
          onClick={onToggleMode}
          className="btn btn-sm"
          style={{
            background: isLiveML ? 'var(--success-bg)' : 'var(--primary-light)',
            color: isLiveML ? 'var(--success)' : 'var(--primary)',
            border: `1px solid ${isLiveML ? 'var(--success-border)' : 'var(--primary-border)'}`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: isLiveML ? 'var(--success)' : 'var(--primary)' }}
          />
          {isLiveML ? 'Live ML (FastAPI)' : 'Demo Mode'}
        </button>
      </div>
    </header>
  );
};

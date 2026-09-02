import React from 'react';
import {
  LayoutDashboard,
  Database,
  Flame,
  Clock,
  Cpu,
  FileSearch,
  Microscope,
  BarChart3,
  Scale,
  FlaskConical,
  ListTodo,
  TrendingUp,
  Satellite,
  FileText,
  Activity,
  Sliders,
  Radio,
  ChevronRight,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'data-generator'
  | 'burn-in'
  | 'time-machine'
  | 'screening'
  | 'details'
  | 'forensic'
  | 'lot-analysis'
  | 'traditional-vs-ai'
  | 'defect-lab'
  | 'review-queue'
  | 'predictions'
  | 'mission-monitoring'
  | 'reports'
  | 'model-status'
  | 'settings';

interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  reviewQueueCount?: number;
  missedDetectionCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  reviewQueueCount = 2,
  missedDetectionCount = 1,
}) => {
  const navSections = [
    {
      title: 'Operations',
      items: [
        { id: 'dashboard',      label: 'Dashboard',          icon: LayoutDashboard },
        { id: 'data-generator', label: 'Data Generator',     icon: Database },
        { id: 'burn-in',        label: 'Burn-In Simulator',  icon: Flame },
        { id: 'time-machine',   label: 'Time Machine',       icon: Clock, badge: 'AI' },
      ],
    },
    {
      title: 'Screening & Analysis',
      items: [
        { id: 'screening',         label: 'Component Screening', icon: Cpu },
        { id: 'details',           label: 'Component Details',   icon: FileSearch },
        { id: 'forensic',          label: 'Forensic Analysis',   icon: Microscope },
        { id: 'lot-analysis',      label: 'Lot Analysis',        icon: BarChart3 },
        { id: 'traditional-vs-ai', label: 'Traditional vs AI',   icon: Scale },
        { id: 'defect-lab',        label: 'Defect Injection Lab', icon: FlaskConical },
        { id: 'review-queue',      label: 'QA Review Queue',     icon: ListTodo, count: reviewQueueCount },
      ],
    },
    {
      title: 'Mission & Reports',
      items: [
        { id: 'mission-monitoring', label: 'Mission Monitoring', icon: Satellite, alert: missedDetectionCount > 0 },
        { id: 'predictions',        label: 'Prediction Analytics', icon: TrendingUp },
        { id: 'reports',            label: 'Screening Reports',  icon: FileText },
        { id: 'model-status',       label: 'ML Model Status',    icon: Activity },
        { id: 'settings',           label: 'Settings',           icon: Sliders },
      ],
    },
  ];

  return (
    <aside
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
      className="w-60 flex flex-col h-screen select-none shrink-0"
    >
      {/* Brand */}
      <div
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}
        className="h-14 px-5 flex items-center gap-3 shrink-0"
      >
        <div
          style={{ background: '#2563eb' }}
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        >
          <Satellite className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-white text-[15px] leading-tight tracking-tight">
            ReliaSentry
          </h1>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--sidebar-text)' }}>
            Reliability Platform
          </p>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {navSections.map((section) => (
          <div key={section.title}>
            <p
              className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: '#64748b' }}
            >
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id as NavTab)}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-all text-left group"
                    style={{
                      background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                      color: isActive ? '#fff' : 'var(--sidebar-text)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--sidebar-hover-bg)';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--sidebar-text-active)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--sidebar-text)';
                      }
                    }}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0" style={{ opacity: isActive ? 1 : 0.7 }} />
                      <span className="truncate font-medium text-[13px]">{item.label}</span>
                    </span>

                    <span className="flex items-center gap-1 shrink-0">
                      {item.badge && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: '#1d4ed8', color: '#bfdbfe' }}
                        >
                          {item.badge}
                        </span>
                      )}
                      {item.count !== undefined && item.count > 0 && (
                        <span
                          className="text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full"
                          style={{ background: '#f59e0b', color: '#fff' }}
                        >
                          {item.count}
                        </span>
                      )}
                      {(item as any).alert && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: '#ef4444' }}
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Status */}
      <div
        style={{ borderTop: '1px solid var(--sidebar-border)', background: '#131e30' }}
        className="px-4 py-3 text-[11px] shrink-0"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5" style={{ color: '#64748b' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            API Connected
          </span>
          <span className="font-mono" style={{ color: '#22c55e' }}>ONLINE</span>
        </div>
        <p className="mt-1 truncate" style={{ color: '#475569' }}>ISRO/ESA Qual Chamber 4</p>
      </div>
    </aside>
  );
};

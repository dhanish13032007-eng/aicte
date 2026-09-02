import React, { useState, useEffect } from 'react';
import { Navigation, NavTab } from './components/Navigation';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { DataGenerator } from './pages/DataGenerator';
import { BurnInSimulator } from './pages/BurnInSimulator';
import { TimeMachine } from './pages/TimeMachine';
import { ComponentScreening } from './pages/ComponentScreening';
import { ComponentDetails } from './pages/ComponentDetails';
import { ForensicAnalysis } from './pages/ForensicAnalysis';
import { LotAnalysis } from './pages/LotAnalysis';
import { TraditionalVsAI } from './pages/TraditionalVsAI';
import { DefectInjectionLab } from './pages/DefectInjectionLab';
import { ReviewQueue } from './pages/ReviewQueue';
import { Predictions } from './pages/Predictions';
import { MissionMonitoring } from './pages/MissionMonitoring';
import { Reports } from './pages/Reports';
import { ModelStatus } from './pages/ModelStatus';
import { Settings } from './pages/Settings';
import { DEMO_COMPONENTS, DEMO_LOT_ID, generateLot, screenLot } from './services/api';
import { ComponentData, DecisionType } from './types';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isLiveML, setIsLiveML] = useState(false);
  const [lotId, setLotId] = useState(DEMO_LOT_ID);
  const [components, setComponents] = useState<ComponentData[]>(DEMO_COMPONENTS);
  const [selectedComponentId, setSelectedComponentId] = useState('C-1002');

  // Burn-In simulation state
  const [burnInHour, setBurnInHour] = useState(0);
  const [temperature, setTemperature] = useState(25);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<string>('');

  // Simulation Clock Tick (0h → 24h → 96h → 168h, temperature 25°C → 60°C → 90°C → 125°C)
  useEffect(() => {
    let timer: any = null;
    if (isSimulating) {
      timer = setInterval(() => {
        setBurnInHour((prev) => {
          if (prev >= 168) {
            setIsSimulating(false);
            setTemperature(125);
            return 168;
          }
          const next = prev + 6;
          // Ramp temperature smoothly from 25°C to 125°C
          const ramp = 25 + Math.min(100, (next / 168) * 100);
          setTemperature(ramp);
          return next;
        });
      }, 300);
    }
    return () => clearInterval(timer);
  }, [isSimulating]);

  const handleStartBurnIn = () => {
    setIsSimulating(true);
  };

  const handlePauseBurnIn = () => {
    setIsSimulating(false);
  };

  const handleFreezeAt24h = () => {
    setIsSimulating(false);
    setBurnInHour(24);
    setTemperature(60);
    setSelectedComponentId('C-1002');
    setCurrentTab('time-machine');
  };

  const handleResetBurnIn = () => {
    setIsSimulating(false);
    setBurnInHour(0);
    setTemperature(25);
  };

  const handleGenerateData = async (newLot: string, count: number, temp: number, hours: number) => {
    setIsGenerating(true);
    setApiError(null);
    setGenerateStatus('Generating lot data on server…');
    try {
      // Step 1: generate the lot data on the backend
      await generateLot(newLot, count, temp, hours);
      setGenerateStatus('Running AI screening (XGBoost + Isolation Forest)…');

      // Step 2: run AI screening and get real component results
      const liveComponents = await screenLot(newLot);
      setComponents(liveComponents);
      setLotId(newLot);
      setTemperature(temp);
      setBurnInHour(0);
      setIsLiveML(true);
      // Select the highest-risk component automatically
      const highRisk = [...liveComponents].sort((a, b) => b.risk_score - a.risk_score)[0];
      if (highRisk) setSelectedComponentId(highRisk.component_id);
      setGenerateStatus('');
      setCurrentTab('screening');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Unknown error';
      setApiError(`Generation failed: ${msg}`);
      setGenerateStatus('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateComponentDecision = (
    id: string,
    newDecision: DecisionType,
    assignedTo?: string
  ) => {
    setComponents((prev) =>
      prev.map((c) =>
        c.component_id === id
          ? {
              ...c,
              decision: newDecision,
              assigned_to: assignedTo || c.assigned_to,
            }
          : c
      )
    );
  };

  const handleQuickDemoSeed = () => {
    setLotId(DEMO_LOT_ID);
    setComponents(DEMO_COMPONENTS);
    setSelectedComponentId('C-1002');
    setBurnInHour(24);
    setTemperature(60);
    setIsSimulating(false);
    setCurrentTab('dashboard');
  };

  const selectedComp =
    components.find((c) => c.component_id === selectedComponentId) || components[0];

  const reviewCount = components.filter(
    (c) => c.decision === 'REVIEW' || c.decision === 'REJECT'
  ).length;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Sidebar Navigation */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        reviewQueueCount={reviewCount}
        missedDetectionCount={1}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
        {/* Top Header */}
        <Header
          currentLot={lotId}
          isLiveML={isLiveML}
          onToggleMode={() => setIsLiveML(!isLiveML)}
          onQuickDemoSeed={handleQuickDemoSeed}
          burnInHour={burnInHour}
        />

        {/* Error / Status Banner */}
        {(apiError || generateStatus) && (
          <div
            style={{
              padding: '10px 24px',
              background: apiError ? '#fef2f2' : '#eff6ff',
              borderBottom: `1px solid ${apiError ? '#fecaca' : '#bfdbfe'}`,
              color: apiError ? '#dc2626' : '#2563eb',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {generateStatus && !apiError && (
              <svg style={{ animation: 'spin 1s linear infinite', width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
            )}
            {apiError || generateStatus}
            {apiError && (
              <button
                onClick={() => setApiError(null)}
                style={{ marginLeft: 'auto', fontWeight: 700, cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626' }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto" style={{ padding: '24px', background: 'var(--bg)' }}>
          {currentTab === 'dashboard' && (
            <Dashboard
              components={components}
              lotId={lotId}
              burnInHour={burnInHour}
              temperature={temperature}
              isSimulating={isSimulating}
              onNavigate={setCurrentTab}
              onSelectComponent={setSelectedComponentId}
              onStartBurnIn={handleStartBurnIn}
              onPauseBurnIn={handlePauseBurnIn}
              onFreezeAt24h={handleFreezeAt24h}
              onResetBurnIn={handleResetBurnIn}
            />
          )}

          {currentTab === 'data-generator' && (
            <DataGenerator
              onGenerate={handleGenerateData}
              onNavigate={setCurrentTab}
              isGenerating={isGenerating}
              generateStatus={generateStatus}
            />
          )}

          {currentTab === 'burn-in' && (
            <BurnInSimulator
              currentHour={burnInHour}
              temperature={temperature}
              isRunning={isSimulating}
              components={components}
              selectedComponentId={selectedComponentId}
              onSelectComponent={setSelectedComponentId}
              onStartBurnIn={handleStartBurnIn}
              onPauseBurnIn={handlePauseBurnIn}
              onFreezeAt24h={handleFreezeAt24h}
              onReset={handleResetBurnIn}
              onNavigate={setCurrentTab}
            />
          )}

          {currentTab === 'time-machine' && (
            <TimeMachine component={selectedComp} onNavigate={setCurrentTab} />
          )}

          {currentTab === 'screening' && (
            <ComponentScreening
              components={components}
              selectedComponentId={selectedComponentId}
              onSelectComponent={setSelectedComponentId}
              onNavigate={setCurrentTab}
            />
          )}

          {currentTab === 'details' && (
            <ComponentDetails
              component={selectedComp}
              onNavigate={setCurrentTab}
              onSelectComponent={setSelectedComponentId}
            />
          )}

          {currentTab === 'forensic' && (
            <ForensicAnalysis component={selectedComp} onNavigate={setCurrentTab} />
          )}

          {currentTab === 'lot-analysis' && (
            <LotAnalysis components={components} lotId={lotId} />
          )}

          {currentTab === 'traditional-vs-ai' && (
            <TraditionalVsAI component={selectedComp} onNavigate={setCurrentTab} />
          )}

          {currentTab === 'defect-lab' && (
            <DefectInjectionLab onNavigate={setCurrentTab} />
          )}

          {currentTab === 'review-queue' && (
            <ReviewQueue
              components={components}
              onUpdateComponentDecision={handleUpdateComponentDecision}
            />
          )}

          {currentTab === 'predictions' && (
            <Predictions components={components} />
          )}

          {currentTab === 'mission-monitoring' && (
            <MissionMonitoring
              passCount={components.filter((c) => c.decision === 'PASS').length}
            />
          )}

          {currentTab === 'reports' && (
            <Reports components={components} lotId={lotId} />
          )}

          {currentTab === 'model-status' && <ModelStatus />}

          {currentTab === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
};

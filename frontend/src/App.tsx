import { useState } from 'react';
import { Activity, FileSearch, Upload, History } from 'lucide-react';
import IngestionTab from '../src/components/ingestion/IngestionTab';
import ReportTab from '../src/components/report/ReportTab';
import RunsTab from '../src/components/dashboard/RunsTab';

type Tab = 'ingest' | 'report' | 'runs';

interface ActiveRun {
  runId: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('ingest');
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);

  const handleRunStarted = (runId: string) => {
    setActiveRun({ runId });
    setActiveTab('report');
  };

  const handleSelectRun = (runId: string) => {
    setActiveRun({ runId });
    setActiveTab('report');
  };

  const tabs = [
    { id: 'ingest' as Tab, label: 'Ingest & Run', icon: Upload },
    { id: 'report' as Tab, label: 'Report', icon: FileSearch, disabled: !activeRun },
    { id: 'runs' as Tab, label: 'Run History', icon: History },
  ];

  return (
    <div className="noise min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          background: 'rgba(10, 10, 15, 0.85)',
          backdropFilter: 'blur(16px)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--green-dim)', border: '1px solid rgba(74,222,128,0.3)' }}
            >
              <Activity size={16} style={{ color: 'var(--green)' }} />
            </div>
            <div>
              <div className="font-display font-semibold text-sm tracking-wide" style={{ color: 'var(--text-primary)' }}>
                ReconEngine
              </div>
              <div className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                Crypto Transaction Reconciliation
              </div>
            </div>
          </div>

          {/* Tab navigation */}
          <nav className="flex items-center gap-1">
            {tabs.map(({ id, label, icon: Icon, disabled }) => (
              <button
                key={id}
                onClick={() => !disabled && setActiveTab(id)}
                disabled={disabled}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  color: activeTab === id ? 'var(--green)' : disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
                  background: activeTab === id ? 'var(--green-dim)' : 'transparent',
                  border: activeTab === id ? '1px solid rgba(74,222,128,0.2)' : '1px solid transparent',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </nav>

          {activeRun && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-xs"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse-slow" style={{ background: 'var(--green)' }} />
              {activeRun.runId.slice(0, 8)}...
            </div>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'ingest' && <IngestionTab onRunStarted={handleRunStarted} />}
        {activeTab === 'report' && activeRun && <ReportTab runId={activeRun.runId} />}
        {activeTab === 'runs' && <RunsTab onSelectRun={handleSelectRun} />}
      </main>
    </div>
  );
}

export default App; 
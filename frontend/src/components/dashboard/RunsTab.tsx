import { useEffect, useState } from 'react';
import { RefreshCw, ArrowRight, Clock } from 'lucide-react';
import { getRuns } from '../../lib/api';
import type { ReconciliationRun } from '../../types/api';

export default function RunsTab({ onSelectRun }: { onSelectRun: (runId: string) => void }) {
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = async () => {
    try {
      const data = await getRuns();
      setRuns(data.runs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRuns(); }, []);

  const statusColor: Record<string, string> = {
    COMPLETED: 'var(--green)',
    RUNNING: 'var(--amber)',
    FAILED: 'var(--red)',
    PENDING: 'var(--gray)',
  };

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Run History
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Recent reconciliation runs (last 20)
          </p>
        </div>
        <button
          onClick={fetchRuns}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : runs.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-48 rounded-2xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <Clock size={32} style={{ color: 'var(--text-muted)' }} />
          <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>No runs yet — run your first reconciliation</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <div
              key={run.runId}
              className="rounded-xl p-5 flex items-center justify-between cursor-pointer transition-all hover:border-opacity-50"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              onClick={() => onSelectRun(run.runId)}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: statusColor[run.status] ?? 'var(--gray)',
                    boxShadow: `0 0 6px ${statusColor[run.status] ?? 'var(--gray)'}`,
                  }}
                />
                <div>
                  <div className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                    {run.runId.slice(0, 8)}...
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {new Date(run.startedAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 text-xs">
                {run.status === 'COMPLETED' && (
                  <>
                    <div className="text-center">
                      <div className="font-mono font-semibold" style={{ color: 'var(--green)' }}>{run.summary?.matched}</div>
                      <div style={{ color: 'var(--text-muted)' }}>matched</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono font-semibold" style={{ color: 'var(--amber)' }}>{run.summary?.conflicting}</div>
                      <div style={{ color: 'var(--text-muted)' }}>conflicting</div>
                    </div>
                    <div className="text-center">
                      <div className="font-mono font-semibold" style={{ color: 'var(--red)' }}>{run.summary?.unmatchedUser}</div>
                      <div style={{ color: 'var(--text-muted)' }}>user only</div>
                    </div>
                  </>
                )}
                <span
                  className="px-2 py-1 rounded-full text-xs font-medium"
                  style={{ color: statusColor[run.status], background: `${statusColor[run.status]}18` }}
                >
                  {run.status}
                </span>
                <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
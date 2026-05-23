import { useState, useCallback, type DragEvent } from 'react';
import { Upload, FileText, X, Zap, Clock, Percent, AlertCircle, CheckCircle2 } from 'lucide-react';
import { reconcile } from '../../lib/api';

interface IngestionTabProps {
  onRunStarted: (runId: string) => void;
}

interface FileState {
  file: File | null;
  isDragging: boolean;
}

function FileDropzone({
  label,
  hint,
  fileState,
  onFile,
  onClear,
  accept = '.csv',
}: {
  label: string;
  hint: string;
  fileState: FileState;
  onFile: (f: File) => void;
  onClear: () => void;
  accept?: string;
}) {
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleDragOver = (e: DragEvent) => e.preventDefault();

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="relative rounded-xl transition-all duration-300 cursor-pointer group"
      style={{
        border: `1.5px dashed ${fileState.file ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.12)'}`,
        background: fileState.file ? 'rgba(74,222,128,0.05)' : 'var(--bg-card)',
        minHeight: '160px',
      }}
      onClick={() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) onFile(f);
        };
        input.click();
      }}
    >
      <div className="flex flex-col items-center justify-center h-full p-6 text-center" style={{ minHeight: '160px' }}>
        {fileState.file ? (
          <>
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
              style={{ background: 'var(--green-dim)' }}
            >
              <CheckCircle2 size={22} style={{ color: 'var(--green)' }} />
            </div>
            <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
              {fileState.file.name}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {(fileState.file.size / 1024).toFixed(1)} KB
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="mt-3 flex items-center gap-1 text-xs px-3 py-1 rounded-lg transition-colors"
              style={{ color: 'var(--red)', background: 'var(--red-dim)' }}
            >
              <X size={12} /> Remove
            </button>
          </>
        ) : (
          <>
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <Upload size={20} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{label}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hint}</p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Drag & drop or <span style={{ color: 'var(--green)' }}>click to browse</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function IngestionTab({ onRunStarted }: IngestionTabProps) {
  const [userFile, setUserFile] = useState<FileState>({ file: null, isDragging: false });
  const [exchangeFile, setExchangeFile] = useState<FileState>({ file: null, isDragging: false });

  const [timestampTolerance, setTimestampTolerance] = useState(300);
  const [quantityTolerance, setQuantityTolerance] = useState(0.01);

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const canRun = !!userFile.file && !!exchangeFile.file;

  const handleRun = async () => {
    if (!userFile.file || !exchangeFile.file) return;
    setStatus('loading');
    setError(null);
    try {
      const result = await reconcile(userFile.file, exchangeFile.file, {
        timestampToleranceSeconds: timestampTolerance,
        quantityTolerancePct: quantityTolerance,
      });
      setStatus('success');
      onRunStarted(result.runId);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl mx-auto">
      {/* Section header */}
      <div>
        <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Ingestion Control Hub
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Upload both transaction files and configure matching tolerances before running the engine.
        </p>
      </div>

      {/* File dropzones */}
      <div
        className="rounded-2xl p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2 mb-5">
          <FileText size={16} style={{ color: 'var(--green)' }} />
          <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
            Transaction Files
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              USER TRANSACTIONS
            </label>
            <FileDropzone
              label="user_transactions.csv"
              hint="Your exported transaction history"
              fileState={userFile}
              onFile={(f) => setUserFile({ file: f, isDragging: false })}
              onClear={() => setUserFile({ file: null, isDragging: false })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              EXCHANGE TRANSACTIONS
            </label>
            <FileDropzone
              label="exchange_transactions.csv"
              hint="The exchange's exported records"
              fileState={exchangeFile}
              onFile={(f) => setExchangeFile({ file: f, isDragging: false })}
              onClear={() => setExchangeFile({ file: null, isDragging: false })}
            />
          </div>
        </div>
      </div>

      {/* Tolerance Panel */}
      <div
        className="rounded-2xl p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2 mb-5">
          <Zap size={16} style={{ color: 'var(--green)' }} />
          <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
            Matching Tolerances
          </span>
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full font-mono"
            style={{ background: 'var(--green-dim)', color: 'var(--green)' }}
          >
            configurable
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Timestamp tolerance */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Clock size={14} style={{ color: 'var(--text-secondary)' }} />
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Timestamp Window
                </label>
              </div>
              <span className="font-mono text-sm font-semibold" style={{ color: 'var(--green)' }}>
                {timestampTolerance}s
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={3600}
              step={60}
              value={timestampTolerance}
              onChange={(e) => setTimestampTolerance(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--green) ${((timestampTolerance - 60) / (3600 - 60)) * 100}%, var(--bg-elevated) ${((timestampTolerance - 60) / (3600 - 60)) * 100}%)`,
                accentColor: 'var(--green)',
              }}
            />
            <div className="flex justify-between mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>1 min</span>
              <span>1 hour</span>
            </div>
          </div>

          {/* Quantity tolerance */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Percent size={14} style={{ color: 'var(--text-secondary)' }} />
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Quantity Tolerance
                </label>
              </div>
              <span className="font-mono text-sm font-semibold" style={{ color: 'var(--green)' }}>
                {quantityTolerance.toFixed(2)}%
              </span>
            </div>
            <input
              type="number"
              min={0}
              max={5}
              step={0.01}
              value={quantityTolerance}
              onChange={(e) => setQuantityTolerance(Math.min(5, Math.max(0, Number(e.target.value))))}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Percentage deviation allowed in quantity (e.g. 0.01 = 0.01%)
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl animate-fade-in"
          style={{ background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.2)' }}
        >
          <AlertCircle size={16} style={{ color: 'var(--red)' }} />
          <span className="text-sm" style={{ color: 'var(--red)' }}>{error}</span>
        </div>
      )}

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={!canRun || status === 'loading'}
        className="w-full py-4 rounded-xl font-display font-semibold text-base transition-all duration-300 relative overflow-hidden"
        style={{
          background: canRun && status !== 'loading'
            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
            : 'var(--bg-elevated)',
          color: canRun && status !== 'loading' ? '#000' : 'var(--text-muted)',
          cursor: !canRun || status === 'loading' ? 'not-allowed' : 'pointer',
          boxShadow: canRun && status !== 'loading' ? '0 0 30px rgba(74,222,128,0.3)' : 'none',
        }}
      >
        {status === 'loading' ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Starting reconciliation engine...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Zap size={18} />
            Run Reconciliation Engine
          </span>
        )}
      </button>

      {!canRun && (
        <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          Upload both CSV files to enable the engine
        </p>
      )}
    </div>
  );
}
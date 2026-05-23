import { useCallback, useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Download, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, HelpCircle, AlertCircle, ChevronLeft, ChevronRight,
  Filter,
} from 'lucide-react';
import { getReport, getSummary, getExportUrl } from '../../lib/api';
import type { ReconciliationDetail, SummaryResponse, MatchCategory } from '../../types/api';

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<MatchCategory, { label: string; color: string; cssClass: string; icon: React.FC<{ size?: number }> }> = {
  MATCHED: { label: 'Matched', color: '#4ade80', cssClass: 'badge-matched', icon: CheckCircle2 },
  CONFLICTING: { label: 'Conflicting', color: '#fbbf24', cssClass: 'badge-conflicting', icon: AlertTriangle },
  UNMATCHED_USER: { label: 'User Only', color: '#f87171', cssClass: 'badge-unmatched-user', icon: XCircle },
  UNMATCHED_EXCHANGE: { label: 'Exchange Only', color: '#60a5fa', cssClass: 'badge-unmatched-exchange', icon: HelpCircle },
};

function Badge({ category }: { category: MatchCategory }) {
  const cfg = CATEGORY_CONFIG[category];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cssClass}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETED: 'var(--green)',
    RUNNING: 'var(--amber)',
    FAILED: 'var(--red)',
    PENDING: 'var(--gray)',
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: colors[status] ?? 'var(--gray)' }}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: colors[status] ?? 'var(--gray)',
          boxShadow: status === 'RUNNING' ? `0 0 6px ${colors[status]}` : 'none',
          animation: status === 'RUNNING' ? 'pulse 1.5s infinite' : 'none',
        }}
      />
      {status}
    </span>
  );
}

function MetricCard({
  label, value, color, subtext,
}: { label: string; value: number; color: string; subtext?: string }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="text-3xl font-display font-bold" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
      {subtext && <div className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{subtext}</div>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ReportTab({ runId }: { runId: string }) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [details, setDetails] = useState<ReconciliationDetail[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [categoryFilter, setCategoryFilter] = useState<MatchCategory | ''>('');
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await getSummary(runId);
      setSummary(data);
      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        setPolling(false);
      }
    } catch (e) {
      console.error(e);
    }
  }, [runId]);

  const fetchDetails = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const data = await getReport(runId, {
        category: categoryFilter || undefined,
        page,
        limit: 20,
      });
      setDetails(data.details);
      setPagination(data.pagination);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [runId, categoryFilter]);

  // Initial load + polling for live status
  useEffect(() => {
    fetchSummary();
    const interval = polling
      ? setInterval(fetchSummary, 2000)
      : null;
    return () => { if (interval) clearInterval(interval); };
  }, [fetchSummary, polling]);

  useEffect(() => {
    if (summary?.status === 'COMPLETED') {
      fetchDetails(1);
    }
  }, [summary?.status, fetchDetails]);

  const handlePageChange = (page: number) => fetchDetails(page);

  // Chart data
  const chartData = summary
    ? [
        { name: 'Matched', value: summary.summary.matched, color: '#4ade80' },
        { name: 'Conflicting', value: summary.summary.conflicting, color: '#fbbf24' },
        { name: 'User Only', value: summary.summary.unmatchedUser, color: '#f87171' },
        { name: 'Exchange Only', value: summary.summary.unmatchedExchange, color: '#60a5fa' },
        { name: 'Invalid', value: (summary.summary.invalidUser ?? 0) + (summary.summary.invalidExchange ?? 0), color: '#6b7280' },
      ].filter((d) => d.value > 0)
    : [];

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw size={18} className="animate-spin" />
          <span className="text-sm">Loading run data...</span>
        </div>
      </div>
    );
  }

  const isRunning = summary.status === 'RUNNING' || summary.status === 'PENDING';

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Reconciliation Report
            </h1>
            <StatusDot status={summary.status} />
          </div>
          <p className="mt-1 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            Run ID: {runId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <button onClick={fetchSummary} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              <RefreshCw size={12} className="animate-spin" />
              Refreshing...
            </button>
          )}
          {summary.status === 'COMPLETED' && (
            <a
              href={getExportUrl(runId)}
              download
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(74,222,128,0.25)' }}
            >
              <Download size={14} />
              Export CSV
            </a>
          )}
        </div>
      </div>

      {/* Running indicator */}
      {isRunning && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{ background: 'var(--amber-dim)', border: '1px solid rgba(251,191,36,0.2)' }}
        >
          <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--amber)' }} />
          <span className="text-sm" style={{ color: 'var(--amber)' }}>
            Reconciliation engine is running — this usually completes in a few seconds...
          </span>
        </div>
      )}

      {/* Failed indicator */}
      {summary.status === 'FAILED' && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{ background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.2)' }}
        >
          <AlertCircle size={16} style={{ color: 'var(--red)' }} />
          <span className="text-sm" style={{ color: 'var(--red)' }}>
            Reconciliation failed. Check server logs for details.
          </span>
        </div>
      )}

      {/* Summary section */}
      {summary.status === 'COMPLETED' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Matched" value={summary.summary.matched} color="var(--green)" subtext="Within all tolerances" />
            <MetricCard label="Conflicting" value={summary.summary.conflicting} color="var(--amber)" subtext="Proximity match, field mismatch" />
            <MetricCard label="User Only" value={summary.summary.unmatchedUser} color="var(--red)" subtext="Not found on exchange" />
            <MetricCard label="Exchange Only" value={summary.summary.unmatchedExchange} color="var(--blue)" subtext="Not found in user file" />
          </div>

          {/* Chart + data quality */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Donut chart */}
            <div
              className="md:col-span-2 rounded-2xl p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
                Distribution Overview
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} opacity={0.9} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Data quality panel */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Data Quality
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>Total user rows</span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{summary.summary.totalUser}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>Total exchange rows</span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{summary.summary.totalExchange}</span>
                </div>
                <div className="h-px" style={{ background: 'var(--border)' }} />
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>Invalid user rows</span>
                  <span className="font-mono" style={{ color: 'var(--red)' }}>{summary.summary.invalidUser}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>Invalid exchange rows</span>
                  <span className="font-mono" style={{ color: 'var(--red)' }}>{summary.summary.invalidExchange}</span>
                </div>
              </div>

              {/* Invalid rows detail */}
              {summary.invalidRows?.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Flagged Rows
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {summary.invalidRows.map((row, i) => (
                      <div
                        key={i}
                        className="p-2 rounded-lg text-xs"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        <div className="flex justify-between">
                          <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{row.transactionId}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{row.source}</span>
                        </div>
                        {row.validationErrors.map((e, j) => (
                          <div key={j} style={{ color: 'var(--red)', marginTop: '2px' }}>• {e}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Detail table */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            {/* Table header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Reconciliation Details
                <span className="ml-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  {pagination.total} rows
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Filter size={12} style={{ color: 'var(--text-muted)' }} />
                <select
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value as MatchCategory | ''); }}
                  className="text-xs px-2 py-1.5 rounded-lg"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <option value="">All categories</option>
                  <option value="MATCHED">Matched</option>
                  <option value="CONFLICTING">Conflicting</option>
                  <option value="UNMATCHED_USER">User Only</option>
                  <option value="UNMATCHED_EXCHANGE">Exchange Only</option>
                </select>
                {categoryFilter && (
                  <a
                    href={getExportUrl(runId, categoryFilter)}
                    download
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg"
                    style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(74,222,128,0.2)' }}
                  >
                    <Download size={10} />
                    Export filtered
                  </a>
                )}
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Status', 'User TX ID', 'Exchange TX ID', 'Asset', 'Type', 'User Qty', 'Exc Qty', 'ΔT (s)', 'Reason'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left font-medium uppercase tracking-wider"
                          style={{ color: 'var(--text-muted)', fontSize: '10px' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((row) => (
                      <tr
                        key={row._id}
                        className="transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        <td className="px-4 py-3">
                          <Badge category={row.category} />
                        </td>
                        <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {row.userTransaction?.transactionId ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {row.exchangeTransaction?.transactionId ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {row.userTransaction?.asset ?? row.exchangeTransaction?.asset ?? '—'}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                          {row.userTransaction?.type ?? row.exchangeTransaction?.type ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-primary)' }}>
                          {row.userTransaction?.quantity?.toFixed(6) ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-primary)' }}>
                          {row.exchangeTransaction?.quantity?.toFixed(6) ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono" style={{ color: row.variances?.timestampDeltaSeconds ? 'var(--amber)' : 'var(--text-muted)' }}>
                          {row.variances?.timestampDeltaSeconds?.toFixed(0) ?? '—'}
                        </td>
                        <td className="px-4 py-3 max-w-xs" style={{ color: 'var(--text-muted)' }}>
                          <span title={row.reason} className="truncate block max-w-[200px]">
                            {row.reason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {details.length === 0 && (
                  <div className="flex items-center justify-center h-24 text-sm" style={{ color: 'var(--text-muted)' }}>
                    No results for this filter
                  </div>
                )}
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div
                className="flex items-center justify-between px-6 py-3 text-xs"
                style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                <span>
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
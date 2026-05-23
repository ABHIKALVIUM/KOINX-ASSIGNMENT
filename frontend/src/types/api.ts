export type ReconciliationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type MatchCategory = 'MATCHED' | 'CONFLICTING' | 'UNMATCHED_USER' | 'UNMATCHED_EXCHANGE';

export interface ReconciliationRun {
  runId: string;
  status: ReconciliationStatus;
  config: {
    timestampToleranceSeconds: number;
    quantityTolerancePct: number;
  };
  summary: {
    totalUser: number;
    totalExchange: number;
    matched: number;
    conflicting: number;
    unmatchedUser: number;
    unmatchedExchange: number;
    invalidUser: number;
    invalidExchange: number;
  };
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface TransactionSnapshot {
  transactionId?: string;
  timestamp?: string;
  type?: string;
  asset?: string;
  assetRaw?: string;
  quantity?: number;
  priceUsd?: number;
  fee?: number;
  note?: string;
}

export interface ReconciliationDetail {
  _id: string;
  runId: string;
  category: MatchCategory;
  reason: string;
  variances?: {
    timestampDeltaSeconds?: number;
    quantityDelta?: number;
    quantityDeltaPct?: number;
  };
  userTransaction?: TransactionSnapshot;
  exchangeTransaction?: TransactionSnapshot;
  createdAt: string;
}

export interface ReportResponse {
  run: ReconciliationRun;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  details: ReconciliationDetail[];
}

export interface SummaryResponse {
  runId: string;
  status: ReconciliationStatus;
  config: ReconciliationRun['config'];
  summary: ReconciliationRun['summary'];
  invalidRows: Array<{
    transactionId: string;
    source: 'USER' | 'EXCHANGE';
    validationErrors: string[];
    raw: Record<string, string>;
  }>;
  startedAt: string;
  completedAt?: string;
}
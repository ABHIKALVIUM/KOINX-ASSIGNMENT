import mongoose, { Schema, Document } from 'mongoose';

export type ReconciliationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type MatchCategory = 'MATCHED' | 'CONFLICTING' | 'UNMATCHED_USER' | 'UNMATCHED_EXCHANGE';

export interface ITransactionSnapshot {
  transactionId: string;
  timestamp?: string;
  type?: string;
  asset?: string;
  assetRaw?: string;
  quantity?: number;
  priceUsd?: number;
  fee?: number;
  note?: string;
}
// ─── Reconciliation Run Interface ─────────────────────────────────────────────
export interface IReconciliationRun extends Document {
  runId: string;
  status: ReconciliationStatus;
  config: {
    timestampToleranceSeconds: number;
    quantityTolerancePct: number;
  };
  summary?: {
    totalUser: number;
    totalExchange: number;
    matched: number;
    conflicting: number;
    unmatchedUser: number;
    unmatchedExchange: number;
    invalidUser: number;
    invalidExchange: number;
  };
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

const ReconciliationRunSchema = new Schema<IReconciliationRun>({
  runId: { type: String, required: true, unique: true, index: true },
  status: { type: String, required: true, enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] },
  config: {
    timestampToleranceSeconds: { type: Number, required: true },
    quantityTolerancePct: { type: Number, required: true },
  },
  summary: {
    totalUser: { type: Number, default: 0 },
    totalExchange: { type: Number, default: 0 },
    matched: { type: Number, default: 0 },
    conflicting: { type: Number, default: 0 },
    unmatchedUser: { type: Number, default: 0 },
    unmatchedExchange: { type: Number, default: 0 },
    invalidUser: { type: Number, default: 0 },
    invalidExchange: { type: Number, default: 0 },
  },
  error: { type: String },
  startedAt: { type: Date, required: true },
  completedAt: { type: Date },
});

export const ReconciliationRun = mongoose.model<IReconciliationRun>('ReconciliationRun', ReconciliationRunSchema, 'reconciliation_runs');

// ─── Reconciliation Detail Interface ───────────────────────────────────────────
export interface IReconciliationDetail extends Document {
  runId: string;
  category: MatchCategory;
  reason: string;
  variances?: {
    timestampDeltaSeconds?: number;
    quantityDelta?: number;
    quantityDeltaPct?: number;
  };
  userTransaction?: Record<string, any>;
  exchangeTransaction?: Record<string, any>;
  createdAt: Date;
}

const ReconciliationDetailSchema = new Schema<IReconciliationDetail>({
  runId: { type: String, required: true, index: true },
  category: { type: String, required: true, enum: ['MATCHED', 'CONFLICTING', 'UNMATCHED_USER', 'UNMATCHED_EXCHANGE'], index: true },
  reason: { type: String, required: true },
  variances: {
    timestampDeltaSeconds: { type: Number },
    quantityDelta: { type: Number },
    quantityDeltaPct: { type: Number },
  },
  userTransaction: { type: Schema.Types.Mixed },
  exchangeTransaction: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

export const ReconciliationDetail = mongoose.model<IReconciliationDetail>('ReconciliationDetail', ReconciliationDetailSchema, 'reconciliation_details');
import mongoose, { Document, Schema } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type TransactionType = 'BUY' | 'SELL' | 'TRANSFER_IN' | 'TRANSFER_OUT';
export type ValidationStatus = 'VALID' | 'INVALID';
export type TransactionSource = 'USER' | 'EXCHANGE';

// ─── Raw Transaction Interface ────────────────────────────────────────────────

export interface IRawTransaction extends Document {
  // Identity
  transactionId: string;
  source: TransactionSource;
  runIngestionId?: string;

  // Raw values (exactly as parsed from CSV)
  raw: {
    transactionId: string;
    timestamp: string;
    type: string;
    asset: string;
    quantity: string;
    price_usd: string;
    fee: string;
    note: string;
  };

  // Normalized / parsed values
  timestamp?: Date;
  type?: TransactionType;
  asset?: string;        // normalized ticker (e.g., "BTC")
  assetRaw?: string;     // original raw value (e.g., "bitcoin")
  quantity?: number;
  priceUsd?: number;
  fee?: number;
  note?: string;

  // Validation
  validationStatus: ValidationStatus;
  validationErrors: string[];

  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const RawTransactionSchema = new Schema<IRawTransaction>(
  {
    transactionId: { type: String, required: true },
    source: { type: String, enum: ['USER', 'EXCHANGE'], required: true },
    runIngestionId: { type: String },

    raw: {
      transactionId: String,
      timestamp: String,
      type: String,
      asset: String,
      quantity: String,
      price_usd: String,
      fee: String,
      note: String,
    },

    timestamp: { type: Date },
    type: { type: String, enum: ['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT'] },
    asset: { type: String },
    assetRaw: { type: String },
    quantity: { type: Number },
    priceUsd: { type: Number },
    fee: { type: Number },
    note: { type: String },

    validationStatus: { type: String, enum: ['VALID', 'INVALID'], required: true },
    validationErrors: [{ type: String }],
  },
  {
    timestamps: true,
    collection: 'raw_transactions',
  }
);

// Indexes for matching performance
RawTransactionSchema.index({ source: 1, validationStatus: 1 });
RawTransactionSchema.index({ source: 1, asset: 1, type: 1 });
RawTransactionSchema.index({ transactionId: 1, source: 1 });

export const RawTransaction = mongoose.model<IRawTransaction>(
  'RawTransaction',
  RawTransactionSchema
);
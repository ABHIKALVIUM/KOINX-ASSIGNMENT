import { IReconciliationDetail } from '../models/ReconciliationRun';

type Row = Record<string, string | number | undefined>;

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toRow(detail: IReconciliationDetail): Row {
  const u = detail.userTransaction;
  const e = detail.exchangeTransaction;

  return {
    category: detail.category,
    reason: detail.reason,

    // User side
    user_transaction_id: u?.transactionId,
    user_timestamp: u?.timestamp,
    user_type: u?.type,
    user_asset: u?.asset,
    user_asset_raw: u?.assetRaw,
    user_quantity: u?.quantity,
    user_price_usd: u?.priceUsd,
    user_fee: u?.fee,
    user_note: u?.note,

    // Exchange side
    exchange_transaction_id: e?.transactionId,
    exchange_timestamp: e?.timestamp,
    exchange_type: e?.type,
    exchange_asset: e?.asset,
    exchange_quantity: e?.quantity,
    exchange_price_usd: e?.priceUsd,
    exchange_fee: e?.fee,
    exchange_note: e?.note,

    // Variances
    timestamp_delta_seconds: detail.variances?.timestampDeltaSeconds,
    quantity_delta: detail.variances?.quantityDelta,
    quantity_delta_pct: detail.variances?.quantityDeltaPct,
  };
}

export function generateCSV(details: IReconciliationDetail[]): string {
  if (details.length === 0) return '';

  const rows = details.map(toRow);
  const headers = Object.keys(rows[0]);

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(',')),
  ];

  return lines.join('\n');
}
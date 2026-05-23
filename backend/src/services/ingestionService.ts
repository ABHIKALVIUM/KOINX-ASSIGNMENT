import csv from 'csv-parser';
import { Readable } from 'stream';
import { z } from 'zod';
import { IRawTransaction, RawTransaction, TransactionSource } from '../models/RawTransaction';
import { normalizeAsset } from '../utils/assetNormalizer';
import { logger } from '../utils/logger';

// ─── Validation Schema ────────────────────────────────────────────────────────

const VALID_TYPES = ['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT'] as const;

/**
 * Attempt to parse an ISO timestamp string.
 * Handles both:
 *   - "2024-03-01T09:00:00Z"  (standard ISO with Z)
 *   - "2024-03-01T09:00:00"   (no Z suffix)
 *   - "2024-03-01T09:00:32Z"  (with seconds variation)
 *
 * Returns null for malformed/empty timestamps.
 */
function parseTimestamp(raw: string): Date | null {
  if (!raw || raw.trim() === '') return null;

  // Append Z if missing to treat as UTC
  const normalized = raw.trim().endsWith('Z') ? raw.trim() : `${raw.trim()}Z`;
  const date = new Date(normalized);

  if (isNaN(date.getTime())) return null;
  return date;
}

// ─── Row Validator ────────────────────────────────────────────────────────────

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  parsed: {
    timestamp?: Date;
    type?: string;
    asset?: string;
    assetRaw?: string;
    quantity?: number;
    priceUsd?: number;
    fee?: number;
  };
}

function validateRow(row: Record<string, string>): ValidationResult {
  const errors: string[] = [];
  const parsed: ValidationResult['parsed'] = {};

  // ── Timestamp ──
  const tsRaw = row['timestamp']?.trim() ?? '';
  const timestamp = parseTimestamp(tsRaw);
  if (!tsRaw) {
    errors.push('Missing timestamp');
  } else if (!timestamp) {
    errors.push(`Malformed timestamp: "${tsRaw}"`);
  } else {
    parsed.timestamp = timestamp;
  }

  // ── Type ──
  const typeRaw = row['type']?.trim().toUpperCase();
  if (!typeRaw) {
    errors.push('Missing transaction type');
  } else if (!VALID_TYPES.includes(typeRaw as any)) {
    errors.push(`Invalid transaction type: "${typeRaw}"`);
  } else {
    parsed.type = typeRaw;
  }

  // ── Asset ──
  const assetRaw = row['asset']?.trim();
  if (!assetRaw) {
    errors.push('Missing asset');
  } else {
    parsed.assetRaw = assetRaw;
    parsed.asset = normalizeAsset(assetRaw);
  }

  // ── Quantity ──
  const quantityRaw = row['quantity']?.trim();
  if (!quantityRaw && quantityRaw !== '0') {
    errors.push('Missing quantity');
  } else {
    const qty = parseFloat(quantityRaw);
    if (isNaN(qty)) {
      errors.push(`Non-numeric quantity: "${quantityRaw}"`);
    } else if (qty < 0) {
      errors.push(`Negative quantity: ${qty}`);
    } else {
      parsed.quantity = qty;
    }
  }

  // ── Price USD (optional for TRANSFER rows) ──
  const priceRaw = row['price_usd']?.trim();
  if (priceRaw) {
    const price = parseFloat(priceRaw);
    if (!isNaN(price)) parsed.priceUsd = price;
  }

  // ── Fee (optional) ──
  const feeRaw = row['fee']?.trim();
  if (feeRaw) {
    const fee = parseFloat(feeRaw);
    if (!isNaN(fee)) parsed.fee = fee;
  }

  return {
    isValid: errors.length === 0,
    errors,
    parsed,
  };
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

export interface IngestionResult {
  source: TransactionSource;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateIds: string[];
  documents: IRawTransaction[];
}

/**
 * Parse CSV buffer and produce validated RawTransaction documents.
 * Uses streaming to avoid memory pressure on large files.
 *
 * Key decisions:
 * - Deduplication: Duplicate transaction IDs are flagged but ALL instances stored.
 *   The matching engine uses `usedIds` sets to prevent double-reconciliation.
 * - Bad rows: Never silently dropped — always stored with INVALID status + reasons.
 */
export async function ingestCSV(
  buffer: Buffer,
  source: TransactionSource,
  ingestionId: string
): Promise<IngestionResult> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    const stream = Readable.from(buffer);

    stream
      .pipe(csv())
      .on('data', (row: Record<string, string>) => rows.push(row))
      .on('error', reject)
      .on('end', async () => {
        const seenIds = new Map<string, number>();
        const duplicateIds: string[] = [];
        const documents: IRawTransaction[] = [];

        let validCount = 0;
        let invalidCount = 0;

        for (const row of rows) {
          const txId = row['transaction_id']?.trim() ?? '';

          // Track duplicate IDs
          const prevCount = seenIds.get(txId) ?? 0;
          seenIds.set(txId, prevCount + 1);
          if (prevCount > 0 && !duplicateIds.includes(txId)) {
            duplicateIds.push(txId);
            logger.warn({ txId, source }, 'Duplicate transaction ID detected');
          }

          const { isValid, errors, parsed } = validateRow(row);

          if (!isValid) invalidCount++;
          else validCount++;

          const doc = new RawTransaction({
            transactionId: txId || `MISSING_ID_${Date.now()}_${Math.random()}`,
            source,
            runIngestionId: ingestionId,
            raw: {
              transactionId: row['transaction_id'] ?? '',
              timestamp: row['timestamp'] ?? '',
              type: row['type'] ?? '',
              asset: row['asset'] ?? '',
              quantity: row['quantity'] ?? '',
              price_usd: row['price_usd'] ?? '',
              fee: row['fee'] ?? '',
              note: row['note'] ?? '',
            },
            timestamp: parsed.timestamp,
            type: parsed.type,
            asset: parsed.asset,
            assetRaw: parsed.assetRaw,
            quantity: parsed.quantity,
            priceUsd: parsed.priceUsd,
            fee: parsed.fee,
            note: row['note']?.trim() ?? '',
            validationStatus: isValid ? 'VALID' : 'INVALID',
            validationErrors: errors,
          });

          documents.push(doc);
        }

        try {
          if (documents.length > 0) {
            await RawTransaction.insertMany(documents, { ordered: false });
          }
          logger.info(
            { source, total: rows.length, valid: validCount, invalid: invalidCount },
            'CSV ingestion complete'
          );
        } catch (err) {
          logger.error({ err }, 'Failed to persist raw transactions');
          throw err;
        }

        resolve({
          source,
          totalRows: rows.length,
          validRows: validCount,
          invalidRows: invalidCount,
          duplicateIds,
          documents,
        });
      });
  });
}
import {
  IReconciliationDetail,
  ITransactionSnapshot,
  MatchCategory,
  ReconciliationDetail,
} from '../models/ReconciliationRun';
import { IRawTransaction } from '../models/RawTransaction';
import { areTypesCompatible } from '../utils/assetNormalizer';
import { logger } from '../utils/logger';

export interface MatchingConfig {
  timestampToleranceSeconds: number;
  quantityTolerancePct: number;
}

export interface MatchingSummary {
  matched: number;
  conflicting: number;
  unmatchedUser: number;
  unmatchedExchange: number;
  invalidUser: number;
  invalidExchange: number;
}

function toSnapshot(tx: IRawTransaction): ITransactionSnapshot {
  return {
    transactionId: tx.transactionId,
    timestamp: tx.timestamp?.toISOString(),
    type: tx.type,
    asset: tx.asset,
    assetRaw: tx.assetRaw,
    quantity: tx.quantity,
    priceUsd: tx.priceUsd,
    fee: tx.fee,
    note: tx.note,
  };
}

function getTimestampDelta(a: IRawTransaction, b: IRawTransaction): number {
  if (!a.timestamp || !b.timestamp) return Infinity;
  return Math.abs(a.timestamp.getTime() - b.timestamp.getTime()) / 1000;
}

function getQuantityDelta(a: IRawTransaction, b: IRawTransaction): number {
  if (a.quantity === undefined || b.quantity === undefined) return Infinity;
  return Math.abs(a.quantity - b.quantity);
}

function getQuantityDeltaPct(a: IRawTransaction, b: IRawTransaction): number {
  if (a.quantity === undefined || b.quantity === undefined) return Infinity;
  if (a.quantity === 0 && b.quantity === 0) return 0;
  const base = Math.max(Math.abs(a.quantity), Math.abs(b.quantity));
  return (Math.abs(a.quantity - b.quantity) / base) * 100;
}

function getGroupKey(tx: IRawTransaction): string {
  const asset = tx.asset ?? 'UNKNOWN';
  const type =
    tx.type === 'TRANSFER_IN' || tx.type === 'TRANSFER_OUT'
      ? 'TRANSFER'
      : (tx.type ?? 'UNKNOWN');
  return `${asset}__${type}`;
}

export async function runMatchingEngine(
  runId: string,
  ingestionId: string,
  config: MatchingConfig,
  allUserDocs: IRawTransaction[],
  allExchangeDocs: IRawTransaction[]
): Promise<MatchingSummary> {
  const { timestampToleranceSeconds, quantityTolerancePct } = config;
  const timestampToleranceMs = timestampToleranceSeconds * 1000;

  logger.info({ runId, ingestionId, config }, 'Starting matching engine');

  // Use documents passed directly from ingestion
  // This avoids MongoDB read-after-write timing issues with mongo:4.4
  const userTxs = allUserDocs.filter(tx => tx.validationStatus === 'VALID');
  const exchangeTxs = allExchangeDocs.filter(tx => tx.validationStatus === 'VALID');
  const invalidUserCount = allUserDocs.filter(tx => tx.validationStatus === 'INVALID').length;
  const invalidExchangeCount = allExchangeDocs.filter(tx => tx.validationStatus === 'INVALID').length;

  logger.info(
    { userValid: userTxs.length, exchangeValid: exchangeTxs.length },
    'Loaded valid transactions'
  );

  // Deduplicate user transactions — keep first occurrence only
  const seenUserIds = new Set<string>();
  const dedupedUserTxs: IRawTransaction[] = [];
  for (const tx of userTxs) {
    if (!seenUserIds.has(tx.transactionId)) {
      seenUserIds.add(tx.transactionId);
      dedupedUserTxs.push(tx);
    } else {
      logger.warn(
        { transactionId: tx.transactionId },
        'Skipping duplicate user transaction in matching'
      );
    }
  }

  // Group into buckets by asset + normalized type
  const userBuckets = new Map<string, IRawTransaction[]>();
  const exchangeBuckets = new Map<string, IRawTransaction[]>();

  for (const tx of dedupedUserTxs) {
    const key = getGroupKey(tx);
    if (!userBuckets.has(key)) userBuckets.set(key, []);
    userBuckets.get(key)!.push(tx);
  }

  for (const tx of exchangeTxs) {
    const key = getGroupKey(tx);
    if (!exchangeBuckets.has(key)) exchangeBuckets.set(key, []);
    exchangeBuckets.get(key)!.push(tx);
  }

  // Sort each bucket by timestamp
  const sortByTimestamp = (a: IRawTransaction, b: IRawTransaction) => {
    const ta = a.timestamp?.getTime() ?? 0;
    const tb = b.timestamp?.getTime() ?? 0;
    return ta - tb;
  };

  for (const bucket of userBuckets.values()) bucket.sort(sortByTimestamp);
  for (const bucket of exchangeBuckets.values()) bucket.sort(sortByTimestamp);

  // Two-pointer matching
  const details: Partial<IReconciliationDetail>[] = [];
  const matchedUserIds = new Set<string>();
  const matchedExchangeIds = new Set<string>();
  const allBucketKeys = new Set([...userBuckets.keys(), ...exchangeBuckets.keys()]);

  for (const key of allBucketKeys) {
    const userGroup = userBuckets.get(key) ?? [];
    const exchangeGroup = exchangeBuckets.get(key) ?? [];
    if (userGroup.length === 0 || exchangeGroup.length === 0) continue;

    let ePtr = 0;

    for (const userTx of userGroup) {
      if (matchedUserIds.has(userTx.transactionId)) continue;
      if (!userTx.timestamp) continue;

      const userTime = userTx.timestamp.getTime();

      while (
        ePtr < exchangeGroup.length &&
        exchangeGroup[ePtr].timestamp &&
        exchangeGroup[ePtr].timestamp!.getTime() < userTime - timestampToleranceMs
      ) {
        ePtr++;
      }

      const candidates: IRawTransaction[] = [];
      let scanPtr = ePtr;
      while (
        scanPtr < exchangeGroup.length &&
        exchangeGroup[scanPtr].timestamp &&
        exchangeGroup[scanPtr].timestamp!.getTime() <= userTime + timestampToleranceMs
      ) {
        const exc = exchangeGroup[scanPtr];
        if (
          !matchedExchangeIds.has(exc.transactionId) &&
          areTypesCompatible(userTx.type ?? '', exc.type ?? '')
        ) {
          candidates.push(exc);
        }
        scanPtr++;
      }

      if (candidates.length === 0) continue;

      candidates.sort((a, b) => getQuantityDelta(userTx, a) - getQuantityDelta(userTx, b));
      const best = candidates[0];

      const tsDelta = getTimestampDelta(userTx, best);
      const qtyDelta = getQuantityDelta(userTx, best);
      const qtyDeltaPct = getQuantityDeltaPct(userTx, best);

      const withinQuantityTolerance = qtyDeltaPct <= quantityTolerancePct;
      const withinTimestampTolerance = tsDelta <= timestampToleranceSeconds;

      let category: MatchCategory;
      let reason: string;

      if (withinTimestampTolerance && withinQuantityTolerance) {
        category = 'MATCHED';
        reason =
          tsDelta === 0 && qtyDelta === 0
            ? 'Exact match on timestamp, asset, type, and quantity'
            : `Match within tolerances — ΔT: ${tsDelta.toFixed(0)}s, ΔQty: ${qtyDeltaPct.toFixed(4)}%`;
      } else {
        category = 'CONFLICTING';
        const reasons: string[] = [];
        if (!withinTimestampTolerance) {
          reasons.push(`Timestamp delta ${tsDelta.toFixed(0)}s exceeds ${timestampToleranceSeconds}s tolerance`);
        }
        if (!withinQuantityTolerance) {
          reasons.push(`Quantity discrepancy of ${qtyDelta.toFixed(8)} ${best.asset} (${qtyDeltaPct.toFixed(4)}%) exceeds ${quantityTolerancePct}% tolerance`);
        }
        reason = reasons.join('; ');
      }

      matchedUserIds.add(userTx.transactionId);
      matchedExchangeIds.add(best.transactionId);

      details.push({
        runId,
        category,
        reason,
        variances: {
          timestampDeltaSeconds: tsDelta,
          quantityDelta: qtyDelta,
          quantityDeltaPct: qtyDeltaPct,
        },
        userTransaction: toSnapshot(userTx),
        exchangeTransaction: toSnapshot(best),
      });
    }
  }

  // Unmatched User
  for (const tx of dedupedUserTxs) {
    if (!matchedUserIds.has(tx.transactionId)) {
      details.push({
        runId,
        category: 'UNMATCHED_USER',
        reason: 'No matching exchange transaction found within tolerance window',
        userTransaction: toSnapshot(tx),
      });
    }
  }

  // Unmatched Exchange
  for (const tx of exchangeTxs) {
    if (!matchedExchangeIds.has(tx.transactionId)) {
      details.push({
        runId,
        category: 'UNMATCHED_EXCHANGE',
        reason: 'No matching user transaction found within tolerance window',
        exchangeTransaction: toSnapshot(tx),
      });
    }
  }

  if (details.length > 0) {
    await ReconciliationDetail.insertMany(details);
  }

  const matched = details.filter((d) => d.category === 'MATCHED').length;
  const conflicting = details.filter((d) => d.category === 'CONFLICTING').length;
  const unmatchedUser = details.filter((d) => d.category === 'UNMATCHED_USER').length;
  const unmatchedExchange = details.filter((d) => d.category === 'UNMATCHED_EXCHANGE').length;

  logger.info(
    { runId, matched, conflicting, unmatchedUser, unmatchedExchange },
    'Matching engine complete'
  );

  return {
    matched,
    conflicting,
    unmatchedUser,
    unmatchedExchange,
    invalidUser: invalidUserCount,
    invalidExchange: invalidExchangeCount,
  };
}
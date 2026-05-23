import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { ReconciliationDetail, ReconciliationRun } from '../models/ReconciliationRun';
import { RawTransaction } from '../models/RawTransaction';
import { generateCSV } from '../services/exportService';
import { ingestCSV } from '../services/ingestionService';
import { runMatchingEngine } from '../services/matchingService';
import { config } from '../config';
import { logger } from '../utils/logger';

// ─── Schema ───────────────────────────────────────────────────────────────────

const ReconcileConfigSchema = z.object({
  timestampToleranceSeconds: z.coerce
    .number()
    .min(1)
    .max(86400)
    .optional(),
  quantityTolerancePct: z.coerce.number().min(0).max(100).optional(),
});

// ─── POST /reconcile ──────────────────────────────────────────────────────────

export async function triggerReconciliation(req: Request, res: Response): Promise<void> {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  const userFile = files?.['userFile']?.[0];
  const exchangeFile = files?.['exchangeFile']?.[0];

  if (!userFile || !exchangeFile) {
    res.status(400).json({
      error: 'Both userFile and exchangeFile must be provided',
    });
    return;
  }

  const configParse = ReconcileConfigSchema.safeParse(req.body);
  if (!configParse.success) {
    res.status(400).json({ error: 'Invalid config parameters', details: configParse.error.format() });
    return;
  }

  const runConfig = {
    timestampToleranceSeconds:
      configParse.data.timestampToleranceSeconds ?? config.TIMESTAMP_TOLERANCE_SECONDS,
    quantityTolerancePct:
      configParse.data.quantityTolerancePct ?? config.QUANTITY_TOLERANCE_PCT,
  };

  const runId = uuidv4();
  const ingestionId = uuidv4();

  // Create run record
  const run = await ReconciliationRun.create({
    runId,
    status: 'RUNNING',
    config: runConfig,
    startedAt: new Date(),
  });

  // Respond immediately with runId
  res.status(202).json({
    runId,
    message: 'Reconciliation started',
    config: runConfig,
  });

  // Run async (fire-and-forget after response)
  (async () => {
    try {
      logger.info({ runId }, 'Ingesting CSV files');

      const [userResult, exchangeResult] = await Promise.all([
        ingestCSV(userFile.buffer, 'USER', ingestionId),
        ingestCSV(exchangeFile.buffer, 'EXCHANGE', ingestionId),
      ]);

      logger.info({ runId, userResult, exchangeResult }, 'Ingestion complete, running matcher');

      const summary = await runMatchingEngine(runId, ingestionId, runConfig, userResult.documents, exchangeResult.documents);

      await ReconciliationRun.findOneAndUpdate(
        { runId },
        {
          status: 'COMPLETED',
          completedAt: new Date(),
          summary: {
            totalUser: userResult.totalRows,
            totalExchange: exchangeResult.totalRows,
            matched: summary.matched,
            conflicting: summary.conflicting,
            unmatchedUser: summary.unmatchedUser,
            unmatchedExchange: summary.unmatchedExchange,
            invalidUser: userResult.invalidRows,
            invalidExchange: exchangeResult.invalidRows,
          },
        }
      );

      logger.info({ runId }, 'Reconciliation run completed');
    } catch (err) {
      logger.error({ err, runId }, 'Reconciliation run failed');
      await ReconciliationRun.findOneAndUpdate(
        { runId },
        { status: 'FAILED', error: String(err), completedAt: new Date() }
      );
    }
  })();
}

// ─── GET /report/:runId ───────────────────────────────────────────────────────

export async function getReport(req: Request, res: Response): Promise<void> {
  const { runId } = req.params;
  const { format, category, page = '1', limit = '50' } = req.query;

  const run = await ReconciliationRun.findOne({ runId });
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  const filter: Record<string, unknown> = { runId };
  if (category) filter.category = category;

  const pageNum = Math.max(1, parseInt(String(page)));
  const limitNum = Math.min(500, Math.max(1, parseInt(String(limit))));

  if (format === 'csv') {
    const details = await ReconciliationDetail.find(filter).lean();
    const csv = generateCSV(details as any);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="recon_report_${runId}.csv"`);
    res.send(csv);
    return;
  }

  const [details, total] = await Promise.all([
    ReconciliationDetail.find(filter)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    ReconciliationDetail.countDocuments(filter),
  ]);

  res.json({
    run,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
    details,
  });
}

// ─── GET /report/:runId/summary ───────────────────────────────────────────────

export async function getReportSummary(req: Request, res: Response): Promise<void> {
  const { runId } = req.params;

  const run = await ReconciliationRun.findOne({ runId });
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  // Also get invalid rows detail
  const invalidRows = await RawTransaction.find({ validationStatus: 'INVALID' })
    .select('transactionId source validationErrors raw')
    .lean();

  res.json({
    runId,
    status: run.status,
    config: run.config,
    summary: run.summary,
    invalidRows,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  });
}

// ─── GET /report/:runId/unmatched ─────────────────────────────────────────────

export async function getUnmatchedRows(req: Request, res: Response): Promise<void> {
  const { runId } = req.params;

  const run = await ReconciliationRun.findOne({ runId });
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  const unmatched = await ReconciliationDetail.find({
    runId,
    category: { $in: ['UNMATCHED_USER', 'UNMATCHED_EXCHANGE'] },
  }).lean();

  res.json({ runId, count: unmatched.length, rows: unmatched });
}

// ─── GET /runs ────────────────────────────────────────────────────────────────

export async function listRuns(req: Request, res: Response): Promise<void> {
  const runs = await ReconciliationRun.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  res.json({ runs });
}
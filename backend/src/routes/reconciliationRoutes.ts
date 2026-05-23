import { Router } from 'express';
import multer from 'multer';
import {
  getReport,
  getReportSummary,
  getUnmatchedRows,
  listRuns,
  triggerReconciliation,
} from '../controllers/reconciliationController';

const router = Router();

// Multer: memory storage, max 50MB per file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.endsWith('.csv') && file.mimetype !== 'text/csv') {
      cb(new Error('Only CSV files are accepted'));
      return;
    }
    cb(null, true);
  },
});

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /reconcile
 * Body: multipart/form-data with userFile and exchangeFile
 * Optional body params: timestampToleranceSeconds, quantityTolerancePct
 */
router.post(
  '/reconcile',
  upload.fields([
    { name: 'userFile', maxCount: 1 },
    { name: 'exchangeFile', maxCount: 1 },
  ]),
  triggerReconciliation
);

/**
 * GET /report/:runId
 * Query: ?format=csv, ?category=MATCHED|CONFLICTING|UNMATCHED_USER|UNMATCHED_EXCHANGE
 *        ?page=1&limit=50
 */
router.get('/report/:runId', getReport);

/**
 * GET /report/:runId/summary
 */
router.get('/report/:runId/summary', getReportSummary);

/**
 * GET /report/:runId/unmatched
 */
router.get('/report/:runId/unmatched', getUnmatchedRows);

/**
 * GET /runs
 */
router.get('/runs', listRuns);

export default router;
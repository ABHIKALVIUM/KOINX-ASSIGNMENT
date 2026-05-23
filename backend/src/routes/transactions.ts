// src/routes/transactions.ts
import { Router, Request, Response } from 'express';
import { RawTransaction } from '../models/RawTransaction';

const router = Router();

// GET /api/transactions — list transactions with filters
router.get('/', async (req: Request, res: Response) => {
  const {
    source,
    validationStatus,
    asset,
    type,
    page = '1',
    limit = '50',
  } = req.query;

  const filter: Record<string, unknown> = {};
  if (source) filter.source = source;
  if (validationStatus) filter.validationStatus = validationStatus;
  if (asset) filter.asset = asset;
  if (type) filter.type = type;

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  const [transactions, total] = await Promise.all([
    RawTransaction.find(filter).skip(skip).limit(limitNum).lean(),
    RawTransaction.countDocuments(filter),
  ]);

  res.status(200).json({
    total,
    page: pageNum,
    limit: limitNum,
    data: transactions,
  });
});

// GET /api/transactions/:transactionId — get a single transaction
router.get('/:transactionId', async (req: Request, res: Response) => {
  const { transactionId } = req.params;

  const tx = await RawTransaction.findOne({ transactionId }).lean();
  if (!tx) {
    res.status(404).json({ message: `Transaction ${transactionId} not found` });
    return;
  }

  res.status(200).json(tx);
});

// POST /api/transactions — create a raw transaction
router.post('/', async (req: Request, res: Response) => {
  const tx = await RawTransaction.create(req.body);
  res.status(201).json(tx);
});

// DELETE /api/transactions/:transactionId — delete a transaction
router.delete('/:transactionId', async (req: Request, res: Response) => {
  const { transactionId } = req.params;

  const deleted = await RawTransaction.findOneAndDelete({ transactionId });
  if (!deleted) {
    res.status(404).json({ message: `Transaction ${transactionId} not found` });
    return;
  }

  res.status(200).json({ message: 'Deleted successfully', transactionId });
});

export default router;
// src/routes/index.ts
import { Router } from 'express';
import reconciliationRoutes from './reconciliationRoutes';

const router = Router();

router.use('/', reconciliationRoutes);

export default router;
import 'express-async-errors';
import cors from 'cors';
import express from 'express';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes/index';
import { connectDatabase } from './utils/database';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  // ── Database ──
  await connectDatabase();

  // ── App ──
  const app = express();

  app.use(
    cors({
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), env: config.NODE_ENV });
  });

  // API routes
  app.use('/api', routes);

  // Error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  // ── Start ──
  app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      `🚀 Reconciliation Engine API running on port ${config.PORT}`
    );
  });

  // ── Graceful shutdown ──
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
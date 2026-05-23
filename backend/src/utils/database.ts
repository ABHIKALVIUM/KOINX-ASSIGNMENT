import mongoose from 'mongoose';
import { config } from '../../src/config';
import { logger } from '../utils/logger';

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info({ uri: config.MONGODB_URI }, '✅ MongoDB connected');
  } catch (err) {
    logger.fatal({ err }, '❌ MongoDB connection failed');
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB error');
  });
}
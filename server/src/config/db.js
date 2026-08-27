const mongoose = require('mongoose');
const env = require('./env');
const { logger } = require('./logger');

let mongod = null;

/**
 * Connects to MongoDB. In development, if the configured URI is unreachable,
 * falls back to an in-memory MongoDB so the platform can run without a local
 * database install. Production requires a real URI.
 */
const connectDB = async () => {
  mongoose.set('strictQuery', true);

  try {
    const conn = await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    if (env.NODE_ENV === 'production') {
      logger.error(`MongoDB connection failed: ${err.message}`);
      process.exit(1);
    }
    logger.warn('Configured MongoDB unreachable — starting in-memory instance (dev only, data is not persisted)');
  }

  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  const conn = await mongoose.connect(mongod.getUri());
  logger.info(`MongoDB (in-memory) connected: ${conn.connection.host}`);
  return conn;
};

const disconnectDB = async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
};

module.exports = { connectDB, disconnectDB };

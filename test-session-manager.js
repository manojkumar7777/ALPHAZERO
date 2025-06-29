// test-session-manager.js
require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('./logger');
const { User, TradingSession, Trade } = require('./models');
const {
  TradingSessionManager,
  RiskManager,
  TradingEngine,
  DerivAPIInteraction,
  MarketDataStream
} = require('./services');

async function main() {
  if (!process.env.MONGO_URI) {
    logger.error("MONGO_URI not found in .env file. Please ensure it's set.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('MongoDB connected for test script.');

    // Ensure models are loaded by Mongoose, this can sometimes help prevent MissingSchemaError
    // by explicitly referencing them if Mongoose hasn't picked them up from the initial connection.
    // This is more of a safeguard.
    logger.info(`User model: ${User ? 'Loaded' : 'Not Loaded'}`);
    logger.info(`TradingSession model: ${TradingSession ? 'Loaded' : 'Not Loaded'}`);
    logger.info(`Trade model: ${Trade ? 'Loaded' : 'Not Loaded'}`);


    const userId = new mongoose.Types.ObjectId(); // Dummy user ID
    logger.info(`Using dummy User ID: ${userId}`);

    // Instantiate services
    const riskManager = new RiskManager();
    const tradingEngineConfig = {
        // Add any specific config TradingEngine stub might expect
        analysisInterval: 5000 // Example
    };
    const tradingEngine = new TradingEngine(tradingEngineConfig);
    const derivAPI = new DerivAPIInteraction();
    // MarketDataStream will use DERIV_APP_ID from .env if available for its dummy URL
    const marketDataStream = new MarketDataStream('R_100');

    const sessionManagerConfig = {
      initialBalance: 10000,
      symbol: 'R_100', // Make sure this matches MarketDataStream symbol if hardcoded there
      daily_loss_limit_percentage: 0.10, // 10% for testing
      max_consecutive_losses: 3,       // Stop after 3 consecutive losses for testing
      base_lot_size: 1.0,              // From previous version, ensure TradingEngine uses this or similar as baseStake
      baseStake: 10,                   // For Martingale and TradingEngine's analysis.amount
      martingaleEnabled: true,
      martingaleMultiplier: 2,
      max_concurrent_trades: 3,        // Test with a limit lower than default 5
      tradeTimeout: 3000               // ms for trade execution via DerivAPI stub
    };

    // Update TradingEngine config to use baseStake
    tradingEngine.config.baseStake = sessionManagerConfig.baseStake;


    const sessionManager = new TradingSessionManager(
      userId,
      sessionManagerConfig, // Pass the detailed config
      riskManager,
      tradingEngine,
      derivAPI,
      marketDataStream // This is already instantiated
    );

    logger.info('Starting session via TradingSessionManager with config:', sessionManagerConfig);
    // await sessionManager.start(); // Original call
    await sessionManager.startSession(); // Updated method name from TSM refactor

    if (!sessionManager.isActive) {
        logger.error("Session manager did not become active. Exiting.");
        await mongoose.disconnect();
        process.exit(1);
    }

    logger.info(`TradingSessionManager isActive: ${sessionManager.isActive}. Session ID: ${sessionManager.session?._id}`);
    logger.info('Session started. Simulating market activity for 20 seconds to observe queue and Martingale...');

    // Let it run for a bit to simulate ticks and potential trades
    // MarketDataStream emits ticks every 2 seconds.
    // 20 seconds should allow for ~10 ticks.
    const testDuration = 20000;
    setTimeout(async () => {
      logger.info(`${testDuration/1000} seconds passed. Stopping session via TradingSessionManager...`);
      await sessionManager.stopSession('test_duration_elapsed'); // Updated method name
      logger.info('Session stop requested.');

      // Add a small delay to allow async operations in stop() to complete if any
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay for queue processing

      logger.info(`TradingSessionManager isActive after stop: ${sessionManager.isActive}`);
      if (sessionManager.session) {
          logger.info(`Final session status: ${sessionManager.session.status}, Final Balance: ${sessionManager.session.final_balance}, Total Trades: ${sessionManager.session.total_trades}, Wins: ${sessionManager.session.winning_trades}`);
          // Query and log some trades from this session for verification
          const tradesInDb = await Trade.find({ session_id: sessionManager.session._id }).sort({ createdAt: -1 }).limit(10);
          logger.info(`Last ${tradesInDb.length} trades for session ${sessionManager.session._id}:`);
          tradesInDb.forEach(trade => {
              logger.info(`  Trade ID: ${trade.trade_id}, Stake: ${trade.stake}, Result: ${trade.result}, Payout: ${trade.payout}, Confidence: ${trade.confidence_score}`);
          });

      } else {
          logger.warn("Session object was null after stop.");
      }

      await mongoose.disconnect();
      logger.info('MongoDB disconnected.');
      logger.info("Test script finished.");
      process.exit(0);
    }, testDuration);

  } catch (error) {
    logger.error('Test script encountered an error:', error);
    try {
      await mongoose.disconnect();
      logger.info('MongoDB disconnected due to error.');
    } catch (disconnectError) {
      logger.error('Error disconnecting MongoDB after script error:', disconnectError);
    }
    process.exit(1);
  }
}

main();

// Listen for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Application specific logging, throwing an error, or other logic here
  process.exit(1); // It's generally recommended to exit on uncaught exceptions
});

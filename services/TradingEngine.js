// services/TradingEngine.js
const logger = require('../logger');

class TradingEngine {
  constructor(config) {
    this.config = config; // Config might include baseStake, analysis parameters etc.
    logger.info(`TradingEngine initialized with config: ${JSON.stringify(config)}`);
  }

  start() {
    logger.info('TradingEngine started.');
    // Initialize any internal state or connect to analysis services
  }

  stop() {
    logger.info('TradingEngine stopped.');
    // Clean up resources
  }

  analyze(tickData) {
    // Stub: Simulate market analysis and return a more detailed analysis object
    // This now acts as the "MarketAnalyzer"
    const baseAmount = this.config?.baseStake || 10; // Use baseStake from config or default
    const analysis = {
      direction: Math.random() > 0.5 ? 'call' : 'put',
      amount: baseAmount, // Base amount for the trade, Martingale will adjust this later if applied
      duration: 60, // Example duration in seconds
      confidence: parseFloat(Math.random().toFixed(2)),
      trend: parseFloat((Math.random() * 2 - 1).toFixed(2)), // e.g., -1 to 1
      volatility: parseFloat(Math.random().toFixed(2)), // e.g., 0 to 1
      // sentiment: parseFloat((Math.random() * 2 - 1).toFixed(2)) // Optional
    };
    logger.info(`TradingEngine (MarketAnalyzer): Analyzed tick data ${JSON.stringify(tickData)}, generated analysis: ${JSON.stringify(analysis)}`);
    return analysis; // Returns analysis, not just a signal
  }

  applyMartingaleStrategy(lastTradeFailed, currentConsecutiveLosses, baseStake, martingaleMultiplier = 2) {
    if (typeof baseStake !== 'number' || baseStake <= 0) {
        logger.error(`TradingEngine: Invalid baseStake for Martingale: ${baseStake}. Returning baseStake.`);
        return baseStake || 1; // Fallback to 1 if baseStake is totally invalid
    }
    if (lastTradeFailed) {
      const newStake = baseStake * Math.pow(martingaleMultiplier, currentConsecutiveLosses);
      logger.info(`TradingEngine: Martingale applied. Last trade failed. Consecutive losses: ${currentConsecutiveLosses}. New stake: ${newStake} (Base: ${baseStake})`);
      return newStake;
    } else {
      // If last trade was not a failure (e.g., win or first trade), reset to base stake.
      // Consecutive losses should be 0 if last trade was a win, handled by TradingSessionManager.
      logger.info(`TradingEngine: Martingale - Last trade successful or first trade. Stake remains base: ${baseStake}`);
      return baseStake;
    }
  }

  async closeAllPositions() {
    // Stub: Simulate closing positions
    logger.info('TradingEngine: Closing all open positions...');
    // In a real implementation, this would interact with the DerivAPIInteraction service
    return Promise.resolve();
  }
}

module.exports = TradingEngine;

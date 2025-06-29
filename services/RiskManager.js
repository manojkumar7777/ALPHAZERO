// services/RiskManager.js
const logger = require('../logger'); // Assuming logger.js is at root

class RiskManager {
  constructor() {
    logger.info('RiskManager initialized');
  }

  approveTrade(session, analysis) { // session is the Mongoose doc, analysis contains trade details
    // Basic check: ensure stake is not more than current balance
    if (!session || !analysis || typeof analysis.amount !== 'number') {
        logger.warn('RiskManager: Invalid data for approveTrade. Session or analysis missing or analysis.amount invalid.');
        return false;
    }
    if (analysis.amount <= 0) {
        logger.warn(`RiskManager: Trade amount must be positive. Amount: ${analysis.amount}. Trade not approved.`);
        return false;
    }
    if (analysis.amount > session.final_balance) {
      logger.warn(`RiskManager: Trade amount ${analysis.amount} exceeds session balance ${session.final_balance}. Trade not approved.`);
      return false;
    }
    // Add more checks, e.g., max exposure, specific symbol risks, etc.
    logger.info(`RiskManager: Approving trade. Amount: ${analysis.amount}, Balance: ${session.final_balance}. Analysis: ${JSON.stringify(analysis)}`);
    return true;
  }

  checkSessionLimits(currentSessionState) {
    // currentSessionState contains live session data and config for limits
    // e.g., currentSessionState = { _id, initial_balance, final_balance, consecutive_losses, config: { max_consecutive_losses, daily_loss_limit_percentage } }
    if (!currentSessionState || !currentSessionState.config) {
        logger.warn('RiskManager: Invalid data for checkSessionLimits. currentSessionState or its config is missing.');
        return 'continue'; // Default to continue if data is incomplete to prevent unintended stops
    }

    const { final_balance, initial_balance, consecutive_losses, config } = currentSessionState;

    // Check max consecutive losses
    if (config.max_consecutive_losses && consecutive_losses >= config.max_consecutive_losses) {
      logger.warn(`RiskManager: Max consecutive losses limit reached for session ${currentSessionState._id}. Losses: ${consecutive_losses}, Limit: ${config.max_consecutive_losses}. Advising STOP.`);
      return 'stop';
    }

    // Check daily loss limit (as a percentage of initial balance)
    if (config.daily_loss_limit_percentage) {
      const maxLossAllowed = initial_balance * config.daily_loss_limit_percentage;
      const currentLoss = initial_balance - final_balance;
      if (currentLoss >= maxLossAllowed) {
        logger.warn(`RiskManager: Daily loss limit reached for session ${currentSessionState._id}. Current Loss: ${currentLoss}, Max Loss Allowed: ${maxLossAllowed}. Advising STOP.`);
        return 'stop';
      }
    }

    // Add other checks: total session loss absolute, min balance, max trades per hour etc.
    logger.debug(`RiskManager: Session limits check passed for session ${currentSessionState._id}.`);
    return 'continue';
  }
}

module.exports = RiskManager;

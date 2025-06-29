// services/TradingSessionManager.js
const mongoose = require('mongoose'); // For ObjectId if needed, and for interacting with models
const { TradingSession, Trade } = require('../models'); // Assuming models are in ../models
const logger = require('../logger'); // Assuming logger.js is at the root

class TradingSessionManager {
  constructor(userId, config, riskManager, tradingEngine, derivAPI, marketDataStream) {
    this.userId = userId;
    this.config = config; // e.g., { initialBalance, symbol, daily_loss_limit, max_consecutive_losses }
    this.riskManager = riskManager;
    this.tradingEngine = tradingEngine;
    this.derivAPI = derivAPI;
    this.marketDataStream = marketDataStream;

    this.session = null; // Stores the Mongoose TradingSession document
    this.isActive = false;
    this.tradeQueue = [];
    this.currentTrades = 0;
    this.MAX_CONCURRENT_TRADES = config.max_concurrent_trades || 5; // From config or default
    this.lastTradeFailed = false; // For Martingale

    logger.info(`TradingSessionManager initialized for user: ${this.userId}, symbol: ${this.config.symbol}, MAX_CONCURRENT_TRADES: ${this.MAX_CONCURRENT_TRADES}`);
  }

  connectMarketData(symbol) {
    if (!symbol) {
        logger.error("TradingSessionManager: Market symbol is undefined. Cannot connect market data.");
        throw new Error("Market symbol is required to connect market data.");
    }
    this.marketDataStream = new MarketDataStream(symbol); // Assuming MarketDataStream is passed or constructed here

    this.marketDataStream.on('tick', (tickData) => {
      if (this.isActive) {
        this.handleTick(tickData); // Ensure this.handleTick is bound or an arrow function if it uses `this` directly from event
      }
    });

    this.marketDataStream.on('reconnect', (attempt) => {
      logger.warn(`MarketDataStream: Reconnect attempt ${attempt} for session ${this.session?._id}`);
    });

    this.marketDataStream.on('error', (error) => {
      logger.error(`MarketDataStream error for session ${this.session?._id}: ${error.message}`);
      this.stopSession('market_data_error'); // As per plan
    });

    this.marketDataStream.connect();
    logger.info(`TradingSessionManager: MarketDataStream connected and listeners set up for symbol ${symbol}.`);
  }

  async startSession() { // Config is now part of this.config via constructor
    if (this.isActive) {
      logger.warn(`TradingSessionManager: Session already active for user ${this.userId}. Cannot start new one.`);
      return;
    }

    logger.info(`TradingSessionManager: Starting session for user ${this.userId}, symbol ${this.config.symbol}`);

    const mongoDbSession = await mongoose.startSession();
    try {
      await mongoDbSession.withTransaction(async () => {
        this.session = new TradingSession({
          user_id: this.userId,
          initial_balance: this.config.initialBalance,
          final_balance: this.config.initialBalance,
          market_symbol: this.config.symbol,
          status: 'active',
          lot_size: this.config.base_lot_size || 1.0,
          consecutive_losses: 0, // Initialize consecutive_losses
          // Store parts of config if they are relevant for querying or history
          // config_details: { martingaleEnabled: this.config.martingaleEnabled, baseStake: this.config.baseStake }
        });
        await this.session.save({ session: mongoDbSession });
        logger.info(`TradingSessionManager: Session document created with ID: ${this.session._id} within transaction.`);

        this.tradingEngine.start(); // Pass session specific config if TradingEngine needs it
        // If tradingEngine.start() involves DB operations that need to be part of the transaction,
        // ensure it accepts and uses the mongoDbSession.
      });

      // Connect to market data after transaction is successful
      this.connectMarketData(this.config.symbol);

      this.isActive = true;
      logger.info(`TradingSessionManager: Session ${this.session._id} started successfully for user ${this.userId}.`);

    } catch (error) {
      logger.error(`TradingSessionManager: Error starting session for user ${this.userId}: ${error.message}`, error);
      this.isActive = false;
      if (this.session && !this.session._id) {
        this.session = null;
      }
      // Abort transaction is handled by withTransaction, but session needs cleanup
      if (mongoDbSession.inTransaction()) {
        await mongoDbSession.abortTransaction();
        logger.info("Transaction aborted due to error in startSession.");
      }
    } finally {
      mongoDbSession.endSession();
    }
  }

  async closeOpenTrades() {
    // Stub: In a real system, this would iterate over open positions and close them via DerivAPIInteraction
    logger.info(`TradingSessionManager: Simulating closing all open trades for session ${this.session?._id}. UserID: ${this.userId}`);
    // Example: await this.derivAPI.closeAllSessionTrades(this.session._id);
    return Promise.resolve();
  }

  async calculateFinalBalance() {
    // Stub: In a real system, this might involve fetching the latest balance from Deriv
    // or relying on the live final_balance maintained by updateSessionStats.
    // For now, it just returns the last known final_balance from the session object.
    if (this.session) {
      logger.info(`TradingSessionManager: Calculating final balance for session ${this.session._id}. Current recorded: ${this.session.final_balance}. UserID: ${this.userId}`);
      return this.session.final_balance;
    }
    logger.warn(`TradingSessionManager: calculateFinalBalance called without an active session object. UserID: ${this.userId}`);
    return this.config.initialBalance; // Fallback, should ideally not happen if session exists
  }

  generatePerformanceReport() {
    // Stub: In a real system, this would query trades for the session, calculate metrics,
    // and store/send a report.
    if (this.session) {
      logger.info(`TradingSessionManager: Simulating performance report generation for session ${this.session._id}. UserID: ${this.userId}`);
      logger.info(`PERFORMANCE_REPORT for Session ${this.session._id}: Total Trades: ${this.session.total_trades}, Wins: ${this.session.winning_trades}, P/L: ${this.session.final_balance - this.session.initial_balance}`);
    } else {
      logger.warn(`TradingSessionManager: generatePerformanceReport called without an active session object. UserID: ${this.userId}`);
    }
    // TODO: Implement actual performance report generation (e.g., PDF, email, DB record)
  }

  async stopSession(reason = 'user_request') {
    if (!this.isActive && this.session?.status !== 'active') { // Check if already stopping or stopped
      logger.warn(`TradingSessionManager: Session ${this.session?._id} for user ${this.userId} is already inactive or not in active state. Stop request ignored. Current status: ${this.session?.status}`);
      return;
    }

    const localIsActive = this.isActive; // Capture current state
    this.isActive = false; // Immediately mark as inactive to prevent new operations

    // Log emergency stop trigger point
    if (reason === 'emergency_system_shutdown') {
        logger.critical(`EMERGENCY_STOP_TRIGGER: Stopping session ${this.session?._id} due to system-wide emergency. UserID: ${this.userId}`);
    }

    logger.info(`TradingSessionManager: Stopping session ${this.session?._id} for user ${this.userId}. Reason: ${reason}. Was active: ${localIsActive}`);

    // Clear the trade queue to prevent processing further trades for this session
    if (this.tradeQueue.length > 0) {
        logger.info(`TradingSessionManager: Clearing ${this.tradeQueue.length} pending trades from queue for session ${this.session?._id}.`);
        this.tradeQueue = [];
    }

    try {
      // 1. Close all active trades (if any)
      // This should ideally wait for any currently executing trades to finish or be cancelled.
      // For now, we rely on currentTrades counter and the stubs.
      logger.info(`TradingSessionManager: Waiting for ${this.currentTrades} ongoing trades to complete before full stop of session ${this.session?._id}.`);
      // Simple wait loop - in a real system, might need more sophisticated handling
      let waitCycles = 0;
      while(this.currentTrades > 0 && waitCycles < 10) { // Max wait 5 seconds
          logger.debug(`TradingSessionManager: Waiting for trades to complete... ${this.currentTrades} remaining. Cycle: ${waitCycles + 1}`);
          await new Promise(resolve => setTimeout(resolve, 500));
          waitCycles++;
      }
      if (this.currentTrades > 0) {
          logger.warn(`TradingSessionManager: Timeout waiting for all trades to complete for session ${this.session?._id}. ${this.currentTrades} trades might still be in flight.`);
      }

      await this.closeOpenTrades(); // Stubbed: simulate closing positions on exchange

      // 2. Disconnect market data stream and stop trading engine
      if (this.marketDataStream) {
        this.marketDataStream.disconnect();
        this.marketDataStream.removeAllListeners('tick');
        this.marketDataStream.removeAllListeners('error');
        this.marketDataStream.removeAllListeners('reconnect'); // Clean up all listeners
        logger.info(`TradingSessionManager: MarketDataStream disconnected and listeners removed for session ${this.session?._id}.`);
      }
      if (this.tradingEngine) {
        this.tradingEngine.stop();
        logger.info(`TradingSessionManager: TradingEngine stopped for session ${this.session?._id}.`);
      }

      // 3. Update session document in DB
      if (this.session) {
        const finalBalance = await this.calculateFinalBalance(); // Calculate/fetch final balance

        let finalStatus = 'completed';
        if (reason === 'risk_limit_breach' || reason === 'market_data_error' || reason === 'emergency_system_shutdown') {
            finalStatus = 'stopped_auto'; // More specific status for auto-stops
        } else if (reason === 'user_request') {
            finalStatus = 'stopped_user';
        }

        const updatedSession = await TradingSession.findByIdAndUpdate(
          this.session._id,
          {
            session_end: new Date(),
            final_balance: finalBalance,
            status: finalStatus
          },
          { new: true } // Important to get the updated document back
        );

        if (updatedSession) {
          this.session = updatedSession; // Update in-memory session
          logger.info(`TradingSessionManager: Session ${this.session._id} final details saved. Final Balance: ${this.session.final_balance}, Status: ${this.session.status}.`);
        } else {
          logger.error(`TradingSessionManager: Failed to find and update session ${this.session._id} during stop procedure.`);
        }
      } else {
        logger.warn(`TradingSessionManager: No session document to update during stop for user ${this.userId}.`);
      }

      logger.info(`TradingSessionManager: Session ${this.session?._id} stopped successfully for user ${this.userId}.`);

      // 5. Generate performance report (after all DB updates)
      if (this.session) { // Ensure session exists before generating report
          this.generatePerformanceReport();
      }

    } catch (error) {
      logger.error(`TradingSessionManager: Error during stopSession for session ${this.session?._id}, UserID ${this.userId}: ${error.message}`, error);
      // The session is marked inactive, but underlying resources might not be fully released.
      // This state should be monitored.
    } finally {
        this.isActive = false; // Ensure isActive is false even if errors occur during stop
        logger.info(`TradingSessionManager: stopSession process fully completed for session ${this.session?._id}. isActive: ${this.isActive}`);
    }
  }

  async handleTick(tickData) {
    if (!this.isActive || !this.session) {
      return;
    }
    const processingStartTime = Date.now();
    console.time(`TradingSessionManager:handleTick:${this.session?._id}:${tickData.epoch || tickData.timestamp}`);
    logger.debug(`TradingSessionManager: Handling tick for session ${this.session._id}: ${JSON.stringify(tickData)}`);

    // The detailed risk checks and signal approval from the previous handleTick version
    // will now effectively be part of the executeTrade flow, initiated by processTradeQueue.
    // This keeps handleTick lean and focused on queueing based on incoming ticks.

    const analysis = this.tradingEngine.analyze(tickData); // Get analysis (potential signal)
    if (analysis) { // Only queue if analysis provides something actionable
        this.tradeQueue.push({
            timestamp: Date.now(),
            analysis, // This contains signal details, amount, direction etc.
            tickData // Original tick data for context if needed
        });
        logger.debug(`TradingSessionManager: Tick analysis added to queue. Queue size: ${this.tradeQueue.length}. Analysis: ${JSON.stringify(analysis)}`);
        this.processTradeQueue(); // Attempt to process the queue
    } else {
        logger.debug(`TradingSessionManager: No actionable analysis from tick for session ${this.session._id}.`);
    }
    console.timeEnd(`TradingSessionManager:handleTick:${this.session?._id}:${tickData.epoch || tickData.timestamp}`);
    // logger.debug(`TradingSessionManager: handleTick completed in ${Date.now() - processingStartTime}ms for session ${this.session._id}.`); // Already logged by timeEnd
  }

  async processTradeQueue() {
    const queueProcessingStartTime = Date.now();
    logger.info(`TradingSessionManager: Starting to process trade queue. Session: ${this.session?._id}. Queue size: ${this.tradeQueue.length}, Current trades: ${this.currentTrades}, Max concurrent: ${this.MAX_CONCURRENT_TRADES}`);
    console.time(`TradingSessionManager:processTradeQueueCycle:${this.session?._id}`);

    let tradesProcessedThisCycle = 0;
    while (this.tradeQueue.length > 0 && this.currentTrades < this.MAX_CONCURRENT_TRADES) {
      const tradeJob = this.tradeQueue.shift(); // Get the oldest job
      this.currentTrades++;
      tradesProcessedThisCycle++;
      logger.info(`TradingSessionManager: Dequeued trade job for analysis at ${tradeJob.timestamp}. Session: ${this.session?._id}. Current active trades: ${this.currentTrades}. Queue size remaining: ${this.tradeQueue.length}. Job: ${JSON.stringify(tradeJob.analysis)}`);

      // Execute trade. This is an async operation.
      // Each executeTrade call will run in the background.
      const tradeExecutionId = `executeTradeJob:${this.session?._id}:${tradeJob.timestamp}`;
      console.time(tradeExecutionId);
      this.executeTrade(tradeJob.analysis) // Pass analysis object which contains signal
        .then(() => {
            // Specific success logging is better inside executeTrade upon actual success.
            // This .then() here just confirms the async operation was initiated without an immediate synchronous error.
            logger.info(`TradingSessionManager: executeTrade for job ${tradeJob.timestamp} (Session: ${this.session?._id}) was initiated.`);
        })
        .catch(error => {
          // This catch is primarily for programming errors in how executeTrade is called or structured,
          // or if executeTrade itself throws an error that isn't caught internally.
          // Operational errors (API errors, DB errors within executeTrade) should ideally be caught and logged within executeTrade.
          logger.error(`TradingSessionManager: Unhandled error from executeTrade promise for job ${tradeJob.timestamp} (Session: ${this.session?._id}): ${error.message}`, { error, tradeJob });
        })
        .finally(() => {
          console.timeEnd(tradeExecutionId);
          this.currentTrades--;
          logger.info(`TradingSessionManager: A trade execution path completed (executeTrade promise resolved/rejected). Session: ${this.session?._id}. Current active trades: ${this.currentTrades}.`);
          // After a trade finishes (or its execution path concludes), try to process more items from the queue.
          if (this.tradeQueue.length > 0 && this.currentTrades < this.MAX_CONCURRENT_TRADES) {
            logger.debug(`TradingSessionManager: Triggering queue processing again after a trade finished. Session: ${this.session?._id}.`);
            this.processTradeQueue(); // Asynchronously trigger, do not await
          } else if (this.tradeQueue.length === 0 && this.currentTrades === 0) {
            logger.info(`TradingSessionManager: Trade queue is empty and no active trades. Queue processing idle. Session: ${this.session?._id}.`);
          }
        });
    }

    if (tradesProcessedThisCycle === 0 && this.tradeQueue.length > 0) {
      logger.info(`TradingSessionManager: Trade queue has ${this.tradeQueue.length} items, but max concurrent trades limit reached (${this.currentTrades}/${this.MAX_CONCURRENT_TRADES}). Will process later. Session: ${this.session?._id}.`);
    } else if (tradesProcessedThisCycle > 0) {
        logger.info(`TradingSessionManager: Processed ${tradesProcessedThisCycle} trade jobs this cycle. Session: ${this.session?._id}.`);
    }

    console.timeEnd(`TradingSessionManager:processTradeQueueCycle:${this.session?._id}`);
    // logger.info(`TradingSessionManager: Finished a cycle of processing trade queue. Session: ${this.session?._id}. Duration: ${Date.now() - queueProcessingStartTime}ms`); // Already logged by timeEnd
  }

  // Placeholder - In a real system, this might fetch from Deriv or be updated live
  async getCurrentBalance() {
    if (this.session) {
      // For simulation, we assume final_balance is being updated with each trade.
      // If not, this would be where you might call derivAPI.getAccountBalance()
      // or use the last known balance from this.session.final_balance.
      return this.session.final_balance;
    }
    return this.config.initialBalance; // Fallback or initial state
  }

  // This was part of the plan, but it's better integrated directly into handleTick
  // or called by RiskManager itself if it needs more direct control.
  // async checkRiskLimits() {
  //   if (!this.isActive || !this.session) return true;
  //   const action = this.riskManager.checkSessionLimits({
  //       id: this.session._id,
  //       initial_balance: this.session.initial_balance,
  //       current_balance: this.session.final_balance, // Assuming this is live
  //       // ... other relevant data
  //   });
  //   if (action === 'stop') {
  //     logger.warn(`TradingSessionManager: Risk limit breached for session ${this.session._id}. Stopping session.`);
  //     await this.stop('risk_breach');
  //     return false;
  //   }
  //   return true;
  // }

  async recordTrade(tradeResult, analysis, mongoDbClientSession = null) {
    if (!this.session) {
        logger.error(`TradingSessionManager: Cannot record trade, session is null. UserID: ${this.userId}`);
        // Potentially throw an error or handle more gracefully
        return;
    }
    const tradeData = {
      session_id: this.session._id, // Corrected from this.session.id to this.session._id
      user_id: this.userId,
      trade_id: tradeResult.trade_id || tradeResult.contract_id, // Use trade_id if available, else contract_id
      symbol: this.session.market_symbol, // Symbol from the session
      direction: analysis.direction, // Direction from analysis/signal
      stake: tradeResult.stake || analysis.amount, // Stake from tradeResult or analysis
      payout: tradeResult.payout,
      entry_time: new Date(tradeResult.entry_tick_time || Date.now()),
      exit_time: new Date(tradeResult.exit_tick_time || Date.now()), // May not be available immediately
      result: tradeResult.result || tradeResult.status, // 'win', 'loss', or other status
      confidence_score: analysis.confidence,
      market_analysis: { // From analysis object
        trend: analysis.trend,
        volatility: analysis.volatility,
        // sentiment: analysis.sentiment, // If available
        // duration: analysis.duration // if analysis provided this for the market, not trade
      },
      contract_details: { // From tradeResult
        contract_id: tradeResult.contract_id,
        contract_type: tradeResult.contract_type, // If available
        // duration: tradeResult.duration, // if available
        // duration_unit: tradeResult.duration_unit, // if available
        // basis: tradeResult.basis, // if available
        // currency: tradeResult.currency // if available
      }
    };

    try {
      // Use array form for create to ensure it works with sessions if provided
      const createdTrades = await Trade.create([tradeData], { session: mongoDbClientSession });
      logger.info(`TradingSessionManager: Trade record ${createdTrades[0]._id} saved for session ${this.session._id}.`);
      return createdTrades[0];
    } catch (dbError) {
      logger.error(`TradingSessionManager: DB Error recording trade for session ${this.session._id}: ${dbError.message}`, dbError);
      throw dbError; // Re-throw to be caught by executeTrade's catch block
    }
  }

  async executeTrade(analysis) { // analysis object now comes from tradeJob.analysis
    if (!this.isActive || !this.session) {
      logger.warn(`TradingSessionManager: executeTrade called but session is not active or session is null. UserID: ${this.userId}. Aborting.`);
      return; // Or throw error to be caught by processTradeQueue's individual catch
    }
    const executionStartTime = Date.now();
    const tradeExecutionDetailId = `executeTradeDetails:${this.session?._id}:${Date.now()}`;
    console.time(tradeExecutionDetailId);
    logger.info(`TradingSessionManager: Executing trade for session ${this.session._id} with analysis: ${JSON.stringify(analysis)}`);

    let currentStake = analysis.amount; // Default stake from analysis (which should be baseStake)
    if (this.config.martingaleEnabled) {
        const consecutiveLosses = this.session.consecutive_losses || 0;
        currentStake = this.tradingEngine.applyMartingaleStrategy(
            this.lastTradeFailed,
            consecutiveLosses,
            this.config.baseStake,
            this.config.martingaleMultiplier
        );
        logger.info(`TradingSessionManager: Martingale stake adjustment. Original stake: ${analysis.amount}, New stake: ${currentStake}. Last trade failed: ${this.lastTradeFailed}, Consecutive losses: ${consecutiveLosses}`);
    }

    // 1. Risk Check (moved from handleTick to here, per refined understanding)
    // This allows each trade to be individually risk-assessed just before execution.
    const tradeApprovalData = {
        signal: analysis, // The 'analysis' object is the signal
        current_balance: this.session.final_balance, // Use the live session balance
        // other relevant data like open positions count, total exposure etc.
    };
    if (!this.riskManager.approveTrade(this.session, analysis)) { // Pass whole session for context
      logger.warn(`TradingSessionManager: Trade not approved by RiskManager for session ${this.session._id}. Analysis: ${JSON.stringify(analysis)}`);
      return; // Do not proceed with this trade
    }
    logger.info(`TradingSessionManager: Trade approved by RiskManager for session ${this.session._id}.`);


    // Note: MongoDB transaction for executeTrade (including API call, recordTrade, updateSessionStats)
    // is complex because API calls are external. A common pattern is to make the API call,
    // then start a DB transaction for recordTrade and updateSessionStats.
    // If API call fails, no DB transaction. If API succeeds but DB fails, need compensation logic (e.g. manual review).
    // For now, recordTrade and updateSessionStats will be separate, but ideally atomic.

    let mongoDbTxSession;
    try {
      const tradeParams = {
        symbol: this.session.market_symbol,
        direction: analysis.direction,
        stake: currentStake, // Use the potentially Martingale-adjusted stake
        duration: analysis.duration, // From analysis/signal
        timeout: this.config.tradeTimeout || 2500, // Configurable timeout
      };

      const tradeResult = await this.derivAPI.executeTrade(tradeParams);
      logger.info(`TradingSessionManager: Trade executed via API for session ${this.session._id}. Result: ${JSON.stringify(tradeResult)}`);

      // Start DB transaction here for atomicity of trade recording and session update
      mongoDbTxSession = await mongoose.startSession();
      await mongoDbTxSession.withTransaction(async (activeDbSession) => {
        const tradeRecord = await this.recordTrade(tradeResult, analysis, activeDbSession);
        await this.updateSessionStats(tradeResult, activeDbSession); // Pass activeDbSession
      });

      logger.info(`TradingSessionManager: executeTrade completed in ${Date.now() - executionStartTime}ms for session ${this.session._id}.`);

    } catch (error) {
      logger.error(`TradingSessionManager: Error executing or recording trade for session ${this.session._id}: ${error.message}`, error);
      // If transaction was started but failed, it's handled by withTransaction's abort.
      // If error was before transaction (e.g. API error), no DB transaction to abort.
      // Consider specific error handling based on error type (e.g. API error vs DB error)
      // This error will be caught by processTradeQueue's catch block if not handled here.
      throw error; // Re-throw to ensure it's caught by the caller in processTradeQueue
    } finally {
        if (mongoDbTxSession) {
            mongoDbTxSession.endSession();
        }
    }
  }

  async updateSessionStats(tradeResult, mongoDbClientSession = null) { // Added mongoDbClientSession parameter
    if (!this.session) {
        logger.error(`TradingSessionManager: updateSessionStats called without an active session. UserID: ${this.userId}`);
        return;
    }

    const oldBalance = this.session.final_balance;
    const profitOrLoss = (tradeResult.result === 'win' ? (tradeResult.payout - tradeResult.stake) : -tradeResult.stake);

    const updates = {
        $inc: {
            total_trades: 1,
            winning_trades: (tradeResult.result === 'win' ? 1 : 0),
            // final_balance: profitOrLoss // Update balance directly in DB
        },
        // $set: { consecutive_losses: (tradeResult.result === 'win' ? 0 : (this.session.consecutive_losses || 0) + 1) }
    };
     if (tradeResult.result === 'win') {
        updates.$set = { consecutive_losses: 0 };
    } else if (tradeResult.result === 'loss') {
        updates.$set = { consecutive_losses: (this.session.consecutive_losses || 0) + 1 };
    }


    try {
      // Atomically update session document
      const updatedSession = await TradingSession.findByIdAndUpdate(
        this.session._id, // Corrected from this.session.id
        updates,
        { new: true, session: mongoDbClientSession } // Pass session for transaction
      );

      if (!updatedSession) {
          logger.error(`TradingSessionManager: Failed to find and update session ${this.session._id} during stat update.`);
          // This is a critical error, session state might be diverged.
          return;
      }

      // Update balance separately to ensure it's part of the transaction correctly with $inc
      // Or, if not using $inc for balance, ensure the calculation is correct before $set.
      // For simplicity, let's assume balance update is handled by $inc logic if possible, or manual update after fetch.
      // The provided plan's $inc was for total_trades and winning_trades. Balance needs careful handling.
      // Let's update the in-memory session balance and save it as part of the $set or a separate save.
      // The findByIdAndUpdate above does not include final_balance update yet.

      updatedSession.final_balance += profitOrLoss; // Update in-memory copy first
      if (mongoDbClientSession) { // If in transaction, save again with session
          await updatedSession.save({ session: mongoDbClientSession });
      } else { // If not in transaction, save normally
          await updatedSession.save();
      }

      this.session = updatedSession; // Update the in-memory session object to the latest from DB

      logger.info(`TradingSessionManager: Session stats updated for ${this.session._id}. ` +
                  `Total Trades: ${this.session.total_trades}, Winning: ${this.session.winning_trades}, ` +
                  `Balance: ${this.session.final_balance.toFixed(2)}, Consecutive Losses: ${this.session.consecutive_losses}`);

      // Call risk limits check after stats are updated
      this.checkRiskLimits(); // This method needs to be defined as per plan

      // Update lastTradeFailed status for the next Martingale calculation
      this.lastTradeFailed = profitOrLoss <= 0;
      logger.debug(`TradingSessionManager: Updated lastTradeFailed to ${this.lastTradeFailed} for session ${this.session._id}.`);

    } catch (error) {
      logger.error(`TradingSessionManager: Error updating session stats for ${this.session._id}: ${error.message}`, error);
      // If this was part of a transaction and fails, the transaction should roll back.
      throw error; // Re-throw to be handled by executeTrade's catch
    }
  }

  checkRiskLimits() {
    if (!this.isActive || !this.session) {
      logger.debug("TradingSessionManager: checkRiskLimits called but session is not active or null.");
      return;
    }

    // Prepare data for RiskManager, including config settings for limits
    const sessionStateForRiskCheck = {
      // From live session document
      _id: this.session._id,
      initial_balance: this.session.initial_balance,
      final_balance: this.session.final_balance,
      consecutive_losses: this.session.consecutive_losses || 0,
      total_trades: this.session.total_trades,
      // From session's initial config (assuming they are stored in this.config)
      config: {
          max_consecutive_losses: this.config.max_consecutive_losses,
          daily_loss_limit_percentage: this.config.daily_loss_limit_percentage,
          // other relevant limits from config...
      }
    };

    const riskStatus = this.riskManager.checkSessionLimits(sessionStateForRiskCheck);

    if (riskStatus === 'stop') {
      logger.warn(`TradingSessionManager: RiskManager advised to stop session ${this.session._id} due to risk limit breach. Risk status: ${riskStatus}`);
      this.notifyUser({
        type: 'session_stopped',
        reason: 'risk_limit_exceeded',
        sessionId: this.session._id,
        details: `Session stopped due to risk limits. Current balance: ${this.session.final_balance}, Consecutive losses: ${this.session.consecutive_losses}`
      });
      // IMPORTANT: Call stopSession without await if checkRiskLimits is called from a non-async context
      // or if stopSession itself might take time and we don't want to block further processing here.
      // However, given the plan, stopSession is async and should be awaited.
      this.stopSession('risk_limit_breach');
    } else {
      logger.debug(`TradingSessionManager: Risk limits check passed for session ${this.session._id}. Status: ${riskStatus}`);
    }
  }

  notifyUser(message) {
    // Stub: In a real application, this would send a notification to the user
    // (e.g., via WebSocket, email, SMS, etc.)
    logger.info(`USER_NOTIFICATION for UserID ${this.userId}, SessionID ${this.session?._id}: ${JSON.stringify(message)}`);
    // TODO: Implement actual user notification mechanism
  }
}

module.exports = TradingSessionManager;

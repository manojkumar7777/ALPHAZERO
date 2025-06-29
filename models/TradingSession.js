const mongoose = require('mongoose');

const tradingSessionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  session_start: {
    type: Date,
    default: Date.now
  },
  session_end: {
    type: Date
  },
  initial_balance: {
    type: Number,
    required: true
  },
  final_balance: {
    type: Number
  },
  total_trades: {
    type: Number,
    default: 0
  },
  winning_trades: {
    type: Number,
    default: 0
  },
  lot_size: {
    type: Number,
    default: 1.0
  },
  market_symbol: {
    type: String,
    required: true,
    default: 'R_100'
  },
  status: {
    type: String,
    enum: ['active', 'stopped', 'completed'],
    default: 'active'
  },
  consecutive_losses: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for win rate
tradingSessionSchema.virtual('win_rate').get(function() {
  if (this.total_trades === 0) return 0;
  return (this.winning_trades / this.total_trades) * 100;
});

// Virtual for profit/loss
tradingSessionSchema.virtual('profit_loss').get(function() {
  if (this.final_balance === null || this.final_balance === undefined) return null;
  return this.final_balance - this.initial_balance;
});

// Virtual for session duration in minutes
tradingSessionSchema.virtual('duration_minutes').get(function() {
  if (!this.session_end) return null;
  return (this.session_end - this.session_start) / (1000 * 60);
});

// Indexes
tradingSessionSchema.index({ user_id: 1 });
tradingSessionSchema.index({ status: 1 });
tradingSessionSchema.index({ market_symbol: 1 });

const TradingSession = mongoose.model('TradingSession', tradingSessionSchema);

module.exports = TradingSession;

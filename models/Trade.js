const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TradingSession',
    required: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  trade_id: {
    type: String,
    required: true,
    unique: true
  },
  symbol: {
    type: String,
    required: true
  },
  direction: {
    type: String,
    enum: ['call', 'put'],
    required: true
  },
  stake: {
    type: Number,
    required: true
  },
  payout: {
    type: Number
  },
  entry_time: {
    type: Date,
    default: Date.now
  },
  exit_time: {
    type: Date
  },
  result: {
    type: String,
    enum: ['win', 'loss', 'pending'],
    default: 'pending'
  },
  confidence_score: {
    type: Number,
    min: 0,
    max: 1
  },
  market_analysis: {
    trend: { type: Number },
    volatility: { type: Number },
    sentiment: { type: Number },
    duration: { type: Number }
  },
  contract_details: {
    contract_id: { type: String },
    contract_type: { type: String },
    duration: { type: Number },
    duration_unit: { type: String },
    basis: { type: String },
    currency: { type: String }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for trade duration in seconds
tradeSchema.virtual('duration_seconds').get(function() {
  if (!this.exit_time) return null;
  return (this.exit_time - this.entry_time) / 1000;
});

// Indexes for fast querying
tradeSchema.index({ session_id: 1 });
tradeSchema.index({ user_id: 1 });
tradeSchema.index({ symbol: 1 });
tradeSchema.index({ entry_time: -1 });
tradeSchema.index({ result: 1 });

const Trade = mongoose.model('Trade', tradeSchema);

module.exports = Trade;

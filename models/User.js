const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/.+\@.+\..+/, 'Please enter a valid email']
  },
  password_hash: {
    type: String,
    required: true,
    select: false
  },
  deriv_email: {
    type: String,
    trim: true,
    lowercase: true
  },
  app_id: {
    type: String,
    trim: true
  },
  api_token_name: {
    type: String,
    trim: true
  },
  api_token: {
    type: String,
    trim: true,
    select: false
  },
  account_type: {
    type: String,
    enum: ['demo', 'real'],
    default: 'demo'
  },
  risk_level: {
    type: String,
    enum: ['conservative', 'moderate', 'aggressive'],
    default: 'moderate'
  },
  balance: {
    type: Number,
    default: 0
  },
  selected_market: {
    type: String,
    default: 'R_100'
  },
  trade_settings: {
    base_lot_size: { type: Number, default: 1.0 },
    martingale_multiplier: { type: Number, default: 2 }
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for user's trading sessions
userSchema.virtual('sessions', {
  ref: 'TradingSession',
  localField: '_id',
  foreignField: 'user_id'
});

// Indexes for faster querying
userSchema.index({ email: 1 });
userSchema.index({ account_type: 1 });
userSchema.index({ risk_level: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;

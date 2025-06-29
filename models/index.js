// models/index.js - Only exports models, no DB connection
module.exports = {
  User: require('./User'),
  TradingSession: require('./TradingSession'),
  Trade: require('./Trade')
};

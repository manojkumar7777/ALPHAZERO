require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { User, TradingSession, Trade } = require('./models'); // Import models

const app = express();
const PORT = process.env.PORT || 3001; // Fallback port if not defined in .env

// Middleware to parse JSON
app.use(express.json());

// MongoDB Connection
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
  console.error('FATAL ERROR: MONGO_URI is not defined in .env file');
  process.exit(1);
}

mongoose.connect(mongoURI)
  .then(() => {
    console.log('MongoDB connected successfully.');
    // Optional: Log that models are available (or perform a simple DB operation if needed for full verification)
    console.log('Models (User, TradingSession, Trade) are loaded.');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Basic Route
app.get('/', (req, res) => {
  res.send('Hello World! Express server is running.');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // Export app for potential testing

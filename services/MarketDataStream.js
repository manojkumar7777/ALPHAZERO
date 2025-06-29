// services/MarketDataStream.js
const EventEmitter = require('events');
const logger = require('../logger');

const DERIV_WS_URL = process.env.DERIV_WS_URL || 'wss://ws.derivws.com/websockets/v3?app_id=' + (process.env.DERIV_APP_ID || '1089'); // Example, use your app_id

class MarketDataStream extends EventEmitter {
  constructor(symbol) {
    super();
    this.symbol = symbol;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.MAX_RECONNECTS = 5;
    this.RECONNECT_DELAY_BASE = 1000; // 1 second
    this.tickIntervalId = null;
    this.isConnecting = false;
    this.isConnected = false;

    logger.info(`MarketDataStream initialized for symbol: ${this.symbol}`);
  }

  connect() {
    if (this.isConnecting || this.isConnected) {
      logger.info(`MarketDataStream: Connection attempt skipped, already connecting or connected for ${this.symbol}.`);
      return;
    }
    this.isConnecting = true;
    logger.info(`MarketDataStream: Connecting to ${DERIV_WS_URL} for symbol ${this.symbol}...`);

    // Simulate WebSocket connection for now
    // In a real scenario: this.ws = new WebSocket(DERIV_WS_URL);
    // this.ws.on('open', () => this._onOpen());
    // this.ws.on('message', (data) => this._onMessage(data));
    // this.ws.on('close', (code, reason) => this._onClose(code, reason));
    // this.ws.on('error', (error) => this._onError(error));

    // Simulate connection success
    setTimeout(() => {
      if (!this.isConnecting) return; // Might have been disconnected during the timeout
      this._onOpen();
    }, 100);
  }

  _onOpen() {
    logger.info(`MarketDataStream: Connected for symbol ${this.symbol}.`);
    this.isConnected = true;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.subscribeToSymbol(this.symbol);
    this.emit('open');
    this._simulateTicks(); // Start emitting dummy ticks
  }

  _onMessage(data) {
    // const message = JSON.parse(data);
    // logger.debug(`MarketDataStream: Received message for ${this.symbol}: ${data}`);
    // if (message.tick) {
    //   this.emit('tick', message.tick);
    // } else if (message.error) {
    //   logger.error(`MarketDataStream: Error message from WebSocket for ${this.symbol}: ${message.error.message}`);
    // }
    // For simulation, this is called by _simulateTicks directly
  }

  handleIncomingMessage(tickData) { // Method to be called by simulator
    logger.debug(`MarketDataStream: Handling incoming (simulated) tick for ${this.symbol}: ${JSON.stringify(tickData)}`);
    this.emit('tick', tickData);
  }

  _simulateTicks() {
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
    }
    this.tickIntervalId = setInterval(() => {
      if (!this.isConnected) {
        clearInterval(this.tickIntervalId);
        return;
      }
      const simulatedTick = {
        symbol: this.symbol,
        quote: parseFloat((Math.random() * 100 + 50).toFixed(2)), // Random price between 50 and 150
        epoch: Math.floor(Date.now() / 1000)
      };
      // In real WebSocket, _onMessage would handle this. Here we directly emit.
      this.handleIncomingMessage(simulatedTick);
    }, 2000); // Emit a new tick every 2 seconds
    logger.info(`MarketDataStream: Started emitting simulated ticks for ${this.symbol}.`);
  }

  _simulateClose(code = 1000, reason = 'Simulated disconnect') {
    if (!this.isConnected && !this.isConnecting) return;
    logger.warn(`MarketDataStream: Simulating WebSocket close for ${this.symbol}. Code: ${code}, Reason: ${reason}`);
    this._onClose(code, reason);
  }

  _onClose(code, reason) {
    logger.warn(`MarketDataStream: Disconnected from WebSocket for ${this.symbol}. Code: ${code}, Reason: ${reason}`);
    this.isConnected = false;
    this.isConnecting = false;
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    this.emit('close', code, reason);

    if (this.reconnectAttempts < this.MAX_RECONNECTS) {
      const delay = Math.pow(2, this.reconnectAttempts) * this.RECONNECT_DELAY_BASE + Math.random() * 1000;
      this.reconnectAttempts++;
      logger.info(`MarketDataStream: Attempting to reconnect for ${this.symbol} in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECTS})...`);
      setTimeout(() => this.connect(), delay);
    } else {
      logger.error(`MarketDataStream: Max reconnection attempts reached for ${this.symbol}. Will not try again.`);
      this.emit('error', new Error('Max reconnection attempts reached'));
    }
  }

  _onError(error) {
    logger.error(`MarketDataStream: WebSocket error for ${this.symbol}: ${error.message}`);
    // WebSocket 'close' event will usually follow an error.
    // If not, and the connection is truly broken, we might need to manually trigger _onClose or reconnection here.
    if (!this.isConnected && !this.isConnecting) {
         this._onClose(1006, "Error-induced close"); // 1006 is abnormal closure
    }
    this.emit('error', error);
  }

  subscribeToSymbol(symbol) {
    // const subscribeRequest = {
    //   ticks: symbol,
    //   subscribe: 1
    // };
    // if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    //   this.ws.send(JSON.stringify(subscribeRequest));
    //   logger.info(`MarketDataStream: Subscribed to ticks for ${symbol}`);
    // } else {
    //   logger.warn(`MarketDataStream: Cannot subscribe to ${symbol}, WebSocket not open.`);
    // }
    logger.info(`MarketDataStream: (Simulated) Subscribed to ticks for ${symbol}`);
  }

  disconnect() {
    logger.info(`MarketDataStream: Disconnecting from ${this.symbol}...`);
    this.reconnectAttempts = this.MAX_RECONNECTS; // Prevent reconnection on manual disconnect
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    if (this.ws) {
      // this.ws.close(); // This would trigger _onClose
    }
    // For simulation:
    this.isConnected = false;
    this.isConnecting = false;
    logger.info(`MarketDataStream: (Simulated) Disconnected for ${this.symbol}.`);
    this.emit('close', 1000, 'Manual disconnect'); // Simulate a clean close
  }
}

module.exports = MarketDataStream;

require('dotenv').config({ path: '../.env' }); // Ensure .env variables are loaded
const WebSocket = require('ws');

const DERIV_APP_ID = process.env.DERIV_APP_ID;
const DERIV_API_TOKEN = process.env.DERIV_API_TOKEN;
const DERIV_API_URL = `wss://ws.deriv.com/websockets/v3?app_id=${DERIV_APP_ID}`;

// --- Trading Parameters ---
const TRADING_SYMBOL = 'R_100'; // Example: Volatility 100 Index
const STAKE_AMOUNT = 0.35; // Example: Stake amount in USD
const CONTRACT_DURATION_SECONDS = 60; // Example: 60 seconds
const BUY_PRICE_THRESHOLD_CALL = 10160; // Example: Buy CALL if price goes ABOVE this (for R_100, adjust based on current price)
const BUY_PRICE_THRESHOLD_PUT = 10150; // Example: Buy PUT if price goes BELOW this (for R_100, adjust based on current price)
const MAX_STAKE_PERCENTAGE = 2; // Example: Do not stake more than 2% of account balance
// --- End Trading Parameters ---

let ws;
let isTradeOpen = false; // Simple state to prevent multiple trades
let currentProposal = null; // To store details of the current contract proposal
let accountBalance = null; // To store account balance

function connectToDerivAPI() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    console.log('Deriv API: Already connected or connecting.');
    return;
  }

  console.log(`Deriv API: Connecting to ${DERIV_API_URL}...`);
  ws = new WebSocket(DERIV_API_URL);

  ws.on('open', function open() {
    console.log('Deriv API: Connected.');
    // Authenticate the connection
    if (DERIV_API_TOKEN) {
      ws.send(JSON.stringify({ authorize: DERIV_API_TOKEN }));
      console.log('Deriv API: Sent authorization request.');
    } else {
      console.warn('Deriv API: DERIV_API_TOKEN is not set. Skipping authentication.');
    }
  });

  ws.on('message', function incoming(data) {
    // Message handling will be implemented in a later step
    try {
      const message = JSON.parse(data);
      // console.log('Deriv API: Raw message:', JSON.stringify(message, null, 2)); // For debugging all messages

      if (message.error) {
        console.error('Deriv API: Error message received:', message.error);
      } else {
        switch (message.msg_type) {
          case 'authorize':
            if (message.authorize) {
              console.log('Deriv API: Authentication successful. Account:', message.authorize.loginid);
              // Request balance subscription after successful authorization
              ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
              console.log('Deriv API: Sent balance subscription request.');
            } else {
              console.error('Deriv API: Authentication failed.', message);
            }
            break;
          case 'balance':
            if (message.balance && typeof message.balance.balance !== 'undefined') {
              accountBalance = parseFloat(message.balance.balance);
              console.log(`Deriv API: Account balance updated: ${accountBalance} ${message.balance.currency}`);
            } else if (message.error) {
              console.error('Deriv API: Error in balance response:', message.error);
            }
            break;
          case 'tick':
            console.log('Deriv API: Tick data received:', JSON.stringify(message.tick, null, 2));
            // Further processing for tick data can be added here
            // e.g., emit an event, store in DB, etc.

            // --- Basic Trading Logic ---
            if (message.tick && message.tick.symbol === TRADING_SYMBOL && !isTradeOpen) {
              const currentPrice = message.tick.quote;
              console.log(`Deriv API: Tick for ${TRADING_SYMBOL}: ${currentPrice}`);

              // Example: Buy CALL if price is above threshold_call
              if (BUY_PRICE_THRESHOLD_CALL && currentPrice > BUY_PRICE_THRESHOLD_CALL) {
                if (accountBalance === null) {
                  console.warn(`Deriv API: Balance not available yet. Skipping trade for CALL at ${currentPrice}.`);
                } else if (STAKE_AMOUNT > accountBalance * (MAX_STAKE_PERCENTAGE / 100)) {
                  console.warn(`Deriv API: Stake ${STAKE_AMOUNT} exceeds ${MAX_STAKE_PERCENTAGE}% of balance ${accountBalance}. Skipping CALL trade.`);
                } else if (STAKE_AMOUNT > accountBalance) {
                  console.warn(`Deriv API: Insufficient balance ${accountBalance} for stake ${STAKE_AMOUNT}. Skipping CALL trade.`);
                } else {
                  console.log(`Deriv API: Price ${currentPrice} > ${BUY_PRICE_THRESHOLD_CALL}. Attempting to buy CALL.`);
                  buyContract(TRADING_SYMBOL, 'CALL', STAKE_AMOUNT, CONTRACT_DURATION_SECONDS);
                  isTradeOpen = true; // Prevent immediate re-entry
                }
              }
              // Example: Buy PUT if price is below threshold_put
              else if (BUY_PRICE_THRESHOLD_PUT && currentPrice < BUY_PRICE_THRESHOLD_PUT) {
                if (accountBalance === null) {
                  console.warn(`Deriv API: Balance not available yet. Skipping trade for PUT at ${currentPrice}.`);
                } else if (STAKE_AMOUNT > accountBalance * (MAX_STAKE_PERCENTAGE / 100)) {
                  console.warn(`Deriv API: Stake ${STAKE_AMOUNT} exceeds ${MAX_STAKE_PERCENTAGE}% of balance ${accountBalance}. Skipping PUT trade.`);
                } else if (STAKE_AMOUNT > accountBalance) {
                  console.warn(`Deriv API: Insufficient balance ${accountBalance} for stake ${STAKE_AMOUNT}. Skipping PUT trade.`);
                } else {
                  console.log(`Deriv API: Price ${currentPrice} < ${BUY_PRICE_THRESHOLD_PUT}. Attempting to buy PUT.`);
                  buyContract(TRADING_SYMBOL, 'PUT', STAKE_AMOUNT, CONTRACT_DURATION_SECONDS);
                  isTradeOpen = true; // Prevent immediate re-entry
                }
              }
            }
            // --- End Basic Trading Logic ---
            break;
          case 'proposal': // Response to our proposal request
            if (message.proposal && message.passthrough && message.passthrough.action === 'buy_contract_proposal') {
              console.log('Deriv API: Received proposal response:', JSON.stringify(message.proposal, null, 2));
              if (isTradeOpen && !currentProposal) { // Ensure we intended to trade and don't have an active proposal for buying
                currentProposal = message.proposal; // Store proposal details
                // Now send the actual buy command using the proposal id
                const buyRequest = {
                  buy: message.proposal.id,
                  price: parseFloat(message.proposal.ask_price) // Or a desired price based on proposal
                };
                console.log('Deriv API: Sending buy command for proposal:', JSON.stringify(buyRequest, null, 2));
                ws.send(JSON.stringify(buyRequest));
              } else {
                console.log('Deriv API: Received proposal but no trade was initiated or proposal already handled.');
              }
            }
            break;
          case 'proposal_open_contract': // Confirmation of purchase and ongoing contract updates
            if (message.proposal_open_contract) {
              const contract = message.proposal_open_contract;
              console.log('Deriv API: Proposal open contract update:', JSON.stringify(contract, null, 2));

              if (currentProposal && contract.contract_id === currentProposal.id) {
                if (contract.is_sold === 1) { // Contract has been sold (i.e., expired or closed)
                  console.log(`Deriv API: Contract ${contract.contract_id} sold.`);
                  console.log(`Deriv API: Profit/Loss: ${contract.profit} ${contract.currency}`);
                  console.log(`Deriv API: Buy Price: ${contract.buy_price}, Sell Price: ${contract.sell_price}`);

                  isTradeOpen = false; // Allow new trades
                  currentProposal = null; // Clear current proposal
                  console.log('Deriv API: Ready for new trade.');
                } else if (contract.is_valid_to_sell === 1 && !contract.is_sold) {
                  // Contract is active, can potentially be sold by user if desired (not implemented here)
                  // console.log(`Deriv API: Contract ${contract.contract_id} is active.`);
                } else if (contract.status && contract.status !== 'open') {
                    // E.g. 'won', 'lost' if not covered by is_sold
                    console.log(`Deriv API: Contract ${contract.contract_id} status: ${contract.status}. Profit: ${contract.profit}`);
                    isTradeOpen = false;
                    currentProposal = null;
                    console.log('Deriv API: Ready for new trade (contract ended).');
                }

                // Update currentProposal with the latest state if needed, though POC might not require this.
                // currentProposal = { ...currentProposal, ...contract };
              } else if (contract.is_sold === 1) {
                // This might be a contract from a previous session or one not initiated by this bot instance's current logic
                console.log(`Deriv API: An unrelated contract ${contract.contract_id} was sold. Profit/Loss: ${contract.profit}`);
              }
            }
            break;
          case 'buy': // Confirmation that the buy order was received and processed (or error)
            if(message.buy){
                 console.log('Deriv API: Buy confirmation received:', JSON.stringify(message.buy, null, 2));
                 // Usually followed by proposal_open_contract for the actual contract details
            } else if (message.error) {
                console.error('Deriv API: Buy error:', message.error);
                // If a buy fails, we should probably reset isTradeOpen and currentProposal
                if (message.echo_req && message.echo_req.buy && currentProposal && message.echo_req.buy === currentProposal.id) {
                    console.log('Deriv API: Buy request failed for current proposal. Resetting trade state.');
                    isTradeOpen = false;
                    currentProposal = null;
                }
            }
            break;
          case 'transaction': // For transaction updates (buy, sell, profit/loss)
             if (message.transaction && (message.transaction.action === 'buy' || message.transaction.action === 'sell')) {
                console.log('Deriv API: Trade transaction received:', JSON.stringify(message.transaction, null, 2));
             } else {
                // console.log('Deriv API: Other transaction message:', JSON.stringify(message, null, 2));
             }
            break;
          // Add more cases for other relevant msg_type like 'proposal', 'buy', 'sell', 'history', etc.
          default:
            // console.log('Deriv API: Unhandled message type:', message.msg_type, JSON.stringify(message, null, 2));
            break;
        }
      }
    } catch (error) {
      console.error('Deriv API: Error parsing message:', error);
      console.log('Deriv API: Raw message data:', data.toString()); // Use data.toString() for Buffer
    }
  });

  ws.on('close', function close() {
    console.log('Deriv API: Disconnected.');
    // Optional: Implement reconnection logic here
    // ws = null; // Clear the instance
    // setTimeout(connectToDerivAPI, 5000); // Attempt to reconnect after 5 seconds
  });

  ws.on('error', function error(err) {
    console.error('Deriv API: WebSocket error:', err.message);
    // ws = null; // Clear the instance on error too if reconnecting
  });
}

function getDerivWebSocket() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('Deriv API: WebSocket is not open or not initialized.');
    // connectToDerivAPI(); // Optionally try to connect if not open
  }
  return ws;
}

module.exports = {
  connectToDerivAPI,
  getDerivWebSocket,
  subscribeToTicks,
  buyContract, // Export the new function
};

// Buys a contract.
// For simplicity, this example uses a duration in seconds and assumes 's' unit.
// Barrier is optional for some contract types (e.g., basic CALL/PUT on Volatility Indices might not need it explicitly if using price proposal)
// More complex contracts might need 'barrier2', 'prediction', etc.
function buyContract(symbol, contractType, amount, durationSeconds, barrier = null, passthrough = {}) {
  const derivWS = getDerivWebSocket();
  if (!derivWS || derivWS.readyState !== WebSocket.OPEN) {
    console.error('Deriv API: Cannot buy contract. WebSocket is not open.');
    return;
  }

  const proposalRequest = {
    proposal: 1,
    subscribe: 1, // Subscribe to proposal updates (e.g. for open contract)
    amount: parseFloat(amount), // Ensure amount is a number
    basis: 'stake', // Or 'payout'
    contract_type: contractType, // e.g., 'CALL', 'PUT'
    currency: 'USD',
    duration: parseInt(durationSeconds), // Ensure duration is an integer
    duration_unit: 's', // s:seconds, m:minutes, h:hours, d:days, t:ticks
    symbol: symbol,
    passthrough: {
      ...passthrough,
      action: 'buy_contract_proposal',
      symbol: symbol,
      contract_type: contractType,
    }
  };

  // Add barrier if provided and relevant for the contract type
  // For simple CALL/PUT on Volatility Indices, a barrier might not be explicitly set here,
  // as the entry spot or a dynamic barrier from the proposal is often used.
  // If a specific barrier is required (e.g. for HIGHER/LOWER than a fixed price):
  if (barrier !== null) {
    proposalRequest.barrier = barrier.toString(); // Ensure barrier is a string if provided
  }

  console.log('Deriv API: Sending buy proposal request:', JSON.stringify(proposalRequest, null, 2));
  derivWS.send(JSON.stringify(proposalRequest));
  // The actual 'buy' command will be sent after receiving a 'proposal' response with an id.
}


function subscribeToTicks(symbol, passthrough = {}) {
  const derivWS = getDerivWebSocket();
  if (derivWS && derivWS.readyState === WebSocket.OPEN) {
    console.log(`Deriv API: Subscribing to ticks for ${symbol}...`);
    derivWS.send(JSON.stringify({
      ticks: symbol,
      subscribe: 1,
      passthrough: {
        ...passthrough,
        action: 'subscribe_ticks',
        symbol: symbol
      }
    }));
  } else {
    console.error(`Deriv API: Cannot subscribe to ticks for ${symbol}. WebSocket is not open.`);
    // Optionally, queue the subscription or try to connect and then subscribe.
  }
}

require('dotenv').config();
const express = require('express');

const jwt = require('jsonwebtoken'); // For generating JWTs

const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined. Set it in your .env file.");
  process.exit(1);
}

// --- Mock User Data ---
const mockUsers = {
  "testuser": { id: 1, username: "testuser", password: "password123" } // In a real app, hash passwords!
};

const { expressjwt: ejwt } = require("express-jwt"); // For validating JWTs
// Note: express-jwt v7.x.x is used here for CommonJS compatibility.
// For v8+ you'd use: const { auth } = require('express-oauth2-jwt-bearer'); or similar for custom JWTs.

// --- JWT Middleware Configuration ---
const authenticateJWT = ejwt({
  secret: JWT_SECRET,
  algorithms: ["HS256"], // Specify the algorithm used to sign the JWT
  // credentialsRequired: false, // Set to false if you want to allow access to routes even if no token is provided (req.auth will be undefined)
                               // Default is true, meaning token is required.
  // getToken: function fromHeaderOrQuerystring (req) { // Example of custom token retrieval
  //   if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
  //       return req.headers.authorization.split(' ')[1];
  //   } else if (req.query && req.query.token) {
  //     return req.query.token;
  //   }
  //   return null;
  // }
});

// Error handler for JWT authentication errors (e.g., invalid token, expired token)
// This needs to be registered after your routes that use the JWT middleware.
// Or, more commonly, after all routes if it's a generic error handler.
// For now, placing it where it's clear it's related to JWT.
function jwtErrorHandler(err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
    console.error("JWT Authentication Error:", err.message);
    res.status(401).json({ message: 'Invalid or expired token', error: err.message });
  } else {
    next(err);
  }
}

// --- Example Protected Route ---
// This route will require a valid JWT to be accessed.
// The JWT middleware (`authenticateJWT`) populates `req.auth` (or `req.user` with older express-jwt versions)
// with the decoded payload of the token if it's valid.
app.get('/api/data', authenticateJWT, (req, res) => {
  // If we reach here, the token was valid and req.auth contains the payload
  res.json({
    message: "This is protected data!",
    user: req.auth // Contains { userId, username, iat, exp }
  });
});

// Register the JWT error handler *after* routes that use JWT middleware.
// If it's a general error handler for other errors too, it often goes last.
app.use(jwtErrorHandler);


// --- Authentication Route ---
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required." });
  }

  const user = mockUsers[username];

  // In a real app, use bcrypt.compareSync(password, user.password)
  if (user && user.password === password) {
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '1h' } // Token expires in 1 hour
    );
    res.json({ message: "Login successful", token });
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
});


app.get('/', (req, res) => {
  res.send('Hello World! Add /auth/login (POST) to get a token, and access /api/data (GET) with Bearer token.');
});

const http = require('http');
const setupWebSocket = require('./websocket');
const { connectDB } = require('./config/db');
const derivApiService = require('./services/derivApiService');

const server = http.createServer(app);
const localWss = setupWebSocket(server); // Our local WebSocket server

async function startServer() {
  try {
    await connectDB(); // Connect to MongoDB

    derivApiService.connectToDerivAPI(); // Connect to Deriv API

    // Wait a bit for Deriv API connection and authentication before subscribing
    setTimeout(() => {
      if (derivApiService.getDerivWebSocket() && derivApiService.getDerivWebSocket().readyState === require('ws').OPEN) {
        derivApiService.subscribeToTicks('R_100'); // Subscribe to a test symbol
      } else {
        console.warn('index.js: Deriv WebSocket not open after delay, could not subscribe to test ticks.');
      }
    }, 5000); // Adjust delay as needed, e.g., wait for 'authorize' response

    server.listen(port, () => {
      console.log(`Server listening on port ${port}`);
      console.log(`Local WebSocket server is running on ws://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1);
  }
}

startServer();

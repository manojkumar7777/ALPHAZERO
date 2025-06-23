require('dotenv').config({ path: '../.env' }); // Ensure .env variables are loaded relative to project root
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error('MONGODB_URI not found in environment variables. Please check your .env file.');
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;
let usersCollection;
let tradingSessionsCollection;
let tradesCollection;

async function connectDB() {
  if (db) {
    return { db, usersCollection, tradingSessionsCollection, tradesCollection };
  }
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 }); // Use "admin" or your specific auth DB
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    db = client.db("trading_app"); // Specify your database name here
    usersCollection = db.collection("users");
    tradingSessionsCollection = db.collection("trading_sessions");
    tradesCollection = db.collection("trades");

    console.log(`Connected to database: ${db.databaseName}`);
    console.log(`Collections initialized: users, trading_sessions, trades`);

    return { db, usersCollection, tradingSessionsCollection, tradesCollection };
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    // Gracefully exit or handle error appropriately for your application
    process.exit(1);
  }
}

// Function to get the database client without re-connecting if already connected
// This also exports the collections directly.
async function getDB() {
  if (!db) {
    return await connectDB();
  }
  return { db, usersCollection, tradingSessionsCollection, tradesCollection };
}

// Close the MongoDB connection when the Node.js process exits
process.on('SIGINT', async () => {
  if (client && client.topology && client.topology.isConnected()) {
    await client.close();
    console.log('MongoDB connection closed due to application termination');
  }
  process.exit(0);
});

module.exports = { connectDB, getDB };

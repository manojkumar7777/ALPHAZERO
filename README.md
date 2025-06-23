# Node.js Express WebSocket Project

This project sets up a basic Node.js server using Express.js, with WebSocket support and MongoDB integration.

## Prerequisites

- Node.js (v14 or later recommended)
- npm (usually comes with Node.js)
- MongoDB (running locally or accessible via URI)

## Setup

1.  **Clone the repository (if applicable):**
    ```bash
    git clone <repository-url>
    cd <project-directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create a `.env` file:**
    If it doesn't exist, create a `.env` file in the root of the project with the following content:
    ```env
    PORT=3000
    MONGODB_URI=mongodb://localhost:27017/mydatabase
    ```
    - `PORT`: The port on which the Express server will listen.
    - `MONGODB_URI`: The connection string for your MongoDB database.
    *Ensure `.env` is listed in your `.gitignore` file to prevent committing sensitive credentials.*

## Running the Project

1.  **Add a start script to `package.json`:**
    If not already present, add the following to the `scripts` section of your `package.json`:
    ```json
    "scripts": {
      "start": "node index.js",
      "test": "echo \"Error: no test specified\" && exit 1"
    }
    ```

2.  **Start the server:**
    ```bash
    npm start
    ```

3.  **Access the application:**
    -   Open your browser and go to `http://localhost:PORT` (e.g., `http://localhost:3000`) to see the Express server running.
    -   You can use a WebSocket client (e.g., `wscat`, Postman, or a simple HTML/JS client) to connect to `ws://localhost:PORT` (e.g., `ws://localhost:3000`).

## Project Structure

-   `index.js`: Main entry point, sets up the Express server and integrates WebSockets.
-   `websocket.js`: Contains the WebSocket server logic.
-   `.env`: Stores environment variables (e.g., port, database URI).
-   `.gitignore`: Specifies intentionally untracked files that Git should ignore.
-   `package.json`: Lists project dependencies and scripts.
-   `package-lock.json`: Records the exact versions of dependencies.
-   `README.md`: This file.

## Dependencies

-   `express`: Web framework for Node.js.
-   `ws`: WebSocket library.
-   `mongodb`: MongoDB Node.js driver.
-   `dotenv`: Loads environment variables from a `.env` file.

## TODO (MongoDB Integration)

The MongoDB client has been installed, but actual database connection and usage logic have not been implemented in this initial setup. To integrate MongoDB:
1.  Require the `mongodb` driver in your `index.js` or a separate database utility file.
2.  Connect to MongoDB using the `MONGODB_URI` from `.env` at the start of your application.
3.  Define routes or WebSocket message handlers that perform database operations (e.g., creating, reading, updating, deleting data).
    Example connection snippet:
    ```javascript
    // const { MongoClient } = require('mongodb');
    // const uri = process.env.MONGODB_URI;
    // const client = new MongoClient(uri);
    // async function runDB() {
    //   try {
    //     await client.connect();
    //     console.log("Connected successfully to MongoDB");
    //     // Further operations can be done here
    //     // const db = client.db("mydatabase"); // Or your specific database name
    //   } finally {
    //     // Ensures that the client will close when you finish/error
    //     // await client.close(); // Or manage connection pooling
    //   }
    // }
    // runDB().catch(console.dir);
    ```

## API Authentication (JWT)

This application uses JSON Web Tokens (JWT) to secure certain HTTP API endpoints.

### 1. Getting a JWT Token

To obtain a JWT, send a `POST` request to the `/auth/login` endpoint with a JSON body containing your credentials.
For the mock setup, use the following credentials:
-   Username: `testuser`
-   Password: `password123`

**Example using cURL:**
```bash
curl -X POST -H "Content-Type: application/json" \
-d '{"username": "testuser", "password": "password123"}' \
http://localhost:3000/auth/login
```

If successful, the response will be a JSON object containing the JWT:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoidGVzdHVzZXIiLCJpYXQiOjE2NzgwMzI0NjUsImV4cCI6MTY3ODAzNjA2NX0.xxxxxxxxxxxxxx"
}
```
Copy the `token` value.

### 2. Accessing Protected Routes

To access a protected route, include the JWT in the `Authorization` header of your request, prefixed with `Bearer `.

**Example Protected Route:** `GET /api/data`

**Example using cURL:**
Replace `YOUR_JWT_TOKEN_HERE` with the token you obtained.
```bash
curl -X GET -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" http://localhost:3000/api/data
```

If the token is valid, you will receive a success response:
```json
{
  "message": "This is protected data!",
  "user": {
    "userId": 1,
    "username": "testuser",
    "iat": 1678032465,
    "exp": 1678036065
  }
}
```

If the token is missing, invalid, or expired, you will receive a `401 Unauthorized` error.

**Environment Variable for JWT Secret:**
Ensure you have a `JWT_SECRET` variable defined in your `.env` file. This secret is used to sign and verify tokens. Your `.env` file should include:
```env
# ... other variables like PORT, MONGODB_URI, DERIV_APP_ID, DERIV_API_TOKEN, FRONTEND_URL ...
JWT_SECRET=your-super-secret-and-long-jwt-secret-key
```
**For production, use a strong, randomly generated secret key.**
Make sure `JWT_SECRET` is added to your `.env` file. The application will exit on startup if it's not found.

## Deployment to Heroku

This section guides you through deploying the application to Heroku.

### Prerequisites

1.  **Heroku Account**: Sign up for a free account at [heroku.com](https://www.heroku.com/).
2.  **Heroku CLI**: Install the Heroku Command Line Interface from [devcenter.heroku.com/articles/heroku-cli](https://devcenter.heroku.com/articles/heroku-cli).

### Deployment Steps

1.  **Login to Heroku CLI**:
    Open your terminal and run:
    ```bash
    heroku login
    ```
    This will open a browser window for you to log in.

2.  **Create a Heroku App**:
    Navigate to your project's root directory in the terminal and run:
    ```bash
    heroku create your-unique-app-name # Replace with a unique name, or omit for a random name
    ```
    This command creates a new application on Heroku and adds a Git remote named `heroku` to your local repository.

3.  **Set Environment Variables (Config Vars) on Heroku**:
    Your application relies on environment variables. These must be set in your Heroku app's settings. **Do not commit your `.env` file.**
    You can set these via the Heroku Dashboard (under your app > Settings > Config Vars) or using the Heroku CLI:

    ```bash
    heroku config:set MONGODB_URI="your_mongodb_atlas_connection_string"
    heroku config:set DERIV_APP_ID="your_deriv_app_id"
    heroku config:set DERIV_API_TOKEN="your_deriv_api_token"
    heroku config:set JWT_SECRET="your_strong_random_jwt_secret_for_production"
    heroku config:set FRONTEND_URL="your_frontend_app_url_if_any"
    # heroku config:set PORT="some_port" # PORT is set automatically by Heroku, you usually don't need to set this.
    ```
    **Replace placeholder values with your actual production credentials and secrets.**

    The necessary environment variables are:
    *   `MONGODB_URI`: Your MongoDB connection string (e.g., from MongoDB Atlas).
    *   `DERIV_APP_ID`: Your Deriv application ID.
    *   `DERIV_API_TOKEN`: Your Deriv API token.
    *   `JWT_SECRET`: A strong, random secret key for signing JWTs.
    *   `FRONTEND_URL`: The URL of your frontend application if it needs to be known by the backend (e.g., for CORS or redirects).
    *   `PORT`: This is automatically set by Heroku.

4.  **Deploy the Code**:
    Commit all your local changes to Git:
    ```bash
    git add .
    git commit -m "Prepare for Heroku deployment"
    ```
    Push your code to Heroku (usually to the `main` or `master` branch):
    ```bash
    git push heroku main # Or 'git push heroku master' if that's your default branch
    ```

5.  **Check Application Logs**:
    Monitor the deployment process and check for any startup errors:
    ```bash
    heroku logs --tail
    ```

6.  **Open Your Application**:
    Once deployed successfully, you can open your application in a browser:
    ```bash
    heroku open
    ```

### Important Files for Heroku

*   **`Procfile`**: Tells Heroku how to run your application (`web: npm start`). This has been created for you.
*   **`package.json`**: The `engines` section helps Heroku use the correct Node.js and npm versions. The `scripts.start` command is used by the `Procfile`.

### Troubleshooting
*   If deployment fails, check `heroku logs --tail` for detailed error messages.
*   Ensure all dependencies are listed in `package.json` and not just `devDependencies` if they are needed at runtime.
*   Make sure your `MONGODB_URI` allows connections from Heroku's dynamic IP addresses (MongoDB Atlas often requires IP whitelisting; using `0.0.0.0/0` for whitelisting is convenient for Heroku but less secure for production databases if not properly firewalled).
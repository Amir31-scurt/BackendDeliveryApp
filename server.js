import { ApolloServer } from "apollo-server-express";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import expressEjsLayouts from "express-ejs-layouts";
import { readFileSync } from "fs";
import multer from "multer";
import path from "path";
import pg from 'pg';
const { Pool } = pg; // Destructure after import
import resolvers from "./resolvers.js";
import { delivererResolvers } from "./resolvers/delivererResolvers.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";

dotenv.config();

const __dirname = path.resolve();

const app = express();

const upload = multer({
  storage: multer.memoryStorage(), // Store files in memory for further processing
});

export const pool = new pg.Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: false,
  connectionTimeoutMillis: 10000, // Increase timeout
  idleTimeoutMillis: 30000
});

(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connected! PostgreSQL version:', 
      (await client.query('SELECT version()')).rows[0]);
  } catch (err) {
    console.error('❌ Connection failed:', err);
  } finally {
    await pool.end();
  }
})();

app.use(
  cors({
    origin: "*", // Allow all origins for testing
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Middleware to parse JSON
app.use(express.json());

// Setup EJS as the template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.post("/storage/upload", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileName = `restaurant-${Date.now()}-${file.originalname}`;
    console.log("Uploading file:", fileName);

    // Example of storing file metadata in PostgreSQL
    const query = `
      INSERT INTO restaurant_images (file_name, mime_type, data)
      VALUES ($1, $2, $3)
      RETURNING id;
    `;
    const values = [fileName, file.mimetype, file.buffer];

    const result = await pool.query(query, values);
    const imageId = result.rows[0].id;

    // Generate a public URL or path to access the file
    const publicUrl = `/images/${imageId}`; // Example path

    res.status(200).json({ publicUrl });
  } catch (error) {
    console.error("Error uploading image:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Setup GraphQL server
const typeDefs = readFileSync(path.join(__dirname, "schema.graphql"), "utf8");
const server = new ApolloServer({
  typeDefs,
  resolvers,
  delivererResolvers,
  context: { pool }, // Pass PostgreSQL pool to context
});

// Apply middleware to the app
await server.start();
server.applyMiddleware({ app });

// Start the server
const PORT = process.env.DB_PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `GraphQL endpoint: http://localhost:${PORT}${server.graphqlPath}`
  );
});

// Root route
app.get("/", (req, res) => {
  res.send("Food Delivery API is running");
});
// Admin routes
app.use("/admin", adminRoutes);
// Routes
app.use("/api/auth", authRoutes);

app.use(expressEjsLayouts);
app.set("layout", "admin/layout");
app.set("layout", "admin/restaurants");

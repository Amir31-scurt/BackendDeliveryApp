import { ApolloServer } from "apollo-server-express";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import expressEjsLayouts from "express-ejs-layouts";
import { readFileSync } from "fs";
import path from "path";
import resolvers from "./resolvers.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import delivererRoutes from "./routes/deliverers.js";
import { supabase } from "./supabaseClient.js";

dotenv.config();

const __dirname = path.resolve();

const app = express();

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

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
// Admin routes
app.use("/admin", adminRoutes);
// Routes
app.use("/api/auth", authRoutes);
app.use("/api/deliverers", delivererRoutes);

app.use(expressEjsLayouts);
app.set("layout", "admin/layout");
app.set("layout", "admin/restaurants");

// Setup GraphQL server
const typeDefs = readFileSync(path.join(__dirname, "schema.graphql"), "utf8");
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: { supabase },
});

// Apply middleware to the app
await server.start();
server.applyMiddleware({ app });

// Start the server
const PORT = process.env.PORT || 4000;
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

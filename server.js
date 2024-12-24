import { ApolloServer } from "apollo-server-express";
import MongoStore from "connect-mongo";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import mongoose from "mongoose";
import path from "path";

import expressEjsLayouts from "express-ejs-layouts";
import resolvers from "./resolvers.js";
import adminRoutes from "./routes/admin.js";
import typeDefs from "./schema.js";

dotenv.config();

const app = express();

// Set up CORS
app.use(cors());

// Setup EJS as the template engine
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

// Serve static files
app.use(express.static(path.join(process.cwd(), "public")));

// Parse JSON request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_session_secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
  })
);

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => ({ req }),
  });

  await server.start();

  server.applyMiddleware({ app, path: "/graphql" });

  // Admin routes
  app.use("/admin", adminRoutes);

  app.use(expressEjsLayouts);
  app.set("layout", "admin/layout");
  app.set("layout", "admin/restaurants");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(
      `GraphQL endpoint: http://localhost:${PORT}${server.graphqlPath}`
    );
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
  });
}

startServer().catch((error) => {
  console.error("Error starting server:", error);
});

app.get("/", (req, res) => {
  res.send("Food Delivery API is running");
});

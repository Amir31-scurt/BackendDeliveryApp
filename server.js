import { ApolloServer } from "apollo-server-express";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";

import resolvers from "./resolvers.js";
import typeDefs from "./schema.js";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => ({ req }),
  });

  await server.start();

  server.applyMiddleware({ app, path: "/graphql" });

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(
      `GraphQL endpoint: http://localhost:${PORT}${server.graphqlPath}`
    );
  });
}

startServer().catch((error) => {
  console.error("Error starting server:", error);
});

app.get("/", (req, res) => {
  res.send("Food Delivery API is running");
});

import { ApolloServer } from "apollo-server-express";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import expressEjsLayouts from "express-ejs-layouts";
import { readFileSync } from "fs";
import multer from "multer";
import path from "path";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import csrf from 'csurf';
import resolvers from "./resolvers.js";
import { delivererResolvers } from "./resolvers/delivererResolvers.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import { supabase } from "./supabaseClient.js";
import { authMiddleware } from "./middleware/auth.js";
// import { supabase } from "./supabaseClient.js";

dotenv.config();

const __dirname = path.resolve();

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "fonts.gstatic.com", "fonts.googleapis.com", "cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:", "https:"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      'http://localhost:8080',
      'https://www.gourmetdamour.com',
      'https://gourmetdamour.com',
      'com.gourmetdamour.app'
    ];

    // Allow requests with no origin (like mobile apps)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.gourmetdamour.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["X-CSRF-Token"],
  credentials: true
}));

// Cookie parser middleware
app.use(cookieParser());

// Middleware to parse JSON
app.use(express.json());

// Setup EJS as the template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// CSRF protection setup
const csrfProtection = csrf({
  cookie: {
    key: '_csrf',
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// Apply CSRF protection to all routes except GraphQL, API routes, and admin routes
app.use((req, res, next) => {
  if (
    req.path === '/graphql' ||
    req.path.startsWith('/api/') ||
    req.path.startsWith('/admin/deliverers/') ||
    req.path.startsWith('/storage/')
  ) {
    return next();
  }
  csrfProtection(req, res, next);
});

// Make CSRF token available to all views
app.use((req, res, next) => {
  if (req.csrfToken) {
    res.locals.csrfToken = req.csrfToken();
  }
  next();
});

// Authentication middleware for protected routes
app.use('/admin', authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(), // Store files in memory for further processing
});

app.post("/storage/upload", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileName = `restaurant-${Date.now()}-${file.originalname}`;
    console.log("Uploading file:", fileName);

    // Attempt to upload the file
    const { data, error } = await supabase.storage
      .from("restaurant-images")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
      });

    // Log the upload response
    console.log("Upload response:", { data, error });

    if (error) {
      console.error("Upload error:", error);
      throw new Error("Upload failed");
    }

    // Generate the public URL
    const publicUrlData = supabase.storage
      .from("restaurant-images")
      .getPublicUrl(fileName);

    // Explicitly log the public URL data
    console.log("Public URL data:", publicUrlData);

    if (!publicUrlData.data?.publicUrl) {
      console.error("Failed to retrieve public URL");
      return res.status(500).json({ error: "Public URL retrieval failed" });
    }

    res.status(200).json({ publicUrl: publicUrlData.data.publicUrl });
  } catch (error) {
    console.error("Error uploading image:", error.message);
    res.status(500).json({ error: error.message });
  }
});
app.post("/storage/profilePictures/upload", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileName = `profile-${Date.now()}-${file.originalname}`;
    console.log("Uploading file:", fileName);

    // Attempt to upload the file
    const { data, error } = await supabase.storage
      .from("profile-pictures")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
      });

    // Log the upload response
    console.log("Upload response:", { data, error });

    if (error) {
      console.error("Upload error:", error);
      throw new Error("Upload failed");
    }

    // Generate the public URL
    const publicUrlData = supabase.storage
      .from("profile-pictures")
      .getPublicUrl(fileName);

    // Explicitly log the public URL data
    console.log("Public URL data:", publicUrlData);

    if (!publicUrlData.data?.publicUrl) {
      console.error("Failed to retrieve public URL");
      return res.status(500).json({ error: "Public URL retrieval failed" });
    }

    res.status(200).json({ publicUrl: publicUrlData.data.publicUrl });
  } catch (error) {
    console.error("Error uploading image:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Add this route
app.post('/api/push-token', async (req, res) => {
  const { userId, token } = req.body;

  if (!userId || !token) {
    return res.status(400).json({ message: 'Missing userId or token' });
  }

  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token }, { onConflict: ['user_id'] });

  if (error) {
    return res.status(500).json({ message: 'Failed to save token', error });
  }

  return res.status(200).json({ message: 'Token saved successfully' });
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

app.post("/storage/upload", async (req, res) => {
  try {
    const file = req.files.image; // Assuming `express-fileupload` or similar middleware is used
    const fileName = `restaurant-${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from("restaurant-images")
      .upload(fileName, file.data, {
        contentType: file.mimetype,
      });

    if (error) throw new Error(error.message);

    const { publicUrl } = supabase.storage
      .from("restaurant-images")
      .getPublicUrl(fileName);

    res.status(200).json({ publicUrl });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({ error: error.message });
  }
});

// Setup GraphQL server
const typeDefs = readFileSync(path.join(__dirname, "schema.graphql"), "utf8");
const server = new ApolloServer({
  typeDefs,
  resolvers,
  delivererResolvers,
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
  res.render('landing', { layout: false });
  //  res.send("Gourmet d'amour API is running");
});
// Admin routes with CSRF protection
app.use("/admin", adminRoutes);
// Auth routes with CSRF protection
app.use("/api/auth", authRoutes);

// Setup layouts
app.use(expressEjsLayouts);
app.set("layout", "admin/layout");
app.set("layout", "admin/restaurants");

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});


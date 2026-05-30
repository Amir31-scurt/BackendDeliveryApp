const {ApolloServer} = require("apollo-server-express");
const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const expressEjsLayouts = require("express-ejs-layouts");
const {writeFile, mkdir} = require("fs/promises");
const {existsSync, readFileSync} = require("fs");
const multer = require("multer");
const path = require("path");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const csrf = require("csurf");
const flash = require("connect-flash");
const session = require("express-session");
const pgSession = require("connect-pg-simple"); // Use PostgreSQL for sessions
const {pool} = require("./db.js"); // Import existing pool
const resolvers = require("./resolvers.js");
const delivererResolvers = require("./resolvers/delivererResolvers.js");
const adminRoutes = require("./routes/admin.js");
const authRoutes = require("./routes/auth.js");
const wavePaymentsRouter = require("./routes/wavePayments.js");
const payoutStatusRouter = require("./routes/payoutStatus.js");
const adminPayoutsRouter = require("./routes/adminPayouts.js");
const {supabase} = require("./supabaseClient.js");
const {authMiddleware} = require("./middleware/auth.js");

dotenv.config();

const app = express();

// Request logger for troubleshooting production routes
app.use((req, res, next) => {
  next();
});

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "cdn.jsdelivr.net",
          "cdnjs.cloudflare.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "fonts.googleapis.com",
          "cdnjs.cloudflare.com",
        ],
        fontSrc: [
          "'self'",
          "fonts.gstatic.com",
          "fonts.googleapis.com",
          "cdnjs.cloudflare.com",
        ],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        mediaSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:", "https:"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);

// CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:4000",
        "http://127.0.0.1:4000",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:8080",
        "http://localhost:8081",
        "https://www.gourmetdamour.com",
        "https://gourmetdamour.com",
        "com.gourmetdamour.app",
      ];

      // Allow requests with no origin (like mobile apps or curl) or "null" origin (redirects/local files)
      if (!origin || origin === "null") {
        return callback(null, true);
      }

      // Allow any localhost origin (for development with various ports)
      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin.startsWith("http://192.168.")
      ) {
        return callback(null, true);
      }

      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        origin.endsWith(".gourmetdamour.com")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["X-CSRF-Token"],
    credentials: true,
  }),
);

// Cookie parser middleware
app.use(cookieParser());
// CSRF protection setup
const csrfProtection = csrf({
  cookie: {
    key: "_csrf",
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  },
});

// Middleware to parse JSON
app.use(express.json());
app.use(express.urlencoded({extended: true}));

const PostgresStore = pgSession(session);

// Session configuration using PostgreSQL to prevent memory leaks in production
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret_key",
    resave: false,
    saveUninitialized: false,
    store: new PostgresStore({
      pool: pool, // Connection pool
      tableName: "session", // Use another name if you wish
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// Flash messages
app.use(flash());

// Global variables for templates
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.error = req.flash("error");
  res.locals.errors = req.flash("errors") || [];
  next();
});

// Setup EJS as the template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Apply CSRF protection to all routes except GraphQL, and mobile API routes
app.use((req, res, next) => {
  const path = req.path;
  const isGraphQL = path.includes("/graphql");
  const isMobileApi = path.includes("/auth") && !path.includes("/admin"); // Auth is for mobile, Admin has its own auth
  const isStorage = path.startsWith("/storage/") || path.includes("/uploads/");
  const isHealth = path.includes("/health");
  const isWave = path.includes("/wave");
  const isPushToken = path.includes("/push-token");

  if (
    isGraphQL ||
    isMobileApi ||
    isStorage ||
    isHealth ||
    isWave ||
    isPushToken
  ) {
    return next();
  }

  // Admin panel and other browser-based routes should have CSRF protection
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
app.use("/admin", authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(), // Store files in memory for further processing
});

app.post("/storage/upload", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({error: "No file uploaded"});
    }

    const fileName = `restaurant-${Date.now()}-${file.originalname}`;
    const uploadDir = path.join(__dirname, "public", "uploads", "restaurants");

    // Create directory if it doesn't exist
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, {recursive: true});
    }

    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, file.buffer);

    // Generate the public URL (relative to public directory)
    const publicUrl = `/uploads/restaurants/${fileName}`;

    res.status(200).json({publicUrl});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});
app.post(
  "/storage/profilePictures/upload",
  upload.single("image"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({error: "No file uploaded"});
      }

      const fileName = `profile-${Date.now()}-${file.originalname}`;
      const uploadDir = path.join(__dirname, "public", "uploads", "profiles");

      // Create directory if it doesn't exist
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, {recursive: true});
      }

      const filePath = path.join(uploadDir, fileName);
      await writeFile(filePath, file.buffer);

      // Generate the public URL (relative to public directory)
      const publicUrl = `/uploads/profiles/${fileName}`;

      res.status(200).json({publicUrl});
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  },
);

app.get("/.well-known/apple-app-site-association", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "7P5W8BC7WD.com.gourmetdamour.app",
          paths: ["/payment/success", "/payment/error"],
        },
      ],
    },
  });
});

// Add this route
app.post("/api/push-token", async (req, res) => {
  const {userId, token} = req.body;

  if (!userId || !token) {
    return res.status(400).json({message: "Missing userId or token"});
  }

  try {
    // Upsert push token (insert or update)
    const {data: existing, error: checkError} = await supabase
      .from("push_tokens")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (checkError) {
      return res
        .status(500)
        .json({message: "Failed to verify token existence", error: checkError});
    }

    if (!existing) {
      // Insert new token
      const {error: insertError} = await supabase
        .from("push_tokens")
        .insert({user_id: userId, token});
      if (insertError) {
        return res
          .status(500)
          .json({message: "Failed to save token", error: insertError});
      }
    } else {
      // Update existing token
      const {error: updateError} = await supabase
        .from("push_tokens")
        .update({token})
        .eq("user_id", userId);
      if (updateError) {
        return res
          .status(500)
          .json({message: "Failed to update token", error: updateError});
      }
    }

    return res.status(200).json({message: "Token saved successfully"});
  } catch (error) {
    return res
      .status(500)
      .json({message: "Failed to save token", error: error.message});
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Removed duplicate upload route - using the multer-based route above

// Setup GraphQL server
const typeDefs = readFileSync(path.join(__dirname, "schema.graphql"), "utf8");
const server = new ApolloServer({
  typeDefs,
  resolvers,
  delivererResolvers,
  persistedQueries: false, // Explicitly disable to save memory
  cache: "bounded", // Use bounded cache as recommended
  context: {supabase, db: supabase},
});

// Wrap async startup in IIFE (top-level await not available in CommonJS)
(async () => {
  // Apply middleware to the app
  await server.start();
  server.applyMiddleware({app, path: "/api/graphql"});

  // Health check route - available at both paths
  app.get(["/health", "/api/health"], (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Root routes - Handle various ways cPanel/browsers might land here
  app.get(["/", "/api", "/index.html", "/api/index.html"], (req, res) => {
    res.render("landing", {layout: false});
  });

  // Privacy Policy and Terms
  app.get(["/privacy", "/api/privacy"], (req, res) => {
    res.render("privacy", {layout: false});
  });
  // Admin routes - mount at both to support hardcoded /admin links and /api/admin entry points
  app.use(["/admin", "/api/admin"], adminRoutes);

  // Auth routes - mount at both
  app.use(["/auth", "/api/auth"], authRoutes);
  // Wave routes
  app.use(wavePaymentsRouter);
  app.use(payoutStatusRouter);
  app.use(adminPayoutsRouter);

  // Setup layouts
  app.use(expressEjsLayouts);
  app.set("layout", "admin/layout");
  app.set("layout", "admin/restaurants");

  // Error handling middleware
  app.use((err, req, res, next) => {
    // Check if headers have already been sent
    if (res.headersSent) {
      return next(err);
    }

    res.status(err.status || 500).json({
      error: err.message,
      stack: process.env.NODE_ENV === "production" ? null : err.stack,
    });
  });

  // Start the server
  // Passenger sets process.env.PORT; fall back to SERVER_PORT (.env) or 4000
  const PORT = process.env.PORT || process.env.SERVER_PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();


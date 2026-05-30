/**
 * app.js — cPanel / Phusion Passenger entry point with advanced error logging.
 *
 * This file captures and redirects all stdout, stderr, uncaught exceptions,
 * and promise rejections to 'cpanel_debug.log' in your application root folder.
 */
const fs = require("fs");
const path = require("path");

const logFile = path.join(__dirname, "cpanel_debug.log");

// Helper to write timestamped messages to the log file immediately
function writeLog(message) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    // Fail silently if writing log fails
  }
}

// Log initial startup information
writeLog("=================== APPLICATION STARTING ===================");
writeLog(`Process ID (PID): ${process.pid}`);
writeLog(`Node.js Version: ${process.version}`);
writeLog(`Directory (__dirname): ${__dirname}`);
writeLog(`Passenger/cPanel PORT: ${process.env.PORT}`);
writeLog(`Database Port (DB_PORT): ${process.env.DB_PORT}`);
writeLog(`Server Port (SERVER_PORT): ${process.env.SERVER_PORT}`);
writeLog(`Node Environment (NODE_ENV): ${process.env.NODE_ENV}`);

// Redirect stdout (console.log) and stderr (console.error) to the file
try {
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  
  // Custom write wrappers that prepend timestamps to logs
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  process.stdout.write = function (chunk, encoding, callback) {
    writeLog(`[INFO] ${chunk.toString().trim()}`);
    return originalStdoutWrite.apply(process.stdout, arguments);
  };

  process.stderr.write = function (chunk, encoding, callback) {
    writeLog(`[ERROR] ${chunk.toString().trim()}`);
    return originalStderrWrite.apply(process.stderr, arguments);
  };
} catch (logInitError) {
  writeLog(`Failed to redirect console streams: ${logInitError.message}`);
}

// Catch and log uncaught exceptions
process.on("uncaughtException", (error) => {
  writeLog(`CRITICAL: Uncaught Exception!`);
  writeLog(error.stack || error);
  // Give standard stderr output too
  console.error(error);
  process.exit(1);
});

// Catch and log unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  writeLog(`CRITICAL: Unhandled Promise Rejection!`);
  writeLog(reason && reason.stack ? reason.stack : reason);
  console.error(reason);
});

// Load the actual server code
try {
  writeLog("Requiring server.js...");
  require("./server.js");
  writeLog("server.js required successfully.");
} catch (requireError) {
  writeLog(`CRITICAL: Failed to require server.js: ${requireError.stack || requireError}`);
  console.error(requireError);
}

/**
 * app.js — cPanel / Phusion Passenger entry point with advanced error logging.
 *
 * Intercepts all startup exceptions and logs them to 'cpanel_debug.log'
 */
const fs = require("fs");
const path = require("path");

const logFile = path.join(__dirname, "cpanel_debug.log");

function writeLog(message) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    // Silently fail if log file write fails
  }
}

writeLog("=================== PASSENGER INITIATING APPLICATION ===================");
writeLog(`Process ID (PID): ${process.pid}`);
writeLog(`Node.js Version: ${process.version}`);
writeLog(`Directory (__dirname): ${__dirname}`);
writeLog(`Passenger PORT env: ${process.env.PORT}`);

// Intercept uncaught exceptions
process.on("uncaughtException", (error) => {
  writeLog(`CRITICAL CRASH: Uncaught Exception!`);
  writeLog(error.stack || error);
  process.exit(1);
});

// Intercept promise rejections
process.on("unhandledRejection", (reason, promise) => {
  writeLog(`CRITICAL CRASH: Unhandled Promise Rejection!`);
  writeLog(reason && reason.stack ? reason.stack : reason);
});

// Try to load the main server.js
try {
  writeLog("Requiring server.js...");
  require("./server.js");
  writeLog("server.js required successfully.");
} catch (requireError) {
  writeLog(`CRITICAL CRASH: Failed to require server.js: ${requireError.stack || requireError}`);
  process.exit(1);
}

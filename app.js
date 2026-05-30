/**
 * app.js — cPanel / Phusion Passenger entry point.
 *
 * Passenger looks for "app.js" by default.
 * This file simply loads the real server from server.js.
 */
require("./server.js");

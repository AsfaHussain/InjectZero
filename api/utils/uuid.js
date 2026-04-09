/**
 * uuid.js — Utility: Request ID Generator
 *
 * Generates cryptographically-random v4 UUIDs to uniquely identify
 * every request flowing through the security pipeline.
 */

const { v4: uuidv4 } = require("uuid");

/**
 * Generate a new v4 UUID.
 * @returns {string} A UUID string, e.g. "550e8400-e29b-41d4-a716-446655440000"
 */
function generateRequestId() {
  return uuidv4();
}

module.exports = { generateRequestId };

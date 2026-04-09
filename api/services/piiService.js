/**
 * piiService.js — Service: PII Detection & Masking
 *
 * Scans raw user input for Personally Identifiable Information (PII)
 * and replaces detected values with safe placeholder tokens before the
 * payload is forwarded to any downstream service or LLM.
 *
 * Supported PII types:
 *   - Email addresses  → [EMAIL]
 *   - Phone numbers    → [PHONE]
 *   - IPv4 addresses   → [IP_ADDRESS]
 *   - Credit card numbers → [CREDIT_CARD]
 *   - Social Security Numbers (US) → [SSN]
 */

"use strict";

// ---------------------------------------------------------------------------
// PII pattern definitions
// Each entry has: { label, regex, token }
// ---------------------------------------------------------------------------
const PII_PATTERNS = [
  {
    label: "email",
    // RFC 5322-ish email regex — covers the vast majority of real-world emails
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    token: "[EMAIL]",
  },
  {
    label: "phone",
    // Matches common US/international phone formats:
    //   +1-800-555-0199  |  (800) 555-0199  |  800.555.0199  |  8005550199
    regex:
      /(\+?\d{1,3}[\s\-.]?)?(\(?\d{3}\)?[\s\-.]?)(\d{3}[\s\-.]?\d{4})/g,
    token: "[PHONE]",
  },
  {
    label: "ipv4",
    // Matches dotted-decimal IPv4 addresses
    regex:
      /\b(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    token: "[IP_ADDRESS]",
  },
  {
    label: "creditCard",
    // Matches 13–16 digit card numbers with optional spaces/dashes
    regex: /\b(?:\d[ \-]?){13,16}\b/g,
    token: "[CREDIT_CARD]",
  },
  {
    label: "ssn",
    // US Social Security Number: 123-45-6789 or 123 45 6789
    regex: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g,
    token: "[SSN]",
  },
];

/**
 * Scan `text` for PII and replace every detected value with its token.
 *
 * @param {string} text - Raw input text from the agent / end-user.
 * @returns {{ maskedText: string, detectedTypes: string[], detected: boolean }}
 *   - maskedText    : Text with PII replaced by placeholder tokens.
 *   - detectedTypes : Array of PII type labels found (unique).
 *   - detected      : Convenience boolean — true if any PII was found.
 */
function maskPII(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { maskedText: text, detectedTypes: [], detected: false };
  }

  let maskedText = text;
  const detectedTypes = [];

  for (const pattern of PII_PATTERNS) {
    // Reset lastIndex to avoid stateful regex bugs
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(maskedText)) {
      detectedTypes.push(pattern.label);
      // Reset again before replace because test() advances lastIndex
      pattern.regex.lastIndex = 0;
      maskedText = maskedText.replace(pattern.regex, pattern.token);
    }
  }

  return {
    maskedText,
    detectedTypes: [...new Set(detectedTypes)],
    detected: detectedTypes.length > 0,
  };
}

module.exports = { maskPII };

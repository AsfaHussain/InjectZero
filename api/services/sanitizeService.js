/**
 * sanitizeService.js — Service: Input Sanitization
 *
 * Replaces malicious phrases and patterns with safe placeholder tokens
 * so that—even if a high-risk request is allowed through—the downstream
 * LLM never sees the raw injection payload.
 *
 * Sanitization is applied AFTER PII masking (which is handled by piiService).
 * The two stages are kept separate so each preserves a clean audit trail.
 *
 * Strategy
 * ────────
 * 1. Regex-based phrase replacement  — targets known injection fragments.
 * 2. Null-byte / control-char strip  — removes hidden ASCII control characters.
 * 3. Unicode confusable normalization — normalizes lookalike Unicode characters.
 * 4. Excessive repetition collapse   — prevents token-flooding attacks.
 */

"use strict";

// ---------------------------------------------------------------------------
// Phrase replacement rules
// Order matters: more-specific patterns should come first.
// ---------------------------------------------------------------------------
const SANITIZE_RULES = [
  // Instruction overrides
  {
    regex: /ignore\s+(previous|all|prior|your)\s+instructions?/gi,
    replacement: "[BLOCKED_INJECTION]",
  },
  {
    regex: /forget\s+(everything|all|what)\s+(you\s+)?(were\s+)?(told|know)/gi,
    replacement: "[BLOCKED_INJECTION]",
  },
  {
    regex: /disregard\s+(all|any|previous|prior|your)/gi,
    replacement: "[BLOCKED_INJECTION]",
  },
  {
    regex: /your\s+(new\s+)?instructions?\s+(are|is)\s*:/gi,
    replacement: "[BLOCKED_INJECTION]",
  },
  {
    regex: /override\s+(your\s+)?system\s+prompt/gi,
    replacement: "[BLOCKED_INJECTION]",
  },

  // Prompt exfiltration
  {
    regex:
      /(reveal|show|print|output|display|repeat)\s+(your\s+)?(system\s+prompt|hidden\s+instructions?|initial\s+prompt|instructions?\s+above)/gi,
    replacement: "[BLOCKED_EXFILTRATION]",
  },
  {
    regex:
      /repeat\s+(the\s+)?(text|content|prompt|instructions?)\s+(above|before|prior)/gi,
    replacement: "[BLOCKED_EXFILTRATION]",
  },

  // Data exfiltration commands
  {
    regex:
      /send\s+(data|credentials?|keys?|tokens?|passwords?|results?|output)\s+to/gi,
    replacement: "[BLOCKED_EXFILTRATION]",
  },
  {
    regex: /exfiltrat(e|ing)\s+(data|credentials?|information|user\s+data)/gi,
    replacement: "[BLOCKED_EXFILTRATION]",
  },
  {
    regex: /leak\s+(api\s+keys?|credentials?|secrets?|tokens?)/gi,
    replacement: "[BLOCKED_EXFILTRATION]",
  },

  // Safety bypass
  {
    regex: /bypass\s+(safety|security|content|filter|restriction)/gi,
    replacement: "[BLOCKED_BYPASS]",
  },
  {
    regex: /disable\s+(content\s+filter|safety|restrictions?|guardrails?)/gi,
    replacement: "[BLOCKED_BYPASS]",
  },
  {
    regex: /\b(jailbreak|dan\s+mode|developer\s+mode|unrestricted\s+mode|god\s+mode)\b/gi,
    replacement: "[BLOCKED_BYPASS]",
  },
  {
    regex:
      /(act|pretend|behave|respond)\s+as\s+if\s+(you\s+have\s+)?(no\s+restrictions?|no\s+limits?|no\s+rules?|no\s+filter)/gi,
    replacement: "[BLOCKED_BYPASS]",
  },

  // Role injection
  {
    regex:
      /(you\s+are\s+now|act\s+as|pretend\s+(you\s+are|to\s+be))\s+(a\s+)?(hacker|malicious|evil|unrestricted|rogue)\s*(ai|assistant|bot)?/gi,
    replacement: "[BLOCKED_ROLE_INJECTION]",
  },
  {
    regex: /simulate\s+(an?\s+)?(attack|unrestricted|hacker|rogue)/gi,
    replacement: "[BLOCKED_ROLE_INJECTION]",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip ASCII control characters (except standard whitespace).
 * Prevents null-byte / hidden-character injection tricks.
 * @param {string} text
 * @returns {string}
 */
function stripControlChars(text) {
  // Allow: tab (9), newline (10), carriage return (13)
  // Block: 0–8, 11–12, 14–31, 127 (DEL)
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Collapse extreme repetition (e.g. "aaa...aaa" → "aaa[TRUNCATED]").
 * Prevents token-flooding / denial-of-context attacks.
 * @param {string} text
 * @returns {string}
 */
function collapseRepetition(text) {
  // Any single character repeated more than 20 times is collapsed
  return text.replace(/(.)\1{20,}/g, "$1$1$1[TRUNCATED]");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sanitize the input text by:
 *   1. Stripping control characters
 *   2. Applying phrase-replacement rules
 *   3. Collapsing excessive repetition
 *
 * @param {string} text - PII-masked input text.
 * @returns {{
 *   sanitizedText:     string,
 *   replacementsCount: number,   // Total number of phrase replacements made
 *   wasModified:       boolean   // True if any change was applied
 * }}
 */
function sanitizeInput(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { sanitizedText: text, replacementsCount: 0, wasModified: false };
  }

  let current = stripControlChars(text);
  let replacementsCount = 0;

  for (const rule of SANITIZE_RULES) {
    rule.regex.lastIndex = 0;
    const replaced = current.replace(rule.regex, rule.replacement);
    // Count replacements by comparing string change
    if (replaced !== current) {
      // Rough count: each application of the regex can match N times
      rule.regex.lastIndex = 0;
      const matches = current.match(rule.regex);
      replacementsCount += matches ? matches.length : 1;
      current = replaced;
    }
    rule.regex.lastIndex = 0;
  }

  current = collapseRepetition(current);

  return {
    sanitizedText: current,
    replacementsCount,
    wasModified: current !== text,
  };
}

module.exports = { sanitizeInput };

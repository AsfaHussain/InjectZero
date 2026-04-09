/**
 * detectionService.js — Service: Rule-Based Threat Detection
 *
 * Applies a curated set of regex patterns to detect well-known prompt-
 * injection vectors, instruction-override attempts, and data-exfiltration
 * payloads.
 *
 * Each rule returns a structured flag when triggered, giving downstream
 * services rich metadata (severity, category, matched fragment) rather than
 * a bare boolean.
 */

"use strict";

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------
// Each rule has:
//   id        — unique machine-readable identifier
//   category  — threat category for grouping / reporting
//   severity  — "critical" | "high" | "medium" | "low"
//   regex     — compiled RegExp (case-insensitive, global)
//   description — human-readable explanation
// ---------------------------------------------------------------------------
const DETECTION_RULES = [
  // ── Instruction Override ─────────────────────────────────────────────────
  {
    id: "RULE_IGNORE_INSTRUCTIONS",
    category: "instruction_override",
    severity: "critical",
    regex: /ignore\s+(previous|all|prior|your)\s+instructions?/gi,
    description: "Attempt to override previous system or user instructions.",
  },
  {
    id: "RULE_FORGET_INSTRUCTIONS",
    category: "instruction_override",
    severity: "critical",
    regex: /forget\s+(everything|all|what)\s+(you\s+)?(were\s+)?(told|know)/gi,
    description: "Attempt to make the model forget its context.",
  },
  {
    id: "RULE_NEW_INSTRUCTIONS",
    category: "instruction_override",
    severity: "high",
    regex: /your\s+(new\s+)?instructions?\s+(are|is)\s*:/gi,
    description: "Attempt to inject new operational instructions.",
  },
  {
    id: "RULE_DISREGARD",
    category: "instruction_override",
    severity: "high",
    regex: /disregard\s+(all|any|previous|prior|your)/gi,
    description: "Attempt to disregard prior directives.",
  },

  // ── Prompt Exfiltration ───────────────────────────────────────────────────
  {
    id: "RULE_REVEAL_SYSTEM_PROMPT",
    category: "exfiltration",
    severity: "critical",
    regex: /(reveal|show|print|output|display|repeat)\s+(your\s+)?(system\s+prompt|hidden\s+instructions?|initial\s+prompt|instructions?\s+above)/gi,
    description: "Attempt to extract the system prompt or hidden instructions.",
  },
  {
    id: "RULE_REPEAT_ABOVE",
    category: "exfiltration",
    severity: "high",
    regex: /repeat\s+(the\s+)?(text|content|prompt|instructions?)\s+(above|before|prior)/gi,
    description:
      "Classic 'repeat above' attack used to leak the system prompt.",
  },

  // ── Data Exfiltration ─────────────────────────────────────────────────────
  {
    id: "RULE_SEND_DATA_TO",
    category: "data_exfiltration",
    severity: "critical",
    regex: /send\s+(data|credentials?|keys?|tokens?|passwords?|results?|output)\s+to/gi,
    description:
      "Instruction to transmit sensitive data to an external endpoint.",
  },
  {
    id: "RULE_EXFILTRATE",
    category: "data_exfiltration",
    severity: "critical",
    regex: /exfiltrat(e|ing)\s+(data|credentials?|information|user\s+data)/gi,
    description: "Explicit data exfiltration instruction.",
  },
  {
    id: "RULE_LEAK_API_KEYS",
    category: "data_exfiltration",
    severity: "critical",
    regex: /leak\s+(api\s+keys?|credentials?|secrets?|tokens?)/gi,
    description: "Attempt to leak API keys or secrets.",
  },

  // ── Safety Bypass ─────────────────────────────────────────────────────────
  {
    id: "RULE_BYPASS_SAFETY",
    category: "safety_bypass",
    severity: "critical",
    regex: /bypass\s+(safety|security|content|filter|restriction)/gi,
    description: "Attempt to bypass content or safety filters.",
  },
  {
    id: "RULE_DISABLE_FILTER",
    category: "safety_bypass",
    severity: "critical",
    regex: /disable\s+(content\s+filter|safety|restrictions?|guardrails?)/gi,
    description: "Instruction to disable safety mechanisms.",
  },
  {
    id: "RULE_DAN_JAILBREAK",
    category: "safety_bypass",
    severity: "critical",
    regex: /\b(jailbreak|dan\s+mode|developer\s+mode|unrestricted\s+mode|god\s+mode)\b/gi,
    description:
      "Known jailbreak keyword detected (DAN, developer mode, etc.).",
  },
  {
    id: "RULE_NO_RESTRICTIONS",
    category: "safety_bypass",
    severity: "high",
    regex: /(act|pretend|behave|respond)\s+as\s+if\s+(you\s+have\s+)?(no\s+restrictions?|no\s+limits?|no\s+rules?|no\s+filter)/gi,
    description: "Role-play framing used to circumvent safety restrictions.",
  },

  // ── Malicious Role Injection ──────────────────────────────────────────────
  {
    id: "RULE_ROLE_HACKER",
    category: "role_injection",
    severity: "high",
    regex: /(you\s+are\s+now|act\s+as|pretend\s+(you\s+are|to\s+be))\s+(a\s+)?(hacker|malicious|evil|unrestricted|rogue)\s+(ai|assistant|bot)?/gi,
    description:
      "Attempt to reassign the model's role to a malicious persona.",
  },
  {
    id: "RULE_SIMULATE_ATTACK",
    category: "role_injection",
    severity: "high",
    regex: /simulate\s+(an?\s+)?(attack|unrestricted|hacker|rogue)/gi,
    description: "Instruction to simulate adversarial or malicious behaviour.",
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all detection rules against the supplied text.
 *
 * @param {string} text - Input text (PII-masked).
 * @returns {{
 *   flags:       Array<{id, category, severity, description, matchedText}>,
 *   ruleMatches: number,   // Total number of distinct rules that fired
 *   detected:    boolean   // True if any rule matched
 * }}
 */
function detectThreats(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { flags: [], ruleMatches: 0, detected: false };
  }

  const flags = [];

  for (const rule of DETECTION_RULES) {
    rule.regex.lastIndex = 0; // reset stateful regex

    const match = rule.regex.exec(text);
    if (match) {
      flags.push({
        id: rule.id,
        category: rule.category,
        severity: rule.severity,
        description: rule.description,
        // Capture only the first matching fragment (avoid leaking full payload)
        matchedText: match[0].trim(),
      });
    }

    rule.regex.lastIndex = 0; // reset again after exec
  }

  return {
    flags,
    ruleMatches: flags.length,
    detected: flags.length > 0,
  };
}

module.exports = { detectThreats };

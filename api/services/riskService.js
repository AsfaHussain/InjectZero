/**
 * riskService.js — Service: Risk Scoring Engine
 *
 * Computes a single composite risk score (0.0 – 1.0) from three independent
 * signal sources: rule-based detection, vector similarity, and PII presence.
 *
 * Formula
 * ───────
 *   Risk = 0.4 × normalisedRuleScore
 *        + 0.4 × vectorScore
 *        + 0.2 × piiPenalty
 *
 * Where:
 *   normalisedRuleScore = min(ruleMatches / RULE_SATURATION_POINT, 1.0)
 *   vectorScore         = raw cosine similarity from vectorService (0–1)
 *   piiPenalty          = 1.0 if PII was detected, 0.0 otherwise
 *
 * The rule score is normalised so that more than RULE_SATURATION_POINT
 * matches still caps at 1.0 (avoids unbounded inflation).
 *
 * Risk Band Interpretation:
 *   0.00 – 0.29  → LOW    (safe to forward)
 *   0.30 – 0.59  → MEDIUM (flag for review)
 *   0.60 – 0.79  → HIGH   (sanitise before forwarding)
 *   0.80 – 1.00  → CRITICAL (block by default)
 */

"use strict";

// After this many distinct rule matches the rule contribution is capped at 1.0
const RULE_SATURATION_POINT = 5;

// Weights must sum to 1.0
const WEIGHTS = {
  rules: 0.4,
  vector: 0.4,
  pii: 0.2,
};

/**
 * Determine risk band label from a numeric score.
 * @param {number} score
 * @returns {"LOW" | "MEDIUM" | "HIGH" | "CRITICAL"}
 */
function getRiskBand(score) {
  if (score >= 0.8) return "CRITICAL";
  if (score >= 0.6) return "HIGH";
  if (score >= 0.3) return "MEDIUM";
  return "LOW";
}

/**
 * Calculate a composite risk score for a single request.
 *
 * @param {object} params
 * @param {number}  params.ruleMatches   - Number of distinct rules that fired.
 * @param {number}  params.vectorScore   - Cosine similarity score (0–1).
 * @param {boolean} params.piiDetected   - Whether PII was found in the input.
 *
 * @returns {{
 *   riskScore:      number,   // Composite score rounded to 4 decimal places
 *   riskBand:       string,   // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
 *   breakdown: {
 *     ruleContribution:   number,
 *     vectorContribution: number,
 *     piiContribution:    number,
 *   },
 *   shouldBlock:    boolean   // True if score ≥ RISK_THRESHOLD env var (default 0.7)
 * }}
 */
function calculateRisk({ ruleMatches = 0, vectorScore = 0, piiDetected = false }) {
  // Normalise rule matches: cap at saturation point then scale to [0, 1]
  const normalisedRuleScore = Math.min(ruleMatches / RULE_SATURATION_POINT, 1.0);

  // PII contributes a flat penalty when detected
  const piiPenalty = piiDetected ? 1.0 : 0.0;

  // Weighted sum
  const ruleContribution   = WEIGHTS.rules  * normalisedRuleScore;
  const vectorContribution = WEIGHTS.vector * vectorScore;
  const piiContribution    = WEIGHTS.pii    * piiPenalty;

  const rawScore = ruleContribution + vectorContribution + piiContribution;

  // Clamp to [0, 1] and round to 4 decimal places
  const riskScore = Math.round(Math.min(rawScore, 1.0) * 10000) / 10000;
  const riskBand  = getRiskBand(riskScore);

  // Block threshold — configurable via environment variable
  const blockThreshold = parseFloat(process.env.RISK_THRESHOLD) || 0.7;

  return {
    riskScore,
    riskBand,
    breakdown: {
      ruleContribution:   Math.round(ruleContribution   * 10000) / 10000,
      vectorContribution: Math.round(vectorContribution * 10000) / 10000,
      piiContribution:    Math.round(piiContribution    * 10000) / 10000,
    },
    shouldBlock: riskScore >= blockThreshold,
  };
}

module.exports = { calculateRisk, getRiskBand };

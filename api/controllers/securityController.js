/**
 * securityController.js — Controller: Security Pipeline Orchestrator
 *
 * Coordinates the full 8-stage security pipeline for every inbound request.
 * Each stage is executed in sequence; its output is logged and passed to the
 * next stage. The controller surfaces a rich JSON response with full audit
 * metadata so callers can inspect every decision the gateway made.
 *
 * Pipeline stages
 * ───────────────
 *   1. Generate UUID
 *   2. Mask PII
 *   3. Vector similarity check
 *   4. Rule-based threat detection
 *   5. Risk scoring
 *   6. Input sanitization
 *   7. LLM call (skipped if shouldBlock = true)
 *   8. Return structured response
 */

"use strict";

const { generateRequestId } = require("../utils/uuid");
const { maskPII }            = require("../services/piiService");
const { checkVectorSimilarity } = require("../services/vectorService");
const { detectThreats }      = require("../services/detectionService");
const { calculateRisk }      = require("../services/riskService");
const { sanitizeInput }      = require("../services/sanitizeService");
const { callLLM }            = require("../services/llmService");

// ---------------------------------------------------------------------------
// Internal Metrics Store (In-memory)
// ---------------------------------------------------------------------------
const metrics = {
  totalRequests: 0,
  blockedRequests: 0,
  flaggedPII: 0,
  totalLatencyMs: 0,
  riskDistribution: {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  },
  startTime: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pretty-print a pipeline stage log line.
 * @param {string} requestId
 * @param {number} stage       - Stage number (1–8)
 * @param {string} name        - Stage name
 * @param {object} [data]      - Optional summary data to include
 */
function logStage(requestId, stage, name, data = {}) {
  const ts = new Date().toISOString();
  const summary = Object.keys(data).length
    ? " | " + JSON.stringify(data)
    : "";
  console.log(`[${ts}] [${requestId}] STAGE ${stage}: ${name}${summary}`);
}

// ---------------------------------------------------------------------------
// Main controller
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/analyze
 *
 * Accepts a JSON body: { input: string }
 * Returns the full pipeline audit response.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
async function analyzeRequest(req, res) {
  // ── Validate incoming payload ─────────────────────────────────────────────
  const { input } = req.body;

  if (typeof input !== "string" || input.trim() === "") {
    return res.status(400).json({
      error: "Bad Request",
      message: 'Field "input" is required and must be a non-empty string.',
    });
  }

  // Enforce a hard input length limit to prevent DoS via huge payloads
  const MAX_INPUT_LENGTH = parseInt(process.env.MAX_INPUT_LENGTH, 10) || 4096;
  if (input.length > MAX_INPUT_LENGTH) {
    return res.status(413).json({
      error: "Payload Too Large",
      message: `Input exceeds maximum allowed length of ${MAX_INPUT_LENGTH} characters.`,
    });
  }

  // ── Stage 1: Generate UUID ────────────────────────────────────────────────
  const uuid = generateRequestId();
  logStage(uuid, 1, "Generate UUID", { uuid });

  const pipelineStart = Date.now();

  try {
    // ── Stage 2: Mask PII ───────────────────────────────────────────────────
    const piiResult = maskPII(input);
    logStage(uuid, 2, "Mask PII", {
      detected: piiResult.detected,
      types: piiResult.detectedTypes,
    });

    // ── Stage 3: Vector Similarity Check ────────────────────────────────────
    const vectorResult = await checkVectorSimilarity(piiResult.maskedText);
    logStage(uuid, 3, "Vector Similarity", {
      score: vectorResult.similarityScore,
      isAttack: vectorResult.isAttack,
      closestPhrase: vectorResult.closestPhrase,
    });

    // ── Stage 4: Rule-Based Detection ───────────────────────────────────────
    const detectionResult = detectThreats(piiResult.maskedText);
    logStage(uuid, 4, "Rule-Based Detection", {
      ruleMatches: detectionResult.ruleMatches,
      detected: detectionResult.detected,
      flagIds: detectionResult.flags.map((f) => f.id),
    });

    // ── Stage 5: Risk Scoring ────────────────────────────────────────────────
    const riskResult = calculateRisk({
      ruleMatches: detectionResult.ruleMatches,
      vectorScore: vectorResult.similarityScore,
      piiDetected: piiResult.detected,
    });
    logStage(uuid, 5, "Risk Scoring", {
      riskScore: riskResult.riskScore,
      riskBand: riskResult.riskBand,
      shouldBlock: riskResult.shouldBlock,
    });

    // ── Stage 6: Input Sanitization ──────────────────────────────────────────
    const sanitizeResult = sanitizeInput(piiResult.maskedText);
    logStage(uuid, 6, "Sanitize Input", {
      replacements: sanitizeResult.replacementsCount,
      wasModified: sanitizeResult.wasModified,
    });

    // ── Stage 7: LLM Call ────────────────────────────────────────────────────
    let llmResponse = null;

    if (riskResult.shouldBlock) {
      // High-risk request — skip the LLM entirely
      logStage(uuid, 7, "LLM Call", {
        status: "SKIPPED",
        reason: `Risk score ${riskResult.riskScore} ≥ block threshold`,
      });
    } else {
      logStage(uuid, 7, "LLM Call", { status: "DISPATCHING" });
      llmResponse = await callLLM(sanitizeResult.sanitizedText);
      logStage(uuid, 7, "LLM Call", {
        status: "COMPLETE",
        provider: llmResponse.provider,
        latencyMs: llmResponse.latencyMs,
        usedFallback: llmResponse.usedFallback,
      });
    }

    // ── Stage 8: Return Structured Response ──────────────────────────────────
    const totalLatencyMs = Date.now() - pipelineStart;
    logStage(uuid, 8, "Response", { totalLatencyMs, blocked: riskResult.shouldBlock });

    // ── Update Metrics ──────────────────────────────────────────────────────
    metrics.totalRequests++;
    metrics.totalLatencyMs += totalLatencyMs;
    
    if (riskResult.shouldBlock) metrics.blockedRequests++;
    if (piiResult.detected) metrics.flaggedPII++;
    
    const band = riskResult.riskBand.toLowerCase();
    if (metrics.riskDistribution[band] !== undefined) {
      metrics.riskDistribution[band]++;
    }

    return res.status(200).json({
      uuid,
      timestamp: new Date().toISOString(),
      original_input: input,
      masked_input: piiResult.maskedText,
      sanitized_input: sanitizeResult.sanitizedText,

      pii: {
        detected: piiResult.detected,
        types: piiResult.detectedTypes,
      },

      vector: {
        similarity_score: vectorResult.similarityScore,
        closest_attack_phrase: vectorResult.closestPhrase,
        is_attack: vectorResult.isAttack,
      },

      flags: detectionResult.flags,
      rule_matches: detectionResult.ruleMatches,

      risk: {
        score: riskResult.riskScore,
        band: riskResult.riskBand,
        breakdown: riskResult.breakdown,
        blocked: riskResult.shouldBlock,
      },

      llm_response: riskResult.shouldBlock
        ? {
            blocked: true,
            reason: `Request blocked. Risk score ${riskResult.riskScore} (${riskResult.riskBand}) exceeded the configured threshold.`,
          }
        : {
            blocked: false,
            provider: llmResponse.provider,
            model: llmResponse.model,
            used_fallback: llmResponse.usedFallback,
            latency_ms: llmResponse.latencyMs,
            text: llmResponse.text,
          },

      pipeline_latency_ms: totalLatencyMs,
    });
  } catch (err) {
    console.error(`[${uuid}] PIPELINE ERROR: ${err.stack}`);
    return res.status(500).json({
      error: "Internal Server Error",
      uuid,
      message: "An unexpected error occurred in the security pipeline.",
    });
  }
}

/**
 * GET /api/v1/health
 * Simple health-check endpoint for load-balancers and container orchestrators.
 */
function healthCheck(req, res) {
  return res.status(200).json({
    status: "ok",
    service: "InjectZero AI Security Gateway",
    version: process.env.npm_package_version || "1.0.0",
    timestamp: new Date().toISOString(),
    provider: process.env.LLM_PROVIDER || "mock",
  });
}

/**
 * GET /api/v1/metrics
 * Returns real-time security pipeline statistics.
 */
function getMetrics(req, res) {
  const uptimeSeconds = Math.floor((new Date() - new Date(metrics.startTime)) / 1000);
  const avgLatency = metrics.totalRequests > 0 
    ? Math.round(metrics.totalLatencyMs / metrics.totalRequests) 
    : 0;

  return res.status(200).json({
    status: "ok",
    uptime_seconds: uptimeSeconds,
    stats: {
      total_requests: metrics.totalRequests,
      blocked_requests: metrics.blockedRequests,
      flagged_pii: metrics.flaggedPII,
      average_latency_ms: avgLatency,
      risk_breakdown: metrics.riskDistribution,
    },
    config: {
      provider: process.env.LLM_PROVIDER || "mock",
      risk_threshold: parseFloat(process.env.RISK_THRESHOLD) || 0.7,
    }
  });
}

module.exports = { analyzeRequest, healthCheck, getMetrics };

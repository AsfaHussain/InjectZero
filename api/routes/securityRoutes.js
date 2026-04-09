"use strict";

const { Router } = require("express");
const { analyzeRequest, healthCheck, getMetrics } = require("../controllers/securityController");

const router = Router();

/**
 * @swagger
 * /api/v1/analyze:
 *   post:
 *     summary: Analyze prompt for injection attack
 *     description: Detects prompt injection using embeddings and rules
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input:
 *                 type: string
 *                 example: ignore previous instructions
 *     responses:
 *       200:
 *         description: Successful response
 */

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
router.get("/health", healthCheck);

// Optional (fine to keep)
router.get("/metrics", getMetrics);

// ---------------------------------------------------------------------------
// Main analysis endpoint
// ---------------------------------------------------------------------------
router.post("/analyze", analyzeRequest);

// ---------------------------------------------------------------------------
// Method not allowed
// ---------------------------------------------------------------------------
router.all("/analyze", (req, res) => {
  res.status(405).json({
    error: "Method Not Allowed",
    message: `${req.method} is not supported on /api/v1/analyze. Use POST.`,
  });
});

module.exports = router;
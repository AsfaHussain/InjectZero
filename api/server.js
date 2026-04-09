/**
 * server.js — Entry Point: InjectZero API Server
 */

"use strict";

require("dotenv").config();

const express = require("express");
const helmet  = require("helmet");
const cors    = require("cors");
const morgan  = require("morgan");

// Swagger
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const securityRoutes = require("./routes/securityRoutes");

// ---------------------------------------------------------------------------
// App initialisation
// ---------------------------------------------------------------------------
const app  = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ---------------------------------------------------------------------------
// Swagger Configuration
// ---------------------------------------------------------------------------
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "InjectZero API",
      version: "1.0.0",
      description: "AI Security Gateway to detect prompt injection using embeddings",
    },
    servers: [
  {
    url: "/"
  }
],
  },

  // 🔥 FIX: include both routes + current file
  apis: ["./api/routes/*.js", "./server.js"],
};

const swaggerSpecs = swaggerJsdoc(swaggerOptions);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

// ---------------------------------------------------------------------------
// Swagger Route (UI)
// ---------------------------------------------------------------------------
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  explorer: true,
}));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use("/api/v1", securityRoutes);

// ---------------------------------------------------------------------------
// Root route
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.json({
    service: "InjectZero — AI Security Gateway for Agentic Systems",
    version: "1.0.0",
    endpoints: {
      health:  "GET  /api/v1/health",
      analyze: "POST /api/v1/analyze",
    },
    docs: `${process.env.BASE_URL || `http://localhost:${PORT}`}/api-docs`,
  });
});

// ---------------------------------------------------------------------------
// Health check (IMPORTANT for deployment platforms like Render)
// ---------------------------------------------------------------------------
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} does not exist.`,
  });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  console.error("[SERVER ERROR]", err.stack);

  const isDev = process.env.NODE_ENV !== "production";

  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: isDev ? err.message : "An unexpected error occurred.",
    ...(isDev && { stack: err.stack }),
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   InjectZero — AI Security Gateway  v1.0  ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`  ► Listening on  http://localhost:${PORT}`);
  console.log(`  ► Swagger Docs  http://localhost:${PORT}/api-docs`);
  console.log(`  ► Health Check  http://localhost:${PORT}/health`);
  console.log(`  ► Environment   ${process.env.NODE_ENV || "development"}`);
  console.log(`  ► LLM Provider  ${process.env.LLM_PROVIDER || "mock"}`);
  console.log(`  ► Risk Threshold ${process.env.RISK_THRESHOLD || "0.7"}`);
  console.log("─────────────────────────────────────────────");
});

module.exports = app;
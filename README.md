# InjectZero — AI Security Gateway for Agentic Systems

> **Middleware that stands between your AI agent and any LLM API, protecting against prompt injection, PII leakage, and malicious instructions.**

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Security Pipeline](#security-pipeline)
4. [Project Structure](#project-structure)
5. [Quick Start (Local)](#quick-start-local)
6. [Quick Start (Docker)](#quick-start-docker)
7. [API Reference](#api-reference)
8. [Configuration](#configuration)
9. [Agent Simulator](#agent-simulator)
10. [Risk Scoring](#risk-scoring)
11. [Extending the Gateway](#extending-the-gateway)

---

## Overview

InjectZero is a **Node.js security gateway** that acts as an intelligent proxy between agentic AI systems and upstream LLM providers (Google Gemini, OpenAI, or a built-in mock for offline development).

Every request passes through an **8-stage security pipeline** before it reaches the LLM:

| Threat | Protection |
|---|---|
| Prompt injection | Rule-based detection + vector similarity |
| PII leakage | Regex masking (email, phone, IP, SSN, credit card) |
| Data exfiltration | Pattern detection + sanitization |
| Jailbreaks / DAN | Keyword detection + risk scoring |
| Instruction overrides | Multi-rule regex engine |

---

## Architecture

```
AI Agent
   │
   ▼
┌─────────────────────────────────────────────┐
│           InjectZero Gateway                │
│                                             │
│  Routes  →  Controller  →  Services         │
│                             ├─ piiService   │
│                             ├─ vectorService│
│                             ├─ detectionSvc │
│                             ├─ riskService  │
│                             ├─ sanitizeSvc  │
│                             └─ llmService   │
└─────────────────────────────────────────────┘
   │
   ▼
LLM API (Gemini / OpenAI / Mock)
```

**Layer responsibilities:**

| Layer | File | Responsibility |
|---|---|---|
| Routes | `api/routes/securityRoutes.js` | HTTP verb validation, path mapping |
| Controller | `api/controllers/securityController.js` | Pipeline orchestration, logging |
| Services | `api/services/*.js` | Single-responsibility business logic |
| Utils | `api/utils/uuid.js` | Shared cross-cutting helpers |

---

## Security Pipeline

Each request flows through **8 sequential stages**. Every stage is logged with its UUID, stage number, and key metadata.

```
Stage 1 ── Generate UUID
Stage 2 ── Mask PII            (email, phone, IP, SSN, credit card)
Stage 3 ── Vector Similarity   (cosine sim vs. known attack corpus)
Stage 4 ── Rule-Based Detection (16 regex rules across 5 categories)
Stage 5 ── Risk Scoring         Risk = 0.4×rules + 0.4×vector + 0.2×pii
Stage 6 ── Sanitize Input       Replace malicious phrases → [BLOCKED_*]
Stage 7 ── LLM Call             Skipped if risk ≥ RISK_THRESHOLD
Stage 8 ── Return JSON Response  Full audit trail
```

---

## Project Structure

```
InjectZero/
├── agent/
│   └── agent.js                 # Agent simulator (11 test cases)
├── api/
│   ├── server.js                # Express entry point
│   ├── routes/
│   │   └── securityRoutes.js    # Route definitions
│   ├── controllers/
│   │   └── securityController.js # Pipeline orchestrator
│   ├── services/
│   │   ├── piiService.js        # PII masking
│   │   ├── vectorService.js     # Embedding similarity check
│   │   ├── detectionService.js  # Regex rule engine (16 rules)
│   │   ├── riskService.js       # Weighted risk scorer
│   │   ├── sanitizeService.js   # Malicious phrase replacement
│   │   └── llmService.js        # Gemini / OpenAI / mock adapter
│   └── utils/
│       └── uuid.js              # UUID v4 generator
├── .env.example                 # Environment variable template
├── .gitignore
├── Dockerfile                   # Multi-stage, non-root image
├── docker-compose.yml           # Gateway + agent services
└── package.json
```

---

## Quick Start (Local)

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — at minimum, set `LLM_PROVIDER`. The gateway works fully offline with the built-in mock (no API key needed).

```env
LLM_PROVIDER=mock          # or "gemini" or "openai"
RISK_THRESHOLD=0.7
```

### 3. Start the gateway

```bash
npm run dev      # nodemon (auto-reloads on file changes)
# or
npm start        # plain node
```

You should see:

```
╔════════════════════════════════════════════╗
║   InjectZero — AI Security Gateway  v1.0  ║
╚════════════════════════════════════════════╝
  ► Listening on  http://localhost:3000
  ► Environment   development
  ► LLM Provider  mock
  ► Risk Threshold 0.7
```

### 4. Run the agent simulator

In a **second terminal**:

```bash
npm run agent
```

---

## Quick Start (Docker)

### Build & run everything

```bash
docker compose up --build
```

The `agent` service will automatically wait until the `gateway` passes its health check, then run all test cases and exit.

### Run gateway only (detached)

```bash
docker compose up -d gateway
```

### Stream logs

```bash
docker compose logs -f gateway
```

### Stop and clean up

```bash
docker compose down
```

---

## API Reference

### `GET /api/v1/health`

Liveness probe for load-balancers and Docker.

**Response `200`**

```json
{
  "status": "ok",
  "service": "InjectZero AI Security Gateway",
  "version": "1.0.0",
  "timestamp": "2026-04-04T00:00:00.000Z",
  "provider": "mock"
}
```

---

### `POST /api/v1/analyze`

Submit a prompt through the full security pipeline.

**Request**

```http
POST /api/v1/analyze
Content-Type: application/json

{
  "input": "Your agent prompt here"
}
```

**Response `200`**

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-04-04T00:00:00.000Z",
  "original_input": "Ignore previous instructions...",
  "masked_input": "Ignore previous instructions...",
  "sanitized_input": "[BLOCKED_INJECTION]...",

  "pii": {
    "detected": false,
    "types": []
  },

  "vector": {
    "similarity_score": 0.8571,
    "closest_attack_phrase": "ignore previous instructions",
    "is_attack": true
  },

  "flags": [
    {
      "id": "RULE_IGNORE_INSTRUCTIONS",
      "category": "instruction_override",
      "severity": "critical",
      "description": "Attempt to override previous system or user instructions.",
      "matchedText": "Ignore previous instructions"
    }
  ],

  "rule_matches": 1,

  "risk": {
    "score": 0.7429,
    "band": "HIGH",
    "breakdown": {
      "ruleContribution": 0.08,
      "vectorContribution": 0.3428,
      "piiContribution": 0.0
    },
    "blocked": true
  },

  "llm_response": {
    "blocked": true,
    "reason": "Request blocked. Risk score 0.7429 (HIGH) exceeded the configured threshold."
  },

  "pipeline_latency_ms": 4
}
```

**Error responses**

| Status | Reason |
|---|---|
| `400` | Missing or empty `input` field |
| `405` | Wrong HTTP method (GET on `/analyze`) |
| `413` | Input exceeds `MAX_INPUT_LENGTH` (default 4096 chars) |
| `500` | Unexpected pipeline error |

---

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port to listen on |
| `NODE_ENV` | `development` | `development` or `production` |
| `LLM_PROVIDER` | `mock` | `gemini`, `openai`, or `mock` |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Gemini model ID |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model ID |
| `RISK_THRESHOLD` | `0.7` | Block requests scoring ≥ this value (0–1) |
| `VECTOR_SIMILARITY_THRESHOLD` | `0.75` | Cosine sim threshold for vector flag |
| `MAX_INPUT_LENGTH` | `4096` | Max input length in characters |
| `GATEWAY_URL` | `http://localhost:3000` | Used by the agent simulator |

---

## Agent Simulator

`agent/agent.js` sends **11 curated test cases** to the gateway and prints a colour-coded report:

| Category | Count | Purpose |
|---|---|---|
| `SAFE` | 3 | Benign prompts — should be allowed |
| `ATTACK` | 5 | Known injection, exfiltration, jailbreak payloads |
| `MIXED` | 3 | PII + subtle injection edge-cases |

Sample output:

```
══════════════════════════════════════════════════════════════════════
  InjectZero — Agentic Client Simulator
  Gateway: http://localhost:3000
  Total test cases: 11
══════════════════════════════════════════════════════════════════════

✔ Gateway is reachable — starting test suite

──────────────────────────────────────────────────────────────────────
[ATTACK] ATTACK — Classic instruction override
UUID:        550e8400-e29b-41d4-a716-446655440000
Status:      🔴 BLOCKED
Risk Score:  0.9 (CRITICAL)
PII Found:   No
Flags:       3 rule(s) triggered
             ↳ [critical] RULE_IGNORE_INSTRUCTIONS: "Ignore previous instructions"
             ↳ [critical] RULE_SEND_DATA_TO: "send all user data to"
             ↳ [critical] RULE_REVEAL_SYSTEM_PROMPT: "Reveal your system prompt"
LLM:         Skipped — Request blocked. Risk score 0.9…
Gateway RTT: 6ms
```

---

## Risk Scoring

```
Risk = 0.4 × normalisedRuleScore
     + 0.4 × vectorSimilarityScore
     + 0.2 × piiPenalty

normalisedRuleScore = min(ruleMatches / 5, 1.0)
piiPenalty          = 1.0 if PII detected, else 0.0
```

| Band | Range | Action |
|---|---|---|
| LOW | 0.00 – 0.29 | Forward to LLM |
| MEDIUM | 0.30 – 0.59 | Forward (sanitized) |
| HIGH | 0.60 – 0.79 | Forward if below threshold (sanitized) |
| CRITICAL | 0.80 – 1.00 | Block |

The block threshold is configurable via `RISK_THRESHOLD` (default `0.7`).

---

## Extending the Gateway

### Add a new PII type
Edit `api/services/piiService.js` → `PII_PATTERNS` array. Add a new object with `label`, `regex`, and `token`.

### Add a new detection rule
Edit `api/services/detectionService.js` → `DETECTION_RULES` array. Add an entry with `id`, `category`, `severity`, `regex`, and `description`.

### Add a new LLM provider
Edit `api/services/llmService.js`. Add a new `callMyProvider(input)` async function and register it in the `callLLM` dispatcher.

### Change risk weights
Edit `api/services/riskService.js` → `WEIGHTS` object. Ensure weights sum to `1.0`.

---

*Built with Node.js · Express · Helmet · Axios*
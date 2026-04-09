# InjectZero — Project Context & Documentation

InjectZero is a modular, high-performance **AI Security Gateway** designed to protect Large Language Model (LLM) agents and applications from adversarial threats, PII leakage, and malicious instructions.

---

## 🏗️ System Architecture

The gateway operates as a middleware layer between the Agent (client) and the LLM provider (Gemini/OpenAI). Every request undergoes an **8-Stage Security Pipeline**.

### 1. The Security Pipeline
1.  **UUID Generation**: Unique request tracking for auditing.
2.  **PII Masking**: Regex-based detection for emails, phones, IPs, and SSNs.
3.  **Vector Similarity (Semantic Check)**: Semantic match against a corpus of known attack vectors using **Gemini `embedding-001`**. (Asynchronous)
4.  **Rule-Based Detection**: 16 categorized regex rules (Instruction Override, Safety Bypass, etc.).
5.  **Risk Scoring**: A composite weight-based calculation (Score 0.0 - 1.0).
6.  **Input Sanitization**: Control character stripping and malicious phrase blocking.
7.  **LLM Dispatch**: Normalized adapter-based call to Gemini/OpenAI (skipped if blocked).
8.  **Audit Response**: Structured JSON containing full pipeline metadata.

---

## 🛠️ Key Components

| Layer | Files | Responsibility |
| :--- | :--- | :--- |
| **Controllers** | `securityController.js` | Orchestrates the 8-stage pipeline and handles metrics. |
| **Services** | `vectorService.js` | Semantic embedding search using Google Gemini API. |
| | `piiService.js` | Entity detection and text masking. |
| | `detectionService.js` | Rule-based regex threat identification. |
| | `llmService.js` | LLM adapter with mock fallback logic. |
| | `riskService.js` | Weighted risk engine. |
| | `sanitizeService.js` | Text cleaning and phrase mutation. |
| **Utils** | `uuid.js` | Request ID generation. |

---

## 📈 Monitoring & Health

- **Health Check**: `GET /api/v1/health` (Liveness probe for Docker/K8s).
- **Real-time Metrics**: `GET /api/v1/metrics`. Tracks total requests, block rates, and risk distribution.
- **Dockerized**: Multi-stage build for production-ready performance and safety.

---

## ✅ Recent Enhancements (Last 24 Hours)

- **Semantic Vector Upgrade**: Replaced mock bag-of-words similarity with real **Gemini `embedding-001`** vectors.
- **Asynchronous Pipeline**: The controller now handles concurrent network calls for embeddings and LLM generation.
- **Metrics Engine**: Integrated an in-memory metrics store for real-time monitoring of gateway performance.
- **Startup Guides**: Created `START_GUIDE.md` and `MONITORING.md` for simplified developer onboarding.

---

## 🚀 Environment Configuration
Key variables in `.env`:
- `LLM_PROVIDER`: `gemini` | `openai` | `mock`
- `GEMINI_EMBEDDING_MODEL`: `embedding-001`
- `RISK_THRESHOLD`: `0.7`
- `VECTOR_SIMILARITY_THRESHOLD`: `0.75`

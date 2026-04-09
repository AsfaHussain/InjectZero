/**
 * llmService.js — Service: LLM API Adapter
 *
 * Sends the fully sanitized input to the configured LLM provider and returns
 * a normalised response object.  Falls back to a deterministic mock response
 * when no API key is configured — making local development and CI zero-cost.
 *
 * Supported providers (set LLM_PROVIDER in .env):
 *   "gemini"  — Google Gemini via REST (generateContent)
 *   "openai"  — OpenAI Chat Completions
 *   "mock"    — built-in mock (automatic fallback)
 */

"use strict";

const axios = require("axios");

// ---------------------------------------------------------------------------
// Provider: Mock (fallback)
// ---------------------------------------------------------------------------

/**
 * Return a canned mock response without making any network call.
 * @param {string} input
 * @returns {Promise<{text: string, provider: string, latencyMs: number}>}
 */
async function callMock(input) {
  // Simulate a small processing delay so loggers show realistic timing
  await new Promise((r) => setTimeout(r, 35));

  return {
    text: `[MOCK LLM] Received sanitized input (${input.length} chars). No real API key configured — set GEMINI_API_KEY or OPENAI_API_KEY in your .env file to enable live inference.`,
    provider: "mock",
    latencyMs: 35,
    model: "mock-v1",
  };
}

// ---------------------------------------------------------------------------
// Provider: Google Gemini
// ---------------------------------------------------------------------------

/**
 * Call the Google Gemini generateContent endpoint.
 * @param {string} input - Sanitized prompt text.
 * @returns {Promise<{text: string, provider: string, model: string, latencyMs: number}>}
 */
async function callGemini(input) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [{ text: input }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 512,
    },
    // Basic safety settings — the gateway is an additional layer on top
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],
  };

  const start = Date.now();
  const response = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 30_000,
  });

  const latencyMs = Date.now() - start;
  const candidate = response.data?.candidates?.[0];
  const text =
    candidate?.content?.parts?.map((p) => p.text).join("") ??
    "[Gemini returned no content]";

  return { text, provider: "gemini", model, latencyMs };
}

// ---------------------------------------------------------------------------
// Provider: OpenAI
// ---------------------------------------------------------------------------

/**
 * Call the OpenAI Chat Completions API.
 * @param {string} input - Sanitized prompt text.
 * @returns {Promise<{text: string, provider: string, model: string, latencyMs: number}>}
 */
async function callOpenAI(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful, concise AI assistant. The user prompt has already been filtered for safety by the InjectZero security gateway.",
      },
      { role: "user", content: input },
    ],
    max_tokens: 512,
    temperature: 0.7,
  };

  const start = Date.now();
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    body,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30_000,
    }
  );

  const latencyMs = Date.now() - start;
  const text =
    response.data?.choices?.[0]?.message?.content ??
    "[OpenAI returned no content]";

  return { text, provider: "openai", model, latencyMs };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch a sanitized prompt to the configured LLM provider.
 * Automatically falls back to the mock provider when:
 *   - LLM_PROVIDER is "mock"
 *   - The required API key is absent
 *   - The upstream call throws a network / API error
 *
 * @param {string} sanitizedInput - The fully sanitised prompt.
 * @returns {Promise<{
 *   text:       string,   // LLM reply text
 *   provider:   string,   // "gemini" | "openai" | "mock"
 *   model:      string,
 *   latencyMs:  number,
 *   usedFallback: boolean
 * }>}
 */
async function callLLM(sanitizedInput) {
  const provider = (process.env.LLM_PROVIDER || "mock").toLowerCase();

  // Determine whether a live key is available for the chosen provider
  const hasGeminiKey =
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== "your_gemini_api_key_here";
  const hasOpenAIKey =
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY !== "your_openai_api_key_here";

  try {
    if (provider === "gemini" && hasGeminiKey) {
      const result = await callGemini(sanitizedInput);
      return { ...result, usedFallback: false };
    }

    if (provider === "openai" && hasOpenAIKey) {
      const result = await callOpenAI(sanitizedInput);
      return { ...result, usedFallback: false };
    }

    // No valid key → mock
    const result = await callMock(sanitizedInput);
    return { ...result, usedFallback: true };
  } catch (err) {
    // On upstream failure, fall back gracefully — never crash the gateway
    console.error(`[llmService] ${provider} call failed: ${err.message}`);
    const fallback = await callMock(sanitizedInput);
    return {
      ...fallback,
      text: `[FALLBACK] LLM provider error: ${err.message}. ${fallback.text}`,
      usedFallback: true,
    };
  }
}

module.exports = { callLLM };

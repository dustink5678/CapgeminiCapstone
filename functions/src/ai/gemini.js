const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  GEMINI_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_TIMEOUT_MS,
  GEMINI_MAX_RETRIES,
} = require("../config");
const { generateMockJson } = require("./geminiMock");

function getApiKey() {
  return process.env.GEMINI_API_KEY || "";
}

/**
 * Resolve mode:
 * - GEMINI_MODE=mock|live|off wins when set
 * - else: no key → mock; key present → live
 */
function resolveMode() {
  const explicit = (process.env.GEMINI_MODE || "").toLowerCase().trim();
  if (explicit === "mock" || explicit === "live" || explicit === "off") return explicit;
  return getApiKey() ? "live" : "mock";
}

function extractJson(text) {
  if (!text) throw new Error("Empty Gemini response");
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  const start =
    raw.indexOf("{") >= 0 && (raw.indexOf("[") < 0 || raw.indexOf("{") < raw.indexOf("["))
      ? raw.indexOf("{")
      : raw.indexOf("[");
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (start < 0 || end < 0) throw new Error("No JSON in Gemini response");
  const slice = raw.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (err) {
    throw new Error(`Invalid JSON in Gemini response (${err.message})`);
  }
}

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Gemini timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function buildGenerationConfig() {
  const config = {
    temperature: 0.3,
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    responseMimeType: "application/json",
  };
  // Prefer no thinking budget for structured JSON (supported on Gemini 2.5+/3.x).
  config.thinkingConfig = { thinkingBudget: 0 };
  return config;
}

/**
 * One finite model call (mock or live). At most one retry for live.
 * Never leaves background work after return.
 */
async function generateJson({ system, user, schemaHint }) {
  const mode = resolveMode();

  if (mode === "off") {
    return {
      ok: false,
      error: "GEMINI_MODE=off",
      data: null,
      mode,
      metrics: { model: "off", promptTokens: 0, completionTokens: 0, latencyMs: 0 },
    };
  }

  if (mode === "mock") {
    return generateMockJson({ system, user, schemaHint });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return generateMockJson({ system, user, schemaHint });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: buildGenerationConfig(),
  });

  const prompt = [
    system,
    schemaHint
      ? `Respond with JSON only matching this shape: ${schemaHint}. Keep reasons under 40 words.`
      : "Respond with JSON only. Keep reasons under 40 words.",
    "",
    user,
  ].join("\n");

  const promptTokens = estimateTokens(prompt);
  let lastError = null;
  const started = Date.now();

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS);
      const finishReason = result.response.candidates?.[0]?.finishReason;
      const text = result.response.text();
      if (finishReason === "MAX_TOKENS") {
        // Still try to parse; if truncated, extractJson throws and we retry.
        try {
          const data = extractJson(text);
          return {
            ok: true,
            data,
            model: GEMINI_MODEL,
            mode: "live",
            metrics: {
              model: GEMINI_MODEL,
              promptTokens,
              completionTokens: estimateTokens(text),
              latencyMs: Date.now() - started,
              attempt: attempt + 1,
              finishReason,
            },
          };
        } catch (parseErr) {
          throw new Error(`Truncated Gemini JSON (MAX_TOKENS): ${parseErr.message}`);
        }
      }
      const data = extractJson(text);
      return {
        ok: true,
        data,
        model: GEMINI_MODEL,
        mode: "live",
        metrics: {
          model: GEMINI_MODEL,
          promptTokens,
          completionTokens: estimateTokens(text),
          latencyMs: Date.now() - started,
          attempt: attempt + 1,
          finishReason,
        },
      };
    } catch (err) {
      lastError = err;
    }
  }

  return {
    ok: false,
    error: lastError?.message || "Gemini failed",
    data: null,
    mode: "live",
    metrics: {
      model: GEMINI_MODEL,
      promptTokens,
      completionTokens: 0,
      latencyMs: Date.now() - started,
    },
  };
}

module.exports = { generateJson, getApiKey, resolveMode };

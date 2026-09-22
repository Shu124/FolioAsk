import { HttpError } from "./http.ts";

export const AI_LIMITS = {
  "gemini-3.5-flash-lite": { rpm: 13, tpm: 225_000, rpd: 450 },
  "gemini-embedding-001": { rpm: 90, tpm: 27_000, rpd: 900 },
} as const;
export type FreeModel = keyof typeof AI_LIMITS;
export type CapacityState = "available" | "warning" | "paused";
export interface AiCapacity {
  state: CapacityState | "unavailable" | "simulated";
}
export interface AiQuota {
  reserve(model: FreeModel, requests: number, tokens: number): Promise<void>;
  snapshot(): Promise<AiCapacity>;
}

export function capacityUnavailable() {
  return new HttpError(
    503,
    "Free AI usage tracking is unavailable. Your draft is preserved; no answer allowance was used.",
    "AI_TRACKING_UNAVAILABLE",
  );
}

// This is deliberately an overestimate, not Google's tokenizer: count all UTF-8
// bytes (including prompts, schema and history), plus framing per request item.
export function estimatedInputTokens(body: unknown, requests = 1): number {
  return new TextEncoder().encode(JSON.stringify(body)).length + 256 * requests;
}

export function checkRequestSize(
  model: FreeModel,
  requests: number,
  tokens: number,
) {
  const caps = AI_LIMITS[model];
  if (
    !Number.isSafeInteger(requests) ||
    requests < 1 ||
    !Number.isSafeInteger(tokens) ||
    tokens < 1 ||
    requests > caps.rpm ||
    tokens > caps.tpm
  )
    throw new HttpError(
      413,
      "This document or question exceeds the free AI processing budget. Try a smaller approved document or a shorter question. Your draft is preserved; no answer allowance was used.",
      "AI_REQUEST_TOO_LARGE",
    );
}

// The RPC's only positive admission result must be explicit. Missing migrations,
// timeouts and malformed responses must never enable an unmetered fallback.
export function sharedAiQuota(
  call: (name: string, body: unknown) => Promise<unknown>,
): AiQuota {
  return {
    async reserve(model, requests, tokens) {
      checkRequestSize(model, requests, tokens);
      let result;
      const started = performance.now();
      try {
        result = await call("folio_reserve_ai", {
          p_model: model,
          p_requests: requests,
          p_tokens: tokens,
        });
      } catch {
        throw capacityUnavailable();
      }
      if (performance.now() - started > 30_000) throw capacityUnavailable();
      if (
        typeof result !== "object" ||
        result === null ||
        !("allowed" in result)
      )
        throw capacityUnavailable();
      if (result.allowed === false)
        throw new HttpError(
          429,
          "Shared free AI capacity is paused. Wait at least two minutes and retry; daily limits reset at midnight Pacific time. Upgrading cannot bypass this safeguard. Your draft is preserved; no answer allowance was used.",
          "AI_CAPACITY_PAUSED",
        );
      if (result.allowed !== true) throw capacityUnavailable();
    },
    async snapshot() {
      try {
        const result = await call("folio_ai_capacity", {});
        if (
          typeof result === "object" &&
          result !== null &&
          "state" in result &&
          (result.state === "available" ||
            result.state === "warning" ||
            result.state === "paused")
        )
          return { state: result.state };
      } catch {
        /* Report unavailable without disrupting saved work. */
      }
      return { state: "unavailable" };
    },
  };
}

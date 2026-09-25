import { createApi } from "../../src/server/api";
import {
  supabaseAdapters,
  type SupabaseConfig,
} from "../../src/server/supabase";
import { r2Originals, type OriginalBucket } from "../../src/server/r2";
import { unpaidGemini } from "../../src/server/gemini";

export async function onRequest(context: {
  request: Request;
  env: Partial<SupabaseConfig> & {
    ORIGINALS?: OriginalBucket;
    APPROVED_PUBLIC_HASHES?: string;
    GEMINI_FREE_API_KEY?: string;
    GEMINI_FREE_PROJECT_CONFIRMED?: string;
  };
}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = context.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    return Response.json(
      {
        error:
          "Sign-in is not configured yet. The guided demo remains available.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  const adapters = supabaseAdapters({
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  });
  return createApi({
    ...adapters,
    activity: { store: adapters.store },
    answers: {
      store: adapters.store,
      provider:
        context.env.GEMINI_FREE_API_KEY &&
        context.env.GEMINI_FREE_PROJECT_CONFIRMED === "yes"
          ? unpaidGemini(context.env.GEMINI_FREE_API_KEY, adapters.aiQuota)
          : undefined,
    },
    documents: context.env.ORIGINALS
      ? {
          store: adapters.store,
          blobs: r2Originals(context.env.ORIGINALS),
          approvedHashes: (context.env.APPROVED_PUBLIC_HASHES || "")
            .split(",")
            .map((hash) => hash.trim())
            .filter(Boolean),
        }
      : undefined,
  })(context.request);
}

import { createApi } from "../../src/server/api";
import {
  supabaseAdapters,
  type SupabaseConfig,
} from "../../src/server/supabase";

export async function onRequest(context: {
  request: Request;
  env: Partial<SupabaseConfig>;
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
  return createApi(
    supabaseAdapters({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }),
  )(context.request);
}

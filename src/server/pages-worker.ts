import { onRequest } from "../../functions/api/[[path]].ts";

type PagesEnvironment = Parameters<typeof onRequest>[0]["env"] & {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export default {
  fetch(request: Request, env: PagesEnvironment): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/"))
      return onRequest({ request, env });
    return env.ASSETS.fetch(request);
  },
};

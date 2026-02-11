import { createMiddleware } from "hono/factory";
import { verifyJwt } from "../../shared/jwt";
import type { WorkerEnv } from "./env";
import { SESSION_COOKIE_REGEX } from "./session";

export const authMiddleware = createMiddleware<WorkerEnv>(async (c, next) => {
  const sessionCookie = c.req
    .header("cookie")
    ?.match(SESSION_COOKIE_REGEX)?.[1];

  if (!sessionCookie) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const claims = await verifyJwt(sessionCookie, {
      secret: c.env.JWT_SECRET,
      expiresInSeconds: 3600,
      audience: "markdown.party",
      issuer: "markdown.party",
    });

    c.set("userId", claims.userId);
    c.set("login", claims.login);
    c.set("avatarUrl", claims.avatarUrl);

    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

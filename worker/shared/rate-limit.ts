import { createMiddleware } from "hono/factory";
import type { WorkerEnv } from "./env";

interface RateLimitOptions {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
}

function getClientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  return createMiddleware<WorkerEnv>(async (c, next) => {
    const now = Date.now();
    const windowMs = options.windowSeconds * 1000;
    const bucket = Math.floor(now / windowMs);
    const ip = getClientIp(c.req.raw.headers);
    const key = `rl:${options.keyPrefix}:${ip}:${bucket}`;

    const currentRaw = await c.env.SESSION_KV.get(key);
    const current = Number.parseInt(currentRaw ?? "0", 10);
    const nextCount = Number.isNaN(current) ? 1 : current + 1;

    if (current >= options.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket * windowMs + windowMs - now) / 1000)
      );
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    await c.env.SESSION_KV.put(key, String(nextCount), {
      expirationTtl: options.windowSeconds + 5,
    });

    await next();
  });
}

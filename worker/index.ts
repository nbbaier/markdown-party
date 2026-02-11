import { Hono } from "hono";
import { routePartykitRequest } from "partyserver";

// biome-ignore lint/performance/noBarrelFile: we need to re-export the DocRoom class
export { DocRoom } from "./doc-room";

import authRoutes from "./routes/auth";
import docRoutes, { handleRawDoc } from "./routes/docs";
import { csrfMiddleware } from "./shared/csrf";
import type { WorkerEnv } from "./shared/env";

const app = new Hono<WorkerEnv>();

// Security headers middleware
app.use("*", async (c, next) => {
  await next();
  c.header("Referrer-Policy", "strict-origin");
  c.header(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");

  // Only set CSP on non-HTML responses. The SPA fallback serves HTML that
  // includes Vite-injected inline scripts in dev mode, which script-src 'self'
  // would block. In production the built HTML has no inline scripts, but CSP
  // for the page is better handled via <meta> tag or Cloudflare configuration.
  const contentType = c.res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    c.header(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https://avatars.githubusercontent.com data:",
        "connect-src 'self' wss://*.markdown.party wss://localhost:*",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://github.com",
      ].join("; ")
    );
  }
});

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

// CSRF protection on state-changing API routes
app.use("/api/docs", csrfMiddleware);
app.use("/api/docs/*", csrfMiddleware);
app.use("/api/auth/logout", csrfMiddleware);
app.use("/api/auth/refresh", csrfMiddleware);

app.route("/api/auth", authRoutes);
app.route("/api/docs", docRoutes);

// Raw markdown endpoint (non-API route)
// biome-ignore lint/suspicious/useAwait: Hono requires async for route handlers
app.get("/:doc_id/raw", async (c) => {
  const docId = c.req.param("doc_id");
  return handleRawDoc(c, docId);
});

app.all("/parties/*", async (c) => {
  const url = new URL(c.req.url);
  const isUpgrade = c.req.header("upgrade")?.toLowerCase() === "websocket";
  console.log(
    `[Worker] /parties/* hit: ${url.pathname}, isWebSocket: ${isUpgrade}`
  );
  const response = await routePartykitRequest(c.req.raw, c.env);
  if (response) {
    console.log(`[Worker] /parties/* response status: ${response.status}`);
    return response;
  }
  console.log("[Worker] /parties/* no response from routePartykitRequest");
  return c.text("Not Found", 404);
});

// SPA fallback: serve index.html for all unmatched routes
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

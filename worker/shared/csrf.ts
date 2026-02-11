import type { Context, Next } from "hono";

const CSRF_COOKIE_NAME = "__csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_COOKIE_REGEX = /__csrf=([^;]+)/;

export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function setCsrfCookie(c: Context, token: string): void {
  c.header(
    "Set-Cookie",
    [
      `${CSRF_COOKIE_NAME}=${token}`,
      "Path=/",
      "SameSite=Strict",
      "Secure",
      "Max-Age=3600",
    ].join("; "),
    { append: true }
  );
}

export async function csrfMiddleware(c: Context, next: Next): Promise<void> {
  const method = c.req.method.toUpperCase();
  if (
    method !== "POST" &&
    method !== "PUT" &&
    method !== "DELETE" &&
    method !== "PATCH"
  ) {
    await next();
    return;
  }

  const cookieHeader = c.req.header("cookie") ?? "";
  const match = cookieHeader.match(CSRF_COOKIE_REGEX);
  let cookieToken = match?.[1];

  // Issue CSRF cookie to all visitors on first request if not present.
  // This ensures anonymous users have CSRF protection for state-changing operations.
  if (!cookieToken) {
    cookieToken = generateCsrfToken();
    setCsrfCookie(c, cookieToken);
  }

  const headerToken = c.req.header(CSRF_HEADER_NAME);

  if (!headerToken || cookieToken !== headerToken) {
    c.status(403);
    c.header("Content-Type", "application/json");
    c.body(JSON.stringify({ error: "CSRF token mismatch" }));
    return;
  }

  await next();
}

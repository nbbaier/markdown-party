const CSRF_COOKIE_REGEX = /__csrf=([^;]+)/;

function getCsrfToken(): string | null {
  const match = document.cookie.match(CSRF_COOKIE_REGEX);
  return match?.[1] ?? null;
}

export function fetchWithCsrf(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();

  if (method === "GET" || method === "HEAD") {
    return fetch(input, init);
  }

  const csrfToken = getCsrfToken();
  const headers = new Headers(init?.headers);

  if (csrfToken) {
    headers.set("x-csrf-token", csrfToken);
  }

  return fetch(input, { ...init, headers });
}

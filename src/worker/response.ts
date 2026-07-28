export const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
} as const;

export type RedirectOptions = {
  status?: 301 | 302;
  cacheControl?: string;
};

export function secure(response: Response, status = response.status): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status,
    statusText: status === response.status ? response.statusText : undefined,
    headers,
  });
}

export function redirect(location: string, options: RedirectOptions = {}): Response {
  const headers = new Headers({ Location: location });
  if (options.cacheControl) headers.set("Cache-Control", options.cacheControl);
  return secure(new Response(null, { status: options.status ?? 302, headers }));
}

export function requestAt(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

export async function brandedNotFound(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = "/404/";
  const response = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
  return secure(response, 404);
}

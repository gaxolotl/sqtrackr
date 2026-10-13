export type ApiOptions = RequestInit & {
  auth?: boolean;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiOrigin() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    // Pinned API URL is required in production so DNS-rebinding or a
    // hardcoded :3001 fallback cannot point the client at an attacker host.
    if (process.env.NODE_ENV === "production") return window.location.origin;
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return "http://localhost:3001";
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("sq-session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem("sq-session");
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  if (!path.startsWith("/")) {
    throw new ApiError("API path must start with /", 400);
  }
  const { auth = true, headers, ...requestOptions } = options;
  const session = getStoredSession();
  const requestHeaders = new Headers(headers);

  if (requestOptions.body && !(requestOptions.body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (auth && session?.token)
    requestHeaders.set("Authorization", `Bearer ${session.token}`);

  const response = await fetch(`${apiOrigin()}${path}`, {
    ...requestOptions,
    // The API tags JSON with ETags, and a cached 304 comes back with no body,
    // which this helper can't use. Always ask for a full response.
    cache: "no-store",
    headers: requestHeaders,
  });

  if (!response.ok) {
    // The token is dead (expired, revoked, or signed out everywhere): drop
    // the local session and bounce to login instead of leaving the user
    // stranded behind failing requests.
    if (response.status === 401 && auth !== false && getStoredSession()) {
      handleExpiredSession();
    }
    const text = await response.text();
    let message = text || `Request failed with status ${response.status}`;
    if (
      text &&
      response.headers.get("content-type")?.includes("application/json")
    ) {
      try {
        const parsed = JSON.parse(text) as { message?: unknown };
        if (typeof parsed?.message === "string" && parsed.message) {
          message = parsed.message;
        }
      } catch {
        message = text;
      }
    }
    throw new ApiError(message, response.status);
  }

  if (
    response.status === 204 ||
    response.headers.get("content-length") === "0"
  ) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json"))
    return response.json() as Promise<T>;
  return (await response.text()) as T;
}

export type AuthSession = {
  token: string;
  id: string;
  uid: string;
  username: string;
  role: "admin" | "staff" | "user";
};

export function canModerate(role?: AuthSession["role"] | string) {
  return role === "admin" || role === "staff";
}

export type AuthResponse = Omit<AuthSession, "role">;

let expiredRedirectArmed = true;

function isAuthPage(pathname: string) {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/verify-email")
  );
}

// Drops a dead local session and bounces to login once. Called on HTTP 401
// and when the stored JWT is past its expiry, so expired sessions sign the
// user out instead of stranding them.
export function handleExpiredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("sq-session");
  window.dispatchEvent(new Event("sq:session"));
  if (!expiredRedirectArmed) return;
  expiredRedirectArmed = false;
  window.setTimeout(() => {
    expiredRedirectArmed = true;
  }, 5000);
  if (isAuthPage(window.location.pathname)) return;
  // Full reload on purpose: it drops all in-memory auth state (router.push
  // would keep stale session context alive in already-mounted providers).
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login?expired=1";
}

export function isStoredSessionExpired(): boolean {
  const stored = getStoredSession();
  if (!stored?.token) return false;
  try {
    const encodedPayload = stored.token
      .split(".")[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/");
    const payload = JSON.parse(atob(encodedPayload)) as { exp?: number };
    return (
      typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()
    );
  } catch {
    return false;
  }
}

export function withRole(response: AuthResponse): AuthSession {
  try {
    const encodedPayload = response.token
      .split(".")[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/");
    const payload = JSON.parse(atob(encodedPayload)) as {
      role?: AuthSession["role"];
    };
    return { ...response, role: payload.role ?? "user" };
  } catch {
    return { ...response, role: "user" };
  }
}

import type { Database, PublicSpeakerProfile } from "./types";
import { PUBLIC_CONTENT_UPDATED_EVENT } from "./publicContentEvents";

type QueryResult<T = unknown> = { data: T | null; error: { message: string } | null };
type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown>; role?: string };
type AuthSession = { access_token: string; user: AuthUser; expires_at?: number };
type Order = { column: string; ascending?: boolean };

const getApiBaseUrl = () => {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  const normalized = configured && configured !== "/" ? configured.replace(/\/+$/, "") : "http://localhost:3001";
  return normalized;
};

const API_BASE_URL = getApiBaseUrl();
const AUTH_KEY = "localAuthSession";
const authListeners = new Set<(event: string, session: AuthSession | null) => void>();
const SESSION_DURATION_MS = 30 * 60 * 1000;

const getSessionExpiry = (accessToken: string) => {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.iat === "number" ? payload.iat * 1000 + SESSION_DURATION_MS : undefined;
  } catch {
    return undefined;
  }
};

const encodeStoragePath = (bucket: string, path: string) => {
  const cleanPath = path
    .replace(/^\/+/, "")
    .replace(new RegExp(`^${bucket.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\/`), "");

  return cleanPath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
};

const readSession = (): AuthSession | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    const session = raw ? JSON.parse(raw) as AuthSession : null;
    if (session && !session.expires_at) {
      session.expires_at = getSessionExpiry(session.access_token);
    }
    if (session?.expires_at && session.expires_at <= Date.now()) {
      window.localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
};

const writeSession = (session: AuthSession | null) => {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(AUTH_KEY);
  authListeners.forEach((listener) => listener(session ? "SIGNED_IN" : "SIGNED_OUT", session));
};

const request = async <T>(path: string, options: RequestInit = {}): Promise<QueryResult<T>> => {
  try {
    const session = readSession();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      cache: options.cache ?? "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return { data: null, error: { message: data?.message || response.statusText } };
    if (
      typeof window !== "undefined" &&
      options.method &&
      options.method !== "GET" &&
      /^\/data\/(?:site_data|website_content|speakers|media_partners|information_blocks)(?:\/|$)/.test(path)
    ) {
      window.dispatchEvent(new Event(PUBLIC_CONTENT_UPDATED_EVENT));
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "API request failed" } };
  }
};

class LocalQuery<T = unknown> implements PromiseLike<QueryResult<T>> {
  private filters: Record<string, unknown> = {};
  private orders: Order[] = [];
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: unknown;
  private singleResult = false;
  private onConflict?: string;

  constructor(private readonly table: string) {}

  select(..._columns: string[]) {
    return this;
  }

  insert(payload: unknown) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown, options: { onConflict?: string } = {}) {
    this.mode = "upsert";
    this.payload = payload;
    this.onConflict = options.onConflict;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters[column] = values;
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending });
    return this;
  }

  single() {
    this.singleResult = true;
    return this;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult<T>> {
    if (this.mode === "select") {
      const params = new URLSearchParams({
        filters: JSON.stringify(this.filters),
        order: JSON.stringify(this.orders),
      });
      const result = await request<T>(`/data/${this.table}?${params.toString()}`);
      return this.singleResult && Array.isArray(result.data)
        ? { ...result, data: (result.data[0] ?? null) as T }
        : result;
    }

    if (this.mode === "insert" || this.mode === "upsert") {
      const params = this.mode === "upsert"
        ? `?${new URLSearchParams({ upsert: "1", ...(this.onConflict ? { onConflict: this.onConflict } : {}) }).toString()}`
        : "";
      const result = await request<T>(`/data/${this.table}${params}`, {
        method: "POST",
        body: JSON.stringify(this.payload),
      });
      return this.singleResult && Array.isArray(result.data)
        ? { ...result, data: (result.data[0] ?? null) as T }
        : result;
    }

    const id = String(this.filters.id ?? "");
    if (!id) return { data: null, error: { message: "An id filter is required" } };

    if (this.mode === "update") {
      return request<T>(`/data/${this.table}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(this.payload),
      });
    }

    return request<T>(`/data/${this.table}/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

export const apiClient = {
  from: <T extends keyof Database["public"]["Tables"] & string>(table: T) => new LocalQuery<any>(table),
  rpc: (name: string, body: Record<string, unknown>) =>
    request(`/rpc/${name}`, { method: "POST", body: JSON.stringify(body) }),
  functions: {
    invoke: <T = unknown>(name: string, options: { body?: unknown } = {}) =>
      request<T>(`/functions/${name}`, { method: "POST", body: JSON.stringify(options.body ?? {}) }),
  },
  speakers: {
    getProfile: (id: string) =>
      request<PublicSpeakerProfile>(`/data/speakers/${encodeURIComponent(id)}/profile`),
  },
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, file: File, ..._args: unknown[]) => {
        const session = readSession();
        const formData = new FormData();
        formData.append("path", path);
        formData.append("file", file);

        try {
          const response = await fetch(`${API_BASE_URL}/storage/${bucket}/upload`, {
            method: "POST",
            headers: {
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: formData,
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || data?.error) {
            return { data: null, error: { message: data?.message || data?.error || response.statusText } };
          }
          return { data, error: null as { message: string } | null };
        } catch (error) {
          return { data: null, error: { message: error instanceof Error ? error.message : "File upload failed" } };
        }
      },
      createSignedUrl: async (path: string, ..._args: unknown[]) => {
        try {
          const session = readSession();
          const response = await fetch(`${API_BASE_URL}/storage/${bucket}/${encodeStoragePath(bucket, path)}`, {
            headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.url) {
            return { data: null, error: { message: payload?.message || "Could not create a download URL" } };
          }

          const signedUrl = String(payload.url).startsWith("http")
            ? payload.url
            : `${API_BASE_URL}${payload.url}`;
          return { data: { signedUrl }, error: null as { message: string } | null };
        } catch (error) {
          return { data: null, error: { message: error instanceof Error ? error.message : "Could not create a download URL" } };
        }
      },
    }),
  },
  channel: (..._args: unknown[]) => ({ on: (..._onArgs: unknown[]) => ({ subscribe: (..._subscribeArgs: unknown[]) => ({}) }) }),
  removeChannel: (..._args: unknown[]) => undefined,
  auth: {
    onAuthStateChange: (callback: (_event: string, session: AuthSession | null) => void) => {
      authListeners.add(callback);
      setTimeout(() => callback("INITIAL_SESSION", readSession()), 0);
      return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
    },
    getSession: async () => ({ data: { session: readSession() }, error: null as { message: string } | null }),
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await request<{ accessToken: string; user: AuthUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (error || !data) return { data: null, error };
      const session = { access_token: data.accessToken, user: data.user, expires_at: Date.now() + SESSION_DURATION_MS };
      writeSession(session);
      return { data: { session, user: data.user }, error: null as { message: string } | null };
    },
    signOut: async () => {
      writeSession(null);
      return { error: null as { message: string } | null };
    },
  },
};

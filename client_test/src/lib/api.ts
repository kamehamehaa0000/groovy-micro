import { useAuthStore } from "../stores/auth.store";

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Universal Fetch wrapper with automatic credentials and silent 401 refresh retry.
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

  // Attach access token from Zustand store if available
  const token = useAuthStore.getState().accessToken;
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: "include", // Essential for httpOnly refresh_token cookie
  };

  const response = await fetch(endpoint, config);

  // If 401 Unauthorized and not already refreshing / logging in
  if (
    response.status === 401 &&
    !endpoint.includes("/auth/login") &&
    !endpoint.includes("/auth/register") &&
    !endpoint.includes("/auth/refresh")
  ) {
    if (isRefreshing) {
      // Queue requests while refresh is in flight
      return new Promise<T>((resolve, reject) => {
        failedQueue.push({
          resolve: (newToken) => {
            headers.set("Authorization", `Bearer ${newToken}`);
            resolve(apiFetch<T>(endpoint, { ...options, headers }));
          },
          reject,
        });
      });
    }

    isRefreshing = true;

    try {
      const refreshRes = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        const newAccessToken = data.accessToken;
        useAuthStore.getState().setAccessToken(newAccessToken);

        processQueue(null, newAccessToken);

        // Retry original request with fresh token
        headers.set("Authorization", `Bearer ${newAccessToken}`);
        return await apiFetch<T>(endpoint, { ...options, headers });
      } else {
        // Refresh failed -> session expired or revoked
        useAuthStore.getState().clearAuth();
        processQueue(new Error("Session expired"), null);
        throw new Error("Session expired. Please log in again.");
      }
    } catch (refreshErr) {
      useAuthStore.getState().clearAuth();
      processQueue(refreshErr, null);
      throw refreshErr;
    } finally {
      isRefreshing = false;
    }
  }

  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" && data?.message
        ? data.message
        : response.statusText;
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export const api = {
  get: <T = any>(url: string, options?: RequestInit) =>
    apiFetch<T>(url, { ...options, method: "GET" }),
  post: <T = any>(url: string, body?: any, options?: RequestInit) =>
    apiFetch<T>(url, {
      ...options,
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  patch: <T = any>(url: string, body?: any, options?: RequestInit) =>
    apiFetch<T>(url, {
      ...options,
      method: "PATCH",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  delete: <T = any>(url: string, options?: RequestInit) =>
    apiFetch<T>(url, { ...options, method: "DELETE" }),
};

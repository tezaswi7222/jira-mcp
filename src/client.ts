import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type AuthConfig, ATLASSIAN_API_URL, getAuthOrThrow } from "./auth.js";
import { textResult, errorToResult } from "./utils.js";

// ============ Retry Interceptor ============

interface RetryConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
}

const MAX_RETRIES = 3;

function addRetryInterceptor(client: AxiosInstance): void {
  client.interceptors.response.use(undefined, async (error) => {
    const config = error.config as RetryConfig | undefined;
    if (!config) return Promise.reject(error);

    const retryCount = config.__retryCount ?? 0;
    if (retryCount >= MAX_RETRIES) return Promise.reject(error);

    const status = error.response?.status;
    if (status === 429 || (status && status >= 500)) {
      config.__retryCount = retryCount + 1;

      // Respect Retry-After header, otherwise use exponential backoff with jitter
      const retryAfterHeader = error.response?.headers?.["retry-after"];
      let delay: number;
      if (retryAfterHeader) {
        delay = parseInt(retryAfterHeader, 10) * 1000;
        if (isNaN(delay)) delay = 1000;
      } else {
        const baseDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        delay = baseDelay + Math.random() * 1000; // jitter
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      return client.request(config);
    }

    return Promise.reject(error);
  });
}

// ============ Client Cache ============

let _cachedClient: { authKey: string; client: AxiosInstance } | null = null;

function authCacheKey(auth: AuthConfig): string {
  if (auth.type === "basic") {
    return `basic:${auth.baseUrl}:${auth.email}`;
  }
  return `oauth:${auth.cloudId}:${auth.accessToken.slice(0, 16)}`;
}

function addVerboseLogging(client: AxiosInstance): void {
  client.interceptors.request.use((config) => {
    if ((global as any).VERBOSE) {
      console.error(`\x1b[36m[JIRA-MCP] -> ${config.method?.toUpperCase()} ${config.url}\x1b[0m`);
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      if ((global as any).VERBOSE) {
        console.error(`\x1b[32m[JIRA-MCP] <- ${response.status} ${response.statusText}\x1b[0m`);
      }
      return response;
    },
    (error) => {
      if ((global as any).VERBOSE) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        console.error(`\x1b[31m[JIRA-MCP] !! ${status || "Error"} ${statusText || error.message}\x1b[0m`);
        if (error.response?.data) {
          console.error(`\x1b[2m[JIRA-MCP] Response body: ${JSON.stringify(error.response.data)}\x1b[0m`);
        }
      }
      return Promise.reject(error);
    }
  );
}

function createClientInternal(auth: AuthConfig): AxiosInstance {
  let client: AxiosInstance;

  if (auth.type === "basic") {
    client = axios.create({
      baseURL: auth.baseUrl,
      auth: {
        username: auth.email,
        password: auth.apiToken,
      },
      headers: {
        Accept: "application/json",
      },
    });
  } else {
    client = axios.create({
      baseURL: `${ATLASSIAN_API_URL}/ex/jira/${auth.cloudId}`,
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: "application/json",
      },
    });
  }

  addVerboseLogging(client);
  addRetryInterceptor(client);
  return client;
}

export function createClient(auth: AuthConfig): AxiosInstance {
  const key = authCacheKey(auth);
  if (_cachedClient && _cachedClient.authKey === key) {
    return _cachedClient.client;
  }
  const client = createClientInternal(auth);
  _cachedClient = { authKey: key, client };
  return client;
}

// ============ Tool Handler Wrappers ============

/**
 * Wraps a tool handler with auth resolution, client creation, and error handling.
 * The handler receives the Axios client and params, and returns a plain value
 * that gets wrapped in textResult automatically.
 */
export function withClient<T = Record<string, never>>(
  handler: (client: AxiosInstance, auth: AuthConfig, params: T) => Promise<unknown>
): (params: T) => Promise<CallToolResult> {
  return async (params: T): Promise<CallToolResult> => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const result = await handler(client, auth, params);
      return textResult(result);
    } catch (error) {
      return textResult(errorToResult(error));
    }
  };
}

import axios, { AxiosError, AxiosInstance } from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ============ Auth Types ============

type BasicAuthConfig = {
  type: "basic";
  baseUrl: string;
  email: string;
  apiToken: string;
};

type OAuthConfig = {
  type: "oauth";
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
  cloudId: string;
  expiresAt?: number;
};

type AuthConfig = BasicAuthConfig | OAuthConfig;

const AUTH_SERVICE = "jira-mcp";
const AUTH_ACCOUNT = "default";
const ACCEPTANCE_FIELD = (process.env.JIRA_ACCEPTANCE_CRITERIA_FIELD || "").trim();

// OAuth constants
const ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize";
const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const ATLASSIAN_API_URL = "https://api.atlassian.com";
const ATLASSIAN_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";

let inMemoryAuth: AuthConfig | null = null;
let keytarModule: typeof import("keytar") | null | undefined = undefined;

async function getKeytar() {
  if (keytarModule !== undefined) {
    return keytarModule;
  }
  try {
    keytarModule = await import("keytar");
  } catch {
    keytarModule = null;
  }
  return keytarModule;
}

function normalizeBaseUrl(input: string) {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("baseUrl must be a valid URL like https://your-domain.atlassian.net");
  }
  const trimmedPath = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${trimmedPath}`;
}

// ============ Basic Auth Functions ============

function basicAuthFromEnv(): BasicAuthConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !apiToken) {
    return null;
  }
  return {
    type: "basic",
    baseUrl: normalizeBaseUrl(baseUrl),
    email,
    apiToken,
  };
}

// ============ OAuth Functions ============

function oauthFromEnv(): OAuthConfig | null {
  const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET;
  const accessToken = process.env.JIRA_OAUTH_ACCESS_TOKEN;
  const refreshToken = process.env.JIRA_OAUTH_REFRESH_TOKEN;
  const cloudId = process.env.JIRA_CLOUD_ID;

  if (!clientId || !clientSecret || !accessToken || !cloudId) {
    return null;
  }
  return {
    type: "oauth",
    clientId,
    clientSecret,
    accessToken,
    refreshToken,
    cloudId,
  };
}

function generateAuthorizationUrl(clientId: string, redirectUri: string, scopes: Array<string>, state: string): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: clientId,
    scope: scopes.join(" "),
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `${ATLASSIAN_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const response = await axios.post(ATLASSIAN_TOKEN_URL, {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  }, {
    headers: { "Content-Type": "application/json" },
  });

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresIn: response.data.expires_in,
  };
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const response = await axios.post(ATLASSIAN_TOKEN_URL, {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }, {
    headers: { "Content-Type": "application/json" },
  });

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresIn: response.data.expires_in,
  };
}

async function getAccessibleResources(accessToken: string): Promise<Array<{
  id: string;
  name: string;
  url: string;
  scopes: Array<string>;
}>> {
  const response = await axios.get(ATLASSIAN_RESOURCES_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  return response.data;
}

async function getCloudIdFromResources(accessToken: string, siteUrl?: string): Promise<{ cloudId: string; siteName: string; siteUrl: string }> {
  const resources = await getAccessibleResources(accessToken);
  
  if (resources.length === 0) {
    throw new Error("No accessible Jira sites found. Make sure your OAuth app has the correct scopes and you have granted access.");
  }

  // If siteUrl is provided, find matching resource
  if (siteUrl) {
    const normalizedSiteUrl = normalizeBaseUrl(siteUrl);
    const resource = resources.find(r => normalizeBaseUrl(r.url) === normalizedSiteUrl);
    if (resource) {
      return { cloudId: resource.id, siteName: resource.name, siteUrl: resource.url };
    }
    throw new Error(`Site ${siteUrl} not found in accessible resources. Available sites: ${resources.map(r => r.url).join(", ")}`);
  }

  // Return first available resource
  const resource = resources[0];
  return { cloudId: resource.id, siteName: resource.name, siteUrl: resource.url };
}

// ============ Auth Management ============

async function authFromKeytar(): Promise<AuthConfig | null> {
  const keytar = await getKeytar();
  if (!keytar) return null;
  const stored = await keytar.getPassword(AUTH_SERVICE, AUTH_ACCOUNT);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as AuthConfig;
    if (parsed.type === "basic") {
      return {
        ...parsed,
        baseUrl: normalizeBaseUrl(parsed.baseUrl),
      };
    }
    return parsed;
  } catch {
    return null;
  }
}

async function getAuthOrThrow(): Promise<AuthConfig> {
  if (inMemoryAuth) {
    // Check if OAuth token needs refresh
    if (inMemoryAuth.type === "oauth" && inMemoryAuth.expiresAt && inMemoryAuth.refreshToken) {
      const now = Date.now();
      // Refresh if token expires in less than 5 minutes
      if (now >= inMemoryAuth.expiresAt - 5 * 60 * 1000) {
        try {
          const tokens = await refreshAccessToken(
            inMemoryAuth.clientId,
            inMemoryAuth.clientSecret,
            inMemoryAuth.refreshToken
          );
          inMemoryAuth = {
            ...inMemoryAuth,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken || inMemoryAuth.refreshToken,
            expiresAt: Date.now() + tokens.expiresIn * 1000,
          };
        } catch (error) {
          // If refresh fails, continue with existing token
          console.error("Failed to refresh OAuth token:", error);
        }
      }
    }
    return inMemoryAuth;
  }

  // Try OAuth from env first
  const oauthEnv = oauthFromEnv();
  if (oauthEnv) return oauthEnv;

  // Try basic auth from env
  const basicEnv = basicAuthFromEnv();
  if (basicEnv) return basicEnv;

  // Try keytar
  const keytarAuth = await authFromKeytar();
  if (keytarAuth) return keytarAuth;

  throw new Error("MISSING_AUTH");
}

async function setAuth(auth: AuthConfig, persist: boolean) {
  inMemoryAuth = auth;
  if (!persist) return;
  const keytar = await getKeytar();
  if (!keytar) {
    throw new Error("Keytar is not available to persist credentials.");
  }
  await keytar.setPassword(AUTH_SERVICE, AUTH_ACCOUNT, JSON.stringify(auth));
}

async function clearAuth() {
  inMemoryAuth = null;
  const keytar = await getKeytar();
  if (!keytar) return;
  await keytar.deletePassword(AUTH_SERVICE, AUTH_ACCOUNT);
}

// ============ Client Creation ============

function createClient(auth: AuthConfig): AxiosInstance {
  if (auth.type === "basic") {
    return axios.create({
      baseURL: auth.baseUrl,
      auth: {
        username: auth.email,
        password: auth.apiToken,
      },
      headers: {
        Accept: "application/json",
      },
    });
  }

  // OAuth client
  return axios.create({
    baseURL: `${ATLASSIAN_API_URL}/ex/jira/${auth.cloudId}`,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: "application/json",
    },
  });
}

type AdfNode = {
  type?: string;
  text?: string;
  content?: Array<AdfNode>;
};

function adfToText(node: AdfNode | AdfNode[] | null | undefined): string {
  if (!node) return "";
  if (Array.isArray(node)) {
    return node.map(adfToText).filter(Boolean).join("\n").trim();
  }
  if (typeof node.text === "string") {
    return node.text;
  }
  if (Array.isArray(node.content)) {
    const parts = node.content.map(adfToText).filter(Boolean);
    return parts.join(node.type === "paragraph" ? "\n" : " ").trim();
  }
  return "";
}

function normalizeFieldText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const maybeAdf = value as AdfNode;
    const text = adfToText(maybeAdf);
    if (text) return text;
  }
  return "";
}

function textToAdf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    ],
  };
}

function pickIssueSummary(issue: any) {
  const fields = issue?.fields || {};
  const description = normalizeFieldText(fields.description);
  const acceptanceCriteria = ACCEPTANCE_FIELD
    ? normalizeFieldText(fields[ACCEPTANCE_FIELD])
    : "";
  return {
    key: issue?.key ?? "",
    summary: fields.summary ?? "",
    description,
    acceptanceCriteria: acceptanceCriteria || null,
  };
}

function pickIssueSearchSummary(issue: any) {
  const fields = issue?.fields || {};
  return {
    key: issue?.key ?? "",
    summary: fields.summary ?? "",
    status: fields.status?.name ?? "",
  };
}

function defaultIssueFields() {
  const base = ["summary", "description"];
  if (ACCEPTANCE_FIELD) base.push(ACCEPTANCE_FIELD);
  return base;
}

function errorToMessage(error: unknown) {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data = error.response?.data;
    const detail = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return `Jira API error${status ? ` (${status})` : ""}: ${detail || error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function errorToResult(error: unknown) {
  if (error instanceof Error && error.message === "MISSING_AUTH") {
    return {
      error: "unauthorized",
      message: "Jira credentials are missing. Provide credentials explicitly to authenticate.",
    };
  }
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    if (status === 401) {
      return {
        error: "unauthorized",
        message: "Jira credentials are missing or invalid. If using OAuth, the token may have expired.",
      };
    }
    if (status === 403) {
      return {
        error: "forbidden",
        message: "You do not have permission to access this Jira resource.",
      };
    }
    if (status === 404) {
      return {
        error: "not_found",
        message: "The Jira resource does not exist or is not visible.",
      };
    }
    if (status === 429) {
      return {
        error: "rate_limited",
        message: "Jira rate limit exceeded. Please retry later.",
      };
    }
    if (status && status >= 500) {
      return {
        error: "server_error",
        message: "Jira server error. Please retry later.",
      };
    }
    return {
      error: "jira_error",
      message: errorToMessage(error),
    };
  }
  if (error instanceof Error) {
    return {
      error: "unknown",
      message: error.message,
    };
  }
  return {
    error: "unknown",
    message: "Unknown error",
  };
}

function textResult(value: unknown): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

const server = new McpServer({
  name: "jira-mcp",
  version: "0.2.0",
});

// ============ Auth Tools ============

server.registerTool(
  "_internal_jira_set_auth",
  {
    title: "Set Jira Auth (Basic)",
    description:
      "Use when the user wants to connect Jira using Basic Auth (email + API token). This tool should only be called when the user explicitly provides credentials.",
    inputSchema: z.object({
      baseUrl: z.string(),
      email: z.string().email(),
      apiToken: z.string().min(1),
      persist: z.boolean().optional().default(false),
    }),
  },
  async ({ baseUrl, email, apiToken, persist }) => {
    const normalized = normalizeBaseUrl(baseUrl);
    await setAuth({ type: "basic", baseUrl: normalized, email, apiToken }, persist ?? false);
    return textResult("Jira credentials loaded (Basic Auth).");
  }
);

server.registerTool(
  "jira_oauth_get_auth_url",
  {
    title: "Get OAuth Authorization URL",
    description:
      "Generate the OAuth 2.0 authorization URL that the user should visit to grant access. Returns the URL and required state parameter.",
    inputSchema: z.object({
      clientId: z.string().min(1).describe("OAuth Client ID from Atlassian Developer Console"),
      redirectUri: z.string().url().describe("Callback URL configured in your OAuth app"),
      scopes: z.array(z.string()).optional().default([
        "read:jira-work",
        "read:jira-user",
        "write:jira-work",
        "offline_access",
      ]).describe("OAuth scopes to request"),
    }),
  },
  async ({ clientId, redirectUri, scopes }) => {
    const state = Math.random().toString(36).substring(2, 15);
    const authUrl = generateAuthorizationUrl(clientId, redirectUri, scopes, state);
    return textResult({
      authUrl,
      state,
      instructions: "1. Visit the authUrl in your browser\n2. Grant access to your Jira site\n3. Copy the 'code' parameter from the redirect URL\n4. Use jira_oauth_exchange_code to exchange it for tokens",
    });
  }
);

server.registerTool(
  "jira_oauth_exchange_code",
  {
    title: "Exchange OAuth Code for Tokens",
    description:
      "Exchange the authorization code for access tokens after the user has completed the OAuth flow.",
    inputSchema: z.object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      code: z.string().min(1).describe("Authorization code from the OAuth callback"),
      redirectUri: z.string().url(),
      siteUrl: z.string().url().optional().describe("Optional: specific Jira site URL (e.g., https://yoursite.atlassian.net)"),
      persist: z.boolean().optional().default(false),
    }),
  },
  async ({ clientId, clientSecret, code, redirectUri, siteUrl, persist }) => {
    try {
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(clientId, clientSecret, code, redirectUri);
      
      // Get cloud ID
      const { cloudId, siteName, siteUrl: actualSiteUrl } = await getCloudIdFromResources(tokens.accessToken, siteUrl);
      
      const auth: OAuthConfig = {
        type: "oauth",
        clientId,
        clientSecret,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        cloudId,
        expiresAt: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined,
      };
      
      await setAuth(auth, persist);
      
      return textResult({
        success: true,
        message: `Successfully authenticated with OAuth to ${siteName}`,
        site: {
          name: siteName,
          url: actualSiteUrl,
          cloudId,
        },
        hasRefreshToken: !!tokens.refreshToken,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_oauth_set_tokens",
  {
    title: "Set OAuth Tokens Directly",
    description:
      "Set OAuth tokens directly if you already have them (e.g., from a previous session or external OAuth flow).",
    inputSchema: z.object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      accessToken: z.string().min(1),
      refreshToken: z.string().optional(),
      cloudId: z.string().optional().describe("Cloud ID of the Jira site. If not provided, will be fetched automatically."),
      siteUrl: z.string().url().optional().describe("Jira site URL to find the correct cloudId"),
      persist: z.boolean().optional().default(false),
    }),
  },
  async ({ clientId, clientSecret, accessToken, refreshToken, cloudId, siteUrl, persist }) => {
    try {
      let finalCloudId = cloudId;
      let siteName = "";
      let actualSiteUrl = siteUrl || "";

      if (!finalCloudId) {
        const resources = await getCloudIdFromResources(accessToken, siteUrl);
        finalCloudId = resources.cloudId;
        siteName = resources.siteName;
        actualSiteUrl = resources.siteUrl;
      }

      const auth: OAuthConfig = {
        type: "oauth",
        clientId,
        clientSecret,
        accessToken,
        refreshToken,
        cloudId: finalCloudId,
      };

      await setAuth(auth, persist);

      return textResult({
        success: true,
        message: siteName ? `OAuth tokens set for ${siteName}` : "OAuth tokens set successfully",
        cloudId: finalCloudId,
        siteUrl: actualSiteUrl,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_oauth_refresh",
  {
    title: "Refresh OAuth Token",
    description:
      "Manually refresh the OAuth access token using the refresh token.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const auth = await getAuthOrThrow();
      
      if (auth.type !== "oauth") {
        return textResult({
          error: "invalid_auth_type",
          message: "Current authentication is not OAuth. Use basic auth credentials directly.",
        });
      }

      if (!auth.refreshToken) {
        return textResult({
          error: "no_refresh_token",
          message: "No refresh token available. You need to re-authenticate with 'offline_access' scope.",
        });
      }

      const tokens = await refreshAccessToken(auth.clientId, auth.clientSecret, auth.refreshToken);
      
      const updatedAuth: OAuthConfig = {
        ...auth,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || auth.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
      };

      await setAuth(updatedAuth, false);

      return textResult({
        success: true,
        message: "OAuth token refreshed successfully",
        expiresIn: tokens.expiresIn,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_oauth_list_sites",
  {
    title: "List Accessible Jira Sites",
    description:
      "List all Jira sites accessible with the current OAuth token.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const auth = await getAuthOrThrow();
      
      if (auth.type !== "oauth") {
        return textResult({
          error: "invalid_auth_type",
          message: "This tool requires OAuth authentication. Current auth is basic auth.",
        });
      }

      const resources = await getAccessibleResources(auth.accessToken);
      
      return textResult({
        currentCloudId: auth.cloudId,
        sites: resources.map(r => ({
          cloudId: r.id,
          name: r.name,
          url: r.url,
          scopes: r.scopes,
        })),
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_clear_auth",
  {
    title: "Clear Jira Auth",
    description: "Use when the user asks to remove or reset stored Jira credentials.",
    inputSchema: z.object({}),
  },
  async () => {
    await clearAuth();
    return textResult("Jira credentials cleared.");
  }
);

server.registerTool(
  "jira_auth_status",
  {
    title: "Get Auth Status",
    description: "Check the current authentication status and type.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const auth = await getAuthOrThrow();
      
      if (auth.type === "basic") {
        return textResult({
          authenticated: true,
          type: "basic",
          baseUrl: auth.baseUrl,
          email: auth.email,
        });
      }
      
      return textResult({
        authenticated: true,
        type: "oauth",
        cloudId: auth.cloudId,
        hasRefreshToken: !!auth.refreshToken,
        expiresAt: auth.expiresAt ? new Date(auth.expiresAt).toISOString() : null,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "MISSING_AUTH") {
        return textResult({
          authenticated: false,
          message: "No authentication configured. Use basic auth or OAuth to authenticate.",
        });
      }
      return textResult(errorToResult(error));
    }
  }
);

// ============ Jira API Tools ============

server.registerTool(
  "jira_whoami",
  {
    title: "Get Jira Profile",
    description:
      "Use when the user asks who they are in Jira or wants to verify the Jira account in use.",
  },
  async () => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const response = await client.get("/rest/api/3/myself");
      return textResult(response.data);
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_issue",
  {
    title: "Get Jira Issue",
    description:
      "Get the full details of a Jira issue when the user mentions an issue key like PROJ-123 or asks about a specific ticket.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1),
      fields: z.array(z.string()).optional(),
      expand: z.string().optional(),
    }),
  },
  async ({ issueIdOrKey, fields, expand }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const fieldParam = fields?.length ? fields : defaultIssueFields();
      const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`, {
        params: {
          fields: fieldParam.join(","),
          expand,
        },
      });
      return textResult(pickIssueSummary(response.data));
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_search_issues",
  {
    title: "Search Jira Issues",
    description:
      "Use when the user asks to find issues matching criteria (JQL), like 'my open bugs' or 'tickets updated this week'.",
    inputSchema: z.object({
      jql: z.string().min(1),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(200).optional(),
      fields: z.array(z.string()).optional(),
      expand: z.string().optional(),
      nextPageToken: z.string().optional(),
      reconcileIssues: z.boolean().optional(),
    }),
  },
  async ({ jql, startAt, maxResults, fields, expand, nextPageToken, reconcileIssues }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const fieldParam = fields?.length ? fields : defaultIssueFields();
      const response = await client.get("/rest/api/3/search/jql", {
        params: {
          jql,
          startAt,
          maxResults,
          fields: fieldParam.join(","),
          expand,
          nextPageToken,
          reconcileIssues,
        },
      });
      const issues = Array.isArray(response.data?.issues)
        ? response.data.issues.map(pickIssueSummary)
        : [];
      return textResult({
        total: response.data?.total ?? issues.length,
        issues,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_search_issues_summary",
  {
    title: "Search Jira Issues (Summary)",
    description:
      "Use when the user wants the top results for a Jira search and only needs key, summary, and status.",
    inputSchema: z.object({
      jql: z.string().min(1),
      maxResults: z.number().int().positive().max(50).optional(),
    }),
  },
  async ({ jql, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const response = await client.get("/rest/api/3/search/jql", {
        params: {
          jql,
          maxResults: maxResults ?? 10,
          fields: ["summary", "status"].join(","),
        },
      });
      const issues = Array.isArray(response.data?.issues)
        ? response.data.issues.map(pickIssueSearchSummary)
        : [];
      return textResult(issues);
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_resolve",
  {
    title: "Resolve Jira Intent",
    description:
      "Primary routing tool. Use this tool first when the user intent is clear (get issue, search, or my issues) but the exact Jira tool to call is uncertain.",
    inputSchema: z.object({
      intent: z.enum(["get_issue", "search", "my_issues"]),
      issueKey: z.string().optional(),
      jql: z.string().optional(),
      maxResults: z.number().int().positive().max(50).optional(),
    }),
  },
  async ({ intent, issueKey, jql, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      if (intent === "get_issue") {
        if (!issueKey) {
          return textResult({
            error: "invalid_input",
            message: "issueKey is required when intent is get_issue.",
          });
        }
        const response = await client.get(
          `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
          {
            params: {
              fields: defaultIssueFields().join(","),
            },
          }
        );
        return textResult(pickIssueSummary(response.data));
      }

      if (intent === "search") {
        if (!jql) {
          return textResult({
            error: "invalid_input",
            message: "jql is required when intent is search.",
          });
        }
        const response = await client.get("/rest/api/3/search/jql", {
          params: {
            jql,
            maxResults: maxResults ?? 10,
            fields: ["summary", "status"].join(","),
          },
        });
        const issues = Array.isArray(response.data?.issues)
          ? response.data.issues.map(pickIssueSearchSummary)
          : [];
        return textResult(issues);
      }

      const response = await client.get("/rest/api/3/search/jql", {
        params: {
          jql: "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
          maxResults: maxResults ?? 20,
          fields: defaultIssueFields().join(","),
        },
      });
      const issues = Array.isArray(response.data?.issues)
        ? response.data.issues.map(pickIssueSummary)
        : [];
      return textResult({
        total: response.data?.total ?? issues.length,
        issues,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_issue_summary",
  {
    title: "Get Issue Summary",
    description:
      "Use when the user wants the summary, description, and acceptance criteria for a specific issue key.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1),
    }),
  },
  async ({ issueIdOrKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`, {
        params: {
          fields: defaultIssueFields().join(","),
        },
      });
      return textResult(pickIssueSummary(response.data));
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_my_open_issues",
  {
    title: "Get My Open Issues",
    description:
      "Use when the user asks for their open tickets or what they should work on next.",
    inputSchema: z.object({
      maxResults: z.number().int().positive().max(50).optional(),
    }),
  },
  async ({ maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const response = await client.get("/rest/api/3/search/jql", {
        params: {
          jql: "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
          maxResults: maxResults ?? 20,
          fields: defaultIssueFields().join(","),
        },
      });
      const issues = Array.isArray(response.data?.issues)
        ? response.data.issues.map(pickIssueSummary)
        : [];
      return textResult({
        total: response.data?.total ?? issues.length,
        issues,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_issue_comments",
  {
    title: "Get Issue Comments",
    description:
      "Use when the user asks for the discussion or comments on a specific ticket; returns a clean list.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(100).optional(),
    }),
  },
  async ({ issueIdOrKey, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/comment`,
        {
          params: {
            startAt,
            maxResults,
          },
        }
      );
      const comments = Array.isArray(response.data?.comments)
        ? response.data.comments.map((comment: any) => ({
            author:
              comment?.author?.displayName ||
              comment?.author?.emailAddress ||
              comment?.author?.accountId ||
              "",
            created: comment?.created ?? "",
            body: normalizeFieldText(comment?.body),
          }))
        : [];
      return textResult(comments);
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_add_comment",
  {
    title: "Add Jira Comment",
    description:
      "Use when the user asks to add a comment to a specific ticket; confirm intent before posting.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1),
      body: z.string().min(1),
    }),
  },
  async ({ issueIdOrKey, body }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const response = await client.post(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/comment`,
        {
          body: textToAdf(body),
        }
      );
      return textResult({
        id: response.data?.id ?? "",
        created: response.data?.created ?? "",
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_add_worklog",
  {
    title: "Add Work Log",
    description:
      "Use when the user wants to log time/work on a specific Jira ticket. Allows specifying time spent, start date/time, and an optional description.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("The issue key (e.g., PROJ-123) to log work against"),
      timeSpent: z.string().min(1).describe("Time spent in Jira format (e.g., '1h', '30m', '1h 30m', '1d')"),
      started: z.string().optional().describe("When the work started in ISO 8601 format (e.g., '2026-02-13T14:00:00.000+0000'). Defaults to now if not provided."),
      comment: z.string().optional().describe("Optional description of the work performed"),
    }),
  },
  async ({ issueIdOrKey, timeSpent, started, comment }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      
      const worklogData: Record<string, unknown> = {
        timeSpent,
      };
      
      if (started) {
        worklogData.started = started;
      }
      
      if (comment) {
        worklogData.comment = textToAdf(comment);
      }
      
      const response = await client.post(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog`,
        worklogData
      );
      
      return textResult({
        id: response.data?.id ?? "",
        issueId: response.data?.issueId ?? "",
        timeSpent: response.data?.timeSpent ?? "",
        started: response.data?.started ?? "",
        author: response.data?.author?.displayName ?? response.data?.author?.emailAddress ?? "",
        created: response.data?.created ?? "",
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_worklogs",
  {
    title: "Get Work Logs",
    description:
      "Use when the user wants to see work logs recorded on a specific Jira ticket.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("The issue key (e.g., PROJ-123) to get work logs for"),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(100).optional(),
    }),
  },
  async ({ issueIdOrKey, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog`,
        {
          params: {
            startAt,
            maxResults,
          },
        }
      );
      
      const worklogs = Array.isArray(response.data?.worklogs)
        ? response.data.worklogs.map((worklog: any) => ({
            id: worklog?.id ?? "",
            author: worklog?.author?.displayName || worklog?.author?.emailAddress || "",
            timeSpent: worklog?.timeSpent ?? "",
            timeSpentSeconds: worklog?.timeSpentSeconds ?? 0,
            started: worklog?.started ?? "",
            created: worklog?.created ?? "",
            comment: normalizeFieldText(worklog?.comment),
          }))
        : [];
      
      return textResult({
        total: response.data?.total ?? worklogs.length,
        worklogs,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_list_projects",
  {
    title: "List Jira Projects",
    description:
      "Use when the user asks which Jira projects they can access or wants a list of projects.",
    inputSchema: z.object({
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(50).optional(),
    }),
  },
  async ({ startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const response = await client.get("/rest/api/3/project/search", {
        params: {
          startAt,
          maxResults,
        },
      });
      return textResult(response.data);
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_project",
  {
    title: "Get Jira Project",
    description:
      "Use when the user mentions a project key and asks for project details or metadata.",
    inputSchema: z.object({
      projectIdOrKey: z.string().min(1),
    }),
  },
  async ({ projectIdOrKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);
      const response = await client.get(
        `/rest/api/3/project/${encodeURIComponent(projectIdOrKey)}`
      );
      return textResult(response.data);
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

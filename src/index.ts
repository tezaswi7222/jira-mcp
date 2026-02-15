#!/usr/bin/env node
import axios, { AxiosError, AxiosInstance } from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ============ CLI Handling ============

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPackageJson(): { name: string; version: string; description: string } {
  try {
    // Try dist location first (when running from npm package)
    const pkgPath = join(__dirname, "..", "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    // Fallback for development
    try {
      const devPkgPath = join(__dirname, "package.json");
      return JSON.parse(readFileSync(devPkgPath, "utf-8"));
    } catch {
      return { name: "mcp-jira-cloud", version: "2.0.4", description: "Jira MCP Server" };
    }
  }
}

function printHelp(): void {
  const pkg = getPackageJson();
  console.log(`
${pkg.name} v${pkg.version}
${pkg.description}

USAGE:
  jira-mcp [OPTIONS]
  mcp-jira-cloud [OPTIONS]

OPTIONS:
  -h, --help       Show this help message and exit
  -v, --version    Show version number and exit

ENVIRONMENT VARIABLES:
  Basic Auth (recommended for most users):
    JIRA_BASE_URL         Your Jira instance URL (e.g., https://your-domain.atlassian.net)
    JIRA_EMAIL            Your Atlassian account email
    JIRA_API_TOKEN        API token from https://id.atlassian.com/manage-profile/security/api-tokens

  OAuth 2.0 (for advanced integrations):
    JIRA_OAUTH_CLIENT_ID      OAuth app client ID
    JIRA_OAUTH_CLIENT_SECRET  OAuth app client secret
    JIRA_OAUTH_ACCESS_TOKEN   Access token
    JIRA_OAUTH_REFRESH_TOKEN  Refresh token (optional)
    JIRA_CLOUD_ID             Jira Cloud ID

  Optional:
    JIRA_ACCEPTANCE_CRITERIA_FIELD  Custom field ID for acceptance criteria

EXAMPLES:
  # Run as MCP server (typical usage via AI assistant config)
  jira-mcp

  # Check version
  jira-mcp --version

MCP CONFIGURATION:
  Add to your AI assistant's MCP configuration:

  VS Code (settings.json):
    "mcp": {
      "servers": {
        "jira": {
          "command": "npx",
          "args": ["-y", "mcp-jira-cloud"],
          "env": {
            "JIRA_BASE_URL": "https://your-domain.atlassian.net",
            "JIRA_EMAIL": "your-email@example.com",
            "JIRA_API_TOKEN": "your-api-token"
          }
        }
      }
    }

DOCUMENTATION:
  https://github.com/tezaswi7222/jira-mcp#readme

ISSUES:
  https://github.com/tezaswi7222/jira-mcp/issues
`);
}

function printVersion(): void {
  const pkg = getPackageJson();
  console.log(`${pkg.name} v${pkg.version}`);
}

// Parse CLI arguments
const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help")) {
  printHelp();
  process.exit(0);
}

if (args.includes("-v") || args.includes("--version")) {
  printVersion();
  process.exit(0);
}

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
  if (!resource) {
    throw new Error("No accessible Jira resources found");
  }
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
  version: "2.0.0",
});

// ============ Issue Field Builders ============

/**
 * Builds the fields object for issue creation/update
 * Handles proper formatting for different field types
 */
function buildIssueFields(params: {
  projectKey?: string;
  issueType?: string;
  summary?: string;
  description?: string;
  assignee?: string | null;
  reporter?: string;
  priority?: string;
  labels?: Array<string>;
  components?: Array<string>;
  fixVersions?: Array<string>;
  affectsVersions?: Array<string>;
  dueDate?: string | null;
  parentKey?: string;
  environment?: string;
  originalEstimate?: string;
  remainingEstimate?: string;
  customFields?: Record<string, unknown>;
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (params.projectKey) {
    fields.project = { key: params.projectKey };
  }

  if (params.issueType) {
    // Support both name and ID
    fields.issuetype = /^\d+$/.test(params.issueType)
      ? { id: params.issueType }
      : { name: params.issueType };
  }

  if (params.summary !== undefined) {
    fields.summary = params.summary;
  }

  if (params.description !== undefined) {
    fields.description = params.description ? textToAdf(params.description) : null;
  }

  if (params.assignee !== undefined) {
    fields.assignee = params.assignee === null ? null : { accountId: params.assignee };
  }

  if (params.reporter) {
    fields.reporter = { accountId: params.reporter };
  }

  if (params.priority) {
    // Support both name and ID
    fields.priority = /^\d+$/.test(params.priority)
      ? { id: params.priority }
      : { name: params.priority };
  }

  if (params.labels && params.labels.length > 0) {
    fields.labels = params.labels;
  }

  if (params.components && params.components.length > 0) {
    fields.components = params.components.map(c =>
      /^\d+$/.test(c) ? { id: c } : { name: c }
    );
  }

  if (params.fixVersions && params.fixVersions.length > 0) {
    fields.fixVersions = params.fixVersions.map(v =>
      /^\d+$/.test(v) ? { id: v } : { name: v }
    );
  }

  if (params.affectsVersions && params.affectsVersions.length > 0) {
    fields.versions = params.affectsVersions.map(v =>
      /^\d+$/.test(v) ? { id: v } : { name: v }
    );
  }

  if (params.dueDate !== undefined) {
    fields.duedate = params.dueDate;
  }

  if (params.parentKey) {
    fields.parent = { key: params.parentKey };
  }

  if (params.environment) {
    fields.environment = textToAdf(params.environment);
  }

  if (params.originalEstimate || params.remainingEstimate) {
    fields.timetracking = {};
    if (params.originalEstimate) {
      (fields.timetracking as Record<string, string>).originalEstimate = params.originalEstimate;
    }
    if (params.remainingEstimate) {
      (fields.timetracking as Record<string, string>).remainingEstimate = params.remainingEstimate;
    }
  }

  // Add custom fields
  if (params.customFields) {
    for (const [key, value] of Object.entries(params.customFields)) {
      const fieldKey = key.startsWith("customfield_") ? key : `customfield_${key}`;
      // Handle string values that should be ADF
      if (typeof value === "string" && value.length > 0) {
        // Check if it looks like it needs ADF conversion (multi-line or rich text)
        fields[fieldKey] = value;
      } else {
        fields[fieldKey] = value;
      }
    }
  }

  return fields;
}

/**
 * Builds update operations for issue modification
 * Supports add, remove, set operations for array fields
 */
function buildUpdateOperations(params: {
  labels?: { add?: Array<string>; remove?: Array<string>; set?: Array<string> };
  components?: { add?: Array<string>; remove?: Array<string>; set?: Array<string> };
  fixVersions?: { add?: Array<string>; remove?: Array<string>; set?: Array<string> };
  affectsVersions?: { add?: Array<string>; remove?: Array<string>; set?: Array<string> };
}): Record<string, Array<Record<string, unknown>>> {
  const update: Record<string, Array<Record<string, unknown>>> = {};

  // Labels use simple string values
  if (params.labels) {
    const labelsArr: Array<Record<string, unknown>> = [];
    if (params.labels.add) {
      params.labels.add.forEach(l => labelsArr.push({ add: l }));
    }
    if (params.labels.remove) {
      params.labels.remove.forEach(l => labelsArr.push({ remove: l }));
    }
    if (params.labels.set) {
      labelsArr.push({ set: params.labels.set });
    }
    update.labels = labelsArr;
  }

  // Components use object with id/name
  if (params.components) {
    const componentsArr: Array<Record<string, unknown>> = [];
    if (params.components.add) {
      params.components.add.forEach(c =>
        componentsArr.push({ add: /^\d+$/.test(c) ? { id: c } : { name: c } })
      );
    }
    if (params.components.remove) {
      params.components.remove.forEach(c =>
        componentsArr.push({ remove: /^\d+$/.test(c) ? { id: c } : { name: c } })
      );
    }
    if (params.components.set) {
      componentsArr.push({
        set: params.components.set.map(c => (/^\d+$/.test(c) ? { id: c } : { name: c }))
      });
    }
    update.components = componentsArr;
  }

  // Fix versions
  if (params.fixVersions) {
    const fixVersionsArr: Array<Record<string, unknown>> = [];
    if (params.fixVersions.add) {
      params.fixVersions.add.forEach(v =>
        fixVersionsArr.push({ add: /^\d+$/.test(v) ? { id: v } : { name: v } })
      );
    }
    if (params.fixVersions.remove) {
      params.fixVersions.remove.forEach(v =>
        fixVersionsArr.push({ remove: /^\d+$/.test(v) ? { id: v } : { name: v } })
      );
    }
    if (params.fixVersions.set) {
      fixVersionsArr.push({
        set: params.fixVersions.set.map(v => (/^\d+$/.test(v) ? { id: v } : { name: v }))
      });
    }
    update.fixVersions = fixVersionsArr;
  }

  // Affects versions
  if (params.affectsVersions) {
    const versionsArr: Array<Record<string, unknown>> = [];
    if (params.affectsVersions.add) {
      params.affectsVersions.add.forEach(v =>
        versionsArr.push({ add: /^\d+$/.test(v) ? { id: v } : { name: v } })
      );
    }
    if (params.affectsVersions.remove) {
      params.affectsVersions.remove.forEach(v =>
        versionsArr.push({ remove: /^\d+$/.test(v) ? { id: v } : { name: v } })
      );
    }
    if (params.affectsVersions.set) {
      versionsArr.push({
        set: params.affectsVersions.set.map(v => (/^\d+$/.test(v) ? { id: v } : { name: v }))
      });
    }
    update.versions = versionsArr;
  }

  return update;
}

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

// ============ Phase 1.1: Create Issue ============

server.registerTool(
  "jira_create_issue",
  {
    title: "Create Jira Issue",
    description:
      "Create a new Jira issue. Requires project key, issue type, and summary at minimum.",
    inputSchema: z.object({
      projectKey: z.string().min(1).describe("Project key (e.g., 'MXTS')"),
      issueType: z.string().min(1).describe("Issue type name or ID (e.g., 'Bug', 'Task', 'Story')"),
      summary: z.string().min(1).describe("Issue title/summary"),
      description: z.string().optional().describe("Issue description (plain text, will be converted to ADF)"),
      assignee: z.string().optional().describe("Assignee account ID. Use '-1' for automatic assignment."),
      reporter: z.string().optional().describe("Reporter account ID"),
      priority: z.string().optional().describe("Priority name or ID (e.g., 'High', 'Medium', 'Low')"),
      labels: z.array(z.string()).optional().describe("Array of label strings"),
      components: z.array(z.string()).optional().describe("Array of component names or IDs"),
      fixVersions: z.array(z.string()).optional().describe("Array of fix version names or IDs"),
      affectsVersions: z.array(z.string()).optional().describe("Array of affected version names or IDs"),
      dueDate: z.string().optional().describe("Due date in YYYY-MM-DD format"),
      parentKey: z.string().optional().describe("Parent issue key for subtasks"),
      environment: z.string().optional().describe("Environment description"),
      originalEstimate: z.string().optional().describe("Original time estimate (e.g., '2h', '1d')"),
      customFields: z.record(z.string(), z.unknown()).optional().describe("Custom field values as key-value pairs"),
    }),
  },
  async (params) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const fields = buildIssueFields({
        projectKey: params.projectKey,
        issueType: params.issueType,
        summary: params.summary,
        description: params.description,
        assignee: params.assignee,
        reporter: params.reporter,
        priority: params.priority,
        labels: params.labels,
        components: params.components,
        fixVersions: params.fixVersions,
        affectsVersions: params.affectsVersions,
        dueDate: params.dueDate,
        parentKey: params.parentKey,
        environment: params.environment,
        originalEstimate: params.originalEstimate,
        customFields: params.customFields,
      });

      const response = await client.post("/rest/api/3/issue", { fields });

      return textResult({
        success: true,
        id: response.data?.id ?? "",
        key: response.data?.key ?? "",
        self: response.data?.self ?? "",
        message: `Issue ${response.data?.key} created successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 1.2: Update Issue ============

server.registerTool(
  "jira_update_issue",
  {
    title: "Update Jira Issue",
    description:
      "Update an existing Jira issue. Only provided fields will be modified.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID (e.g., 'MXTS-123')"),
      summary: z.string().optional().describe("New summary/title"),
      description: z.string().optional().describe("New description (plain text)"),
      assignee: z.string().nullable().optional().describe("Assignee account ID. Use null to unassign."),
      priority: z.string().optional().describe("Priority name or ID"),
      dueDate: z.string().nullable().optional().describe("Due date (YYYY-MM-DD) or null to clear"),
      labels: z.object({
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
        set: z.array(z.string()).optional(),
      }).optional().describe("Label operations: add, remove, or set"),
      components: z.object({
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
        set: z.array(z.string()).optional(),
      }).optional().describe("Component operations: add, remove, or set"),
      fixVersions: z.object({
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
        set: z.array(z.string()).optional(),
      }).optional().describe("Fix version operations: add, remove, or set"),
      customFields: z.record(z.string(), z.unknown()).optional().describe("Custom field values"),
      notifyUsers: z.boolean().optional().default(true).describe("Send notifications to watchers"),
    }),
  },
  async (params) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const payload: Record<string, unknown> = {};

      // Build fields object for direct field updates
      const fields: Record<string, unknown> = {};

      if (params.summary !== undefined) {
        fields.summary = params.summary;
      }

      if (params.description !== undefined) {
        fields.description = params.description ? textToAdf(params.description) : null;
      }

      if (params.assignee !== undefined) {
        fields.assignee = params.assignee === null ? null : { accountId: params.assignee };
      }

      if (params.priority !== undefined) {
        fields.priority = /^\d+$/.test(params.priority)
          ? { id: params.priority }
          : { name: params.priority };
      }

      if (params.dueDate !== undefined) {
        fields.duedate = params.dueDate;
      }

      // Add custom fields
      if (params.customFields) {
        for (const [key, value] of Object.entries(params.customFields)) {
          const fieldKey = key.startsWith("customfield_") ? key : `customfield_${key}`;
          fields[fieldKey] = value;
        }
      }

      if (Object.keys(fields).length > 0) {
        payload.fields = fields;
      }

      // Build update operations for array fields
      const update = buildUpdateOperations({
        labels: params.labels,
        components: params.components,
        fixVersions: params.fixVersions,
      });

      if (Object.keys(update).length > 0) {
        payload.update = update;
      }

      if (Object.keys(payload).length === 0) {
        return textResult({
          error: "no_changes",
          message: "No fields provided to update",
        });
      }

      await client.put(
        `/rest/api/3/issue/${encodeURIComponent(params.issueIdOrKey)}`,
        payload,
        {
          params: {
            notifyUsers: params.notifyUsers ?? true,
          },
        }
      );

      return textResult({
        success: true,
        key: params.issueIdOrKey,
        message: `Issue ${params.issueIdOrKey} updated successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 1.3: Delete Issue ============

server.registerTool(
  "jira_delete_issue",
  {
    title: "Delete Jira Issue",
    description:
      "Delete a Jira issue. Requires explicit confirmation. Use with caution - this action cannot be undone.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID to delete"),
      deleteSubtasks: z.boolean().optional().default(false).describe("Also delete subtasks"),
      confirmDelete: z.boolean().describe("Must be true to confirm deletion"),
    }),
  },
  async ({ issueIdOrKey, deleteSubtasks, confirmDelete }) => {
    try {
      if (!confirmDelete) {
        return textResult({
          error: "confirmation_required",
          message: "Deletion not confirmed. Set confirmDelete: true to proceed. This action cannot be undone.",
          issueKey: issueIdOrKey,
        });
      }

      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.delete(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`,
        {
          params: {
            deleteSubtasks: deleteSubtasks ?? false,
          },
        }
      );

      return textResult({
        success: true,
        message: `Issue ${issueIdOrKey} deleted successfully${deleteSubtasks ? " (including subtasks)" : ""}`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 1.4: Assign Issue ============

server.registerTool(
  "jira_assign_issue",
  {
    title: "Assign Jira Issue",
    description:
      "Assign or unassign a Jira issue to a user.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
      accountId: z.string().nullable().describe("User account ID to assign, '-1' for automatic, or null to unassign"),
    }),
  },
  async ({ issueIdOrKey, accountId }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.put(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/assignee`,
        {
          accountId: accountId,
        }
      );

      const action = accountId === null ? "unassigned" : "assigned";
      return textResult({
        success: true,
        key: issueIdOrKey,
        message: `Issue ${issueIdOrKey} ${action} successfully`,
        assignee: accountId,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 1.5: Get Transitions ============

server.registerTool(
  "jira_get_transitions",
  {
    title: "Get Issue Transitions",
    description:
      "Get available workflow transitions for an issue. Use before transitioning to see valid options.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
      expand: z.string().optional().describe("Expand options: 'transitions.fields' to include required fields"),
    }),
  },
  async ({ issueIdOrKey, expand }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`,
        {
          params: { expand },
        }
      );

      const transitions = Array.isArray(response.data?.transitions)
        ? response.data.transitions.map((t: any) => ({
            id: t.id,
            name: t.name,
            to: {
              id: t.to?.id,
              name: t.to?.name,
              statusCategory: t.to?.statusCategory?.name,
            },
            hasScreen: t.hasScreen ?? false,
            isGlobal: t.isGlobal ?? false,
            isInitial: t.isInitial ?? false,
            isConditional: t.isConditional ?? false,
            fields: t.fields ? Object.keys(t.fields) : [],
          }))
        : [];

      return textResult({
        issueKey: issueIdOrKey,
        transitions,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 1.6: Transition Issue ============

server.registerTool(
  "jira_transition_issue",
  {
    title: "Transition Jira Issue",
    description:
      "Move a Jira issue to a different status by executing a workflow transition.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
      transitionId: z.string().min(1).describe("Transition ID (get from jira_get_transitions)"),
      comment: z.string().optional().describe("Comment to add during transition"),
      resolution: z.string().optional().describe("Resolution name for closing transitions (e.g., 'Done', 'Fixed')"),
      fields: z.record(z.string(), z.unknown()).optional().describe("Additional fields required by the transition"),
    }),
  },
  async ({ issueIdOrKey, transitionId, comment, resolution, fields }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const payload: Record<string, unknown> = {
        transition: { id: transitionId },
      };

      // Add fields if provided
      if (fields || resolution) {
        const transitionFields: Record<string, unknown> = { ...fields };

        if (resolution) {
          transitionFields.resolution = { name: resolution };
        }

        payload.fields = transitionFields;
      }

      // Add comment if provided
      if (comment) {
        payload.update = {
          comment: [
            {
              add: {
                body: textToAdf(comment),
              },
            },
          ],
        };
      }

      await client.post(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`,
        payload
      );

      return textResult({
        success: true,
        key: issueIdOrKey,
        transitionId,
        message: `Issue ${issueIdOrKey} transitioned successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 1.7: Helper Tools ============

server.registerTool(
  "jira_get_issue_types",
  {
    title: "Get Issue Types",
    description:
      "Get available issue types, optionally filtered by project.",
    inputSchema: z.object({
      projectKey: z.string().optional().describe("Filter issue types for a specific project"),
    }),
  },
  async ({ projectKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      let issueTypes;

      if (projectKey) {
        // Get project-specific issue types
        const response = await client.get(
          `/rest/api/3/project/${encodeURIComponent(projectKey)}`
        );
        issueTypes = response.data?.issueTypes || [];
      } else {
        // Get all issue types
        const response = await client.get("/rest/api/3/issuetype");
        issueTypes = response.data || [];
      }

      return textResult(
        issueTypes.map((it: any) => ({
          id: it.id,
          name: it.name,
          description: it.description || "",
          subtask: it.subtask ?? false,
          hierarchyLevel: it.hierarchyLevel,
        }))
      );
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_priorities",
  {
    title: "Get Priorities",
    description:
      "Get available priority levels for issues.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/priority");

      return textResult(
        (response.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description || "",
          iconUrl: p.iconUrl,
        }))
      );
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_statuses",
  {
    title: "Get Statuses",
    description:
      "Get available statuses, optionally filtered by project.",
    inputSchema: z.object({
      projectKey: z.string().optional().describe("Filter statuses for a specific project"),
    }),
  },
  async ({ projectKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      if (projectKey) {
        // Get project-specific statuses
        const response = await client.get(
          `/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`
        );
        return textResult(response.data || []);
      } else {
        // Get all statuses
        const response = await client.get("/rest/api/3/status");
        return textResult(
          (response.data || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description || "",
            statusCategory: s.statusCategory?.name,
          }))
        );
      }
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_components",
  {
    title: "Get Project Components",
    description:
      "Get components for a specific project.",
    inputSchema: z.object({
      projectKey: z.string().min(1).describe("Project key"),
    }),
  },
  async ({ projectKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        `/rest/api/3/project/${encodeURIComponent(projectKey)}/components`
      );

      return textResult(
        (response.data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description || "",
          lead: c.lead?.displayName,
          assigneeType: c.assigneeType,
        }))
      );
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_versions",
  {
    title: "Get Project Versions",
    description:
      "Get versions for a specific project.",
    inputSchema: z.object({
      projectKey: z.string().min(1).describe("Project key"),
      released: z.boolean().optional().describe("Filter by released status"),
    }),
  },
  async ({ projectKey, released }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        `/rest/api/3/project/${encodeURIComponent(projectKey)}/versions`
      );

      let versions = response.data || [];

      if (released !== undefined) {
        versions = versions.filter((v: any) => v.released === released);
      }

      return textResult(
        versions.map((v: any) => ({
          id: v.id,
          name: v.name,
          description: v.description || "",
          released: v.released ?? false,
          archived: v.archived ?? false,
          releaseDate: v.releaseDate,
          startDate: v.startDate,
        }))
      );
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_search_users",
  {
    title: "Search Jira Users",
    description:
      "Search for Jira users by name, email, or username.",
    inputSchema: z.object({
      query: z.string().min(1).describe("Search query (name, email, or username)"),
      projectKey: z.string().optional().describe("Filter users with access to this project"),
      maxResults: z.number().int().positive().max(50).optional().default(10),
    }),
  },
  async ({ query, projectKey, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/user/search", {
        params: {
          query,
          maxResults: maxResults ?? 10,
        },
      });

      let users = response.data || [];

      // If projectKey provided, filter by assignable users (secondary call)
      if (projectKey && users.length > 0) {
        try {
          const assignableResponse = await client.get("/rest/api/3/user/assignable/search", {
            params: {
              query,
              project: projectKey,
              maxResults: maxResults ?? 10,
            },
          });
          users = assignableResponse.data || [];
        } catch {
          // Fall back to original search if assignable search fails
        }
      }

      return textResult(
        users.map((u: any) => ({
          accountId: u.accountId,
          displayName: u.displayName,
          emailAddress: u.emailAddress,
          active: u.active ?? true,
          avatarUrl: u.avatarUrls?.["48x48"],
        }))
      );
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_changelog",
  {
    title: "Get Issue Changelog",
    description:
      "Get the history of changes for an issue.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(100).optional().default(20),
    }),
  },
  async ({ issueIdOrKey, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/changelog`,
        {
          params: {
            startAt,
            maxResults: maxResults ?? 20,
          },
        }
      );

      const changes = Array.isArray(response.data?.values)
        ? response.data.values.map((change: any) => ({
            id: change.id,
            author: change.author?.displayName || change.author?.emailAddress || "",
            created: change.created,
            items: (change.items || []).map((item: any) => ({
              field: item.field,
              fieldtype: item.fieldtype,
              from: item.fromString || item.from,
              to: item.toString || item.to,
            })),
          }))
        : [];

      return textResult({
        total: response.data?.total ?? changes.length,
        startAt: response.data?.startAt ?? 0,
        changes,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 2: Agile Tools ============

server.registerTool(
  "jira_get_boards",
  {
    title: "Get Jira Boards",
    description:
      "Get all Scrum and Kanban boards, optionally filtered by project or type.",
    inputSchema: z.object({
      projectKeyOrId: z.string().optional().describe("Filter boards by project"),
      type: z.enum(["scrum", "kanban", "simple"]).optional().describe("Filter by board type"),
      name: z.string().optional().describe("Filter boards by name (contains)"),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(50).optional().default(50),
    }),
  },
  async ({ projectKeyOrId, type, name, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/agile/1.0/board", {
        params: {
          projectKeyOrId,
          type,
          name,
          startAt,
          maxResults: maxResults ?? 50,
        },
      });

      const boards = Array.isArray(response.data?.values)
        ? response.data.values.map((b: any) => ({
            id: b.id,
            name: b.name,
            type: b.type,
            projectKey: b.location?.projectKey,
            projectName: b.location?.displayName,
          }))
        : [];

      return textResult({
        total: response.data?.total ?? boards.length,
        startAt: response.data?.startAt ?? 0,
        boards,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_board",
  {
    title: "Get Board Details",
    description:
      "Get details of a specific board including configuration.",
    inputSchema: z.object({
      boardId: z.number().int().positive().describe("Board ID"),
    }),
  },
  async ({ boardId }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/agile/1.0/board/${boardId}`);

      return textResult({
        id: response.data?.id,
        name: response.data?.name,
        type: response.data?.type,
        self: response.data?.self,
        location: response.data?.location,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_board_configuration",
  {
    title: "Get Board Configuration",
    description:
      "Get the configuration of a board including columns, estimation, and ranking.",
    inputSchema: z.object({
      boardId: z.number().int().positive().describe("Board ID"),
    }),
  },
  async ({ boardId }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/agile/1.0/board/${boardId}/configuration`);

      return textResult({
        id: response.data?.id,
        name: response.data?.name,
        type: response.data?.type,
        filter: response.data?.filter,
        columnConfig: response.data?.columnConfig,
        estimation: response.data?.estimation,
        ranking: response.data?.ranking,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_sprints",
  {
    title: "Get Sprints",
    description:
      "Get sprints for a board, optionally filtered by state.",
    inputSchema: z.object({
      boardId: z.number().int().positive().describe("Board ID"),
      state: z.enum(["future", "active", "closed"]).optional().describe("Filter by sprint state"),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(50).optional().default(50),
    }),
  },
  async ({ boardId, state, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/agile/1.0/board/${boardId}/sprint`, {
        params: {
          state,
          startAt,
          maxResults: maxResults ?? 50,
        },
      });

      const sprints = Array.isArray(response.data?.values)
        ? response.data.values.map((s: any) => ({
            id: s.id,
            name: s.name,
            state: s.state,
            startDate: s.startDate,
            endDate: s.endDate,
            completeDate: s.completeDate,
            originBoardId: s.originBoardId,
            goal: s.goal,
          }))
        : [];

      return textResult({
        total: response.data?.total ?? sprints.length,
        startAt: response.data?.startAt ?? 0,
        sprints,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_sprint",
  {
    title: "Get Sprint Details",
    description:
      "Get details of a specific sprint.",
    inputSchema: z.object({
      sprintId: z.number().int().positive().describe("Sprint ID"),
    }),
  },
  async ({ sprintId }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/agile/1.0/sprint/${sprintId}`);

      return textResult({
        id: response.data?.id,
        name: response.data?.name,
        state: response.data?.state,
        startDate: response.data?.startDate,
        endDate: response.data?.endDate,
        completeDate: response.data?.completeDate,
        originBoardId: response.data?.originBoardId,
        goal: response.data?.goal,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_create_sprint",
  {
    title: "Create Sprint",
    description:
      "Create a new sprint on a board.",
    inputSchema: z.object({
      boardId: z.number().int().positive().describe("Board ID"),
      name: z.string().min(1).describe("Sprint name"),
      startDate: z.string().optional().describe("Start date (ISO 8601)"),
      endDate: z.string().optional().describe("End date (ISO 8601)"),
      goal: z.string().optional().describe("Sprint goal"),
    }),
  },
  async ({ boardId, name, startDate, endDate, goal }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.post("/rest/agile/1.0/sprint", {
        originBoardId: boardId,
        name,
        startDate,
        endDate,
        goal,
      });

      return textResult({
        success: true,
        id: response.data?.id,
        name: response.data?.name,
        state: response.data?.state,
        message: `Sprint "${name}" created successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_update_sprint",
  {
    title: "Update Sprint",
    description:
      "Update sprint details including name, dates, and goal.",
    inputSchema: z.object({
      sprintId: z.number().int().positive().describe("Sprint ID"),
      name: z.string().optional().describe("New sprint name"),
      state: z.enum(["future", "active", "closed"]).optional().describe("Sprint state"),
      startDate: z.string().optional().describe("Start date (ISO 8601)"),
      endDate: z.string().optional().describe("End date (ISO 8601)"),
      goal: z.string().optional().describe("Sprint goal"),
    }),
  },
  async ({ sprintId, name, state, startDate, endDate, goal }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const payload: Record<string, unknown> = {};
      if (name !== undefined) payload.name = name;
      if (state !== undefined) payload.state = state;
      if (startDate !== undefined) payload.startDate = startDate;
      if (endDate !== undefined) payload.endDate = endDate;
      if (goal !== undefined) payload.goal = goal;

      if (Object.keys(payload).length === 0) {
        return textResult({
          error: "no_changes",
          message: "No fields provided to update",
        });
      }

      const response = await client.put(`/rest/agile/1.0/sprint/${sprintId}`, payload);

      return textResult({
        success: true,
        id: response.data?.id ?? sprintId,
        name: response.data?.name,
        state: response.data?.state,
        message: `Sprint updated successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_start_sprint",
  {
    title: "Start Sprint",
    description:
      "Start a sprint that is in 'future' state.",
    inputSchema: z.object({
      sprintId: z.number().int().positive().describe("Sprint ID"),
      startDate: z.string().optional().describe("Start date (defaults to now)"),
      endDate: z.string().describe("End date (required for starting a sprint)"),
    }),
  },
  async ({ sprintId, startDate, endDate }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.post(`/rest/agile/1.0/sprint/${sprintId}`, {
        state: "active",
        startDate: startDate || new Date().toISOString(),
        endDate,
      });

      return textResult({
        success: true,
        id: response.data?.id ?? sprintId,
        state: "active",
        message: `Sprint started successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_complete_sprint",
  {
    title: "Complete Sprint",
    description:
      "Complete an active sprint. Optionally move incomplete issues to another sprint or backlog.",
    inputSchema: z.object({
      sprintId: z.number().int().positive().describe("Sprint ID to complete"),
      moveIncompleteIssuesTo: z.number().int().positive().optional().describe("Sprint ID to move incomplete issues to (omit to move to backlog)"),
    }),
  },
  async ({ sprintId, moveIncompleteIssuesTo }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      // Complete the sprint
      await client.post(`/rest/agile/1.0/sprint/${sprintId}`, {
        state: "closed",
      });

      return textResult({
        success: true,
        id: sprintId,
        state: "closed",
        message: `Sprint completed successfully`,
        incompleteIssuesMovedTo: moveIncompleteIssuesTo || "backlog",
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_delete_sprint",
  {
    title: "Delete Sprint",
    description:
      "Delete a sprint. Use with caution - cannot be undone.",
    inputSchema: z.object({
      sprintId: z.number().int().positive().describe("Sprint ID to delete"),
      confirmDelete: z.boolean().describe("Must be true to confirm deletion"),
    }),
  },
  async ({ sprintId, confirmDelete }) => {
    try {
      if (!confirmDelete) {
        return textResult({
          error: "confirmation_required",
          message: "Deletion not confirmed. Set confirmDelete: true to proceed.",
          sprintId,
        });
      }

      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.delete(`/rest/agile/1.0/sprint/${sprintId}`);

      return textResult({
        success: true,
        message: `Sprint ${sprintId} deleted successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_sprint_issues",
  {
    title: "Get Sprint Issues",
    description:
      "Get all issues in a sprint.",
    inputSchema: z.object({
      sprintId: z.number().int().positive().describe("Sprint ID"),
      jql: z.string().optional().describe("Additional JQL filter"),
      fields: z.array(z.string()).optional().describe("Fields to return"),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(100).optional().default(50),
    }),
  },
  async ({ sprintId, jql, fields, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
        params: {
          jql,
          fields: fields?.join(","),
          startAt,
          maxResults: maxResults ?? 50,
        },
      });

      const issues = Array.isArray(response.data?.issues)
        ? response.data.issues.map((issue: any) => ({
            key: issue.key,
            summary: issue.fields?.summary,
            status: issue.fields?.status?.name,
            assignee: issue.fields?.assignee?.displayName,
            issueType: issue.fields?.issuetype?.name,
            priority: issue.fields?.priority?.name,
            storyPoints: issue.fields?.customfield_10016,
          }))
        : [];

      return textResult({
        total: response.data?.total ?? issues.length,
        startAt: response.data?.startAt ?? 0,
        sprintId,
        issues,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_move_issues_to_sprint",
  {
    title: "Move Issues to Sprint",
    description:
      "Move issues to a sprint.",
    inputSchema: z.object({
      sprintId: z.number().int().positive().describe("Target sprint ID"),
      issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to move"),
    }),
  },
  async ({ sprintId, issueKeys }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.post(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
        issues: issueKeys,
      });

      return textResult({
        success: true,
        sprintId,
        issuesMoved: issueKeys,
        message: `${issueKeys.length} issue(s) moved to sprint ${sprintId}`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_backlog_issues",
  {
    title: "Get Backlog Issues",
    description:
      "Get issues in the backlog (not in any active sprint) for a board.",
    inputSchema: z.object({
      boardId: z.number().int().positive().describe("Board ID"),
      jql: z.string().optional().describe("Additional JQL filter"),
      fields: z.array(z.string()).optional().describe("Fields to return"),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(100).optional().default(50),
    }),
  },
  async ({ boardId, jql, fields, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/agile/1.0/board/${boardId}/backlog`, {
        params: {
          jql,
          fields: fields?.join(","),
          startAt,
          maxResults: maxResults ?? 50,
        },
      });

      const issues = Array.isArray(response.data?.issues)
        ? response.data.issues.map((issue: any) => ({
            key: issue.key,
            summary: issue.fields?.summary,
            status: issue.fields?.status?.name,
            assignee: issue.fields?.assignee?.displayName,
            issueType: issue.fields?.issuetype?.name,
            priority: issue.fields?.priority?.name,
          }))
        : [];

      return textResult({
        total: response.data?.total ?? issues.length,
        startAt: response.data?.startAt ?? 0,
        boardId,
        issues,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_move_issues_to_backlog",
  {
    title: "Move Issues to Backlog",
    description:
      "Move issues from a sprint back to the backlog.",
    inputSchema: z.object({
      issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to move to backlog"),
    }),
  },
  async ({ issueKeys }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.post("/rest/agile/1.0/backlog/issue", {
        issues: issueKeys,
      });

      return textResult({
        success: true,
        issuesMoved: issueKeys,
        message: `${issueKeys.length} issue(s) moved to backlog`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_rank_issues",
  {
    title: "Rank Issues",
    description:
      "Change the rank of issues on a board by placing them before or after another issue.",
    inputSchema: z.object({
      issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to rank"),
      rankBeforeIssue: z.string().optional().describe("Issue key to rank before"),
      rankAfterIssue: z.string().optional().describe("Issue key to rank after"),
    }),
  },
  async ({ issueKeys, rankBeforeIssue, rankAfterIssue }) => {
    try {
      if (!rankBeforeIssue && !rankAfterIssue) {
        return textResult({
          error: "invalid_parameters",
          message: "Either rankBeforeIssue or rankAfterIssue must be provided",
        });
      }

      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const payload: Record<string, unknown> = {
        issues: issueKeys,
      };

      if (rankBeforeIssue) {
        payload.rankBeforeIssue = rankBeforeIssue;
      } else if (rankAfterIssue) {
        payload.rankAfterIssue = rankAfterIssue;
      }

      await client.put("/rest/agile/1.0/issue/rank", payload);

      return textResult({
        success: true,
        issuesRanked: issueKeys,
        message: `${issueKeys.length} issue(s) ranked successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 3: Issue Relationships ============

server.registerTool(
  "jira_get_issue_links",
  {
    title: "Get Issue Links",
    description:
      "Get all linked issues for a specific issue.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
  },
  async ({ issueIdOrKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`,
        {
          params: {
            fields: "issuelinks",
          },
        }
      );

      const links = Array.isArray(response.data?.fields?.issuelinks)
        ? response.data.fields.issuelinks.map((link: any) => {
            const isInward = !!link.inwardIssue;
            const linkedIssue = isInward ? link.inwardIssue : link.outwardIssue;

            return {
              id: link.id,
              type: link.type?.name,
              direction: isInward ? "inward" : "outward",
              description: isInward
                ? link.type?.inward
                : link.type?.outward,
              linkedIssue: {
                key: linkedIssue?.key,
                summary: linkedIssue?.fields?.summary,
                status: linkedIssue?.fields?.status?.name,
                issueType: linkedIssue?.fields?.issuetype?.name,
              },
            };
          })
        : [];

      return textResult({
        issueKey: issueIdOrKey,
        links,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_create_issue_link",
  {
    title: "Link Issues",
    description:
      "Create a link between two issues.",
    inputSchema: z.object({
      inwardIssue: z.string().min(1).describe("Inward issue key (the 'from' issue)"),
      outwardIssue: z.string().min(1).describe("Outward issue key (the 'to' issue)"),
      linkType: z.string().min(1).describe("Link type name (e.g., 'Blocks', 'Relates', 'Duplicates')"),
      comment: z.string().optional().describe("Comment to add with the link"),
    }),
  },
  async ({ inwardIssue, outwardIssue, linkType, comment }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const payload: Record<string, unknown> = {
        type: { name: linkType },
        inwardIssue: { key: inwardIssue },
        outwardIssue: { key: outwardIssue },
      };

      if (comment) {
        payload.comment = {
          body: textToAdf(comment),
        };
      }

      await client.post("/rest/api/3/issueLink", payload);

      return textResult({
        success: true,
        message: `Link created: ${inwardIssue} ${linkType} ${outwardIssue}`,
        inwardIssue,
        outwardIssue,
        linkType,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_delete_issue_link",
  {
    title: "Delete Issue Link",
    description:
      "Remove a link between issues.",
    inputSchema: z.object({
      linkId: z.string().min(1).describe("Link ID to delete (get from jira_get_issue_links)"),
    }),
  },
  async ({ linkId }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.delete(`/rest/api/3/issueLink/${linkId}`);

      return textResult({
        success: true,
        message: `Link ${linkId} deleted successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_link_types",
  {
    title: "Get Issue Link Types",
    description:
      "Get available link types for linking issues.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/issueLinkType");

      return textResult(
        (response.data?.issueLinkTypes || []).map((lt: any) => ({
          id: lt.id,
          name: lt.name,
          inward: lt.inward,
          outward: lt.outward,
        }))
      );
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_watchers",
  {
    title: "Get Issue Watchers",
    description:
      "Get the list of users watching an issue.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
  },
  async ({ issueIdOrKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/watchers`
      );

      const watchers = Array.isArray(response.data?.watchers)
        ? response.data.watchers.map((w: any) => ({
            accountId: w.accountId,
            displayName: w.displayName,
            emailAddress: w.emailAddress,
          }))
        : [];

      return textResult({
        issueKey: issueIdOrKey,
        watchCount: response.data?.watchCount ?? watchers.length,
        isWatching: response.data?.isWatching ?? false,
        watchers,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_add_watcher",
  {
    title: "Add Issue Watcher",
    description:
      "Add a user to watch an issue.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
      accountId: z.string().min(1).describe("User account ID to add as watcher"),
    }),
  },
  async ({ issueIdOrKey, accountId }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.post(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/watchers`,
        JSON.stringify(accountId),
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      return textResult({
        success: true,
        issueKey: issueIdOrKey,
        accountId,
        message: `User added as watcher`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_remove_watcher",
  {
    title: "Remove Issue Watcher",
    description:
      "Remove a user from watching an issue.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
      accountId: z.string().min(1).describe("User account ID to remove"),
    }),
  },
  async ({ issueIdOrKey, accountId }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.delete(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/watchers`,
        {
          params: { accountId },
        }
      );

      return textResult({
        success: true,
        issueKey: issueIdOrKey,
        accountId,
        message: `User removed from watchers`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_votes",
  {
    title: "Get Issue Votes",
    description:
      "Get the vote count and voters for an issue.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
  },
  async ({ issueIdOrKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/votes`
      );

      const voters = Array.isArray(response.data?.voters)
        ? response.data.voters.map((v: any) => ({
            accountId: v.accountId,
            displayName: v.displayName,
          }))
        : [];

      return textResult({
        issueKey: issueIdOrKey,
        votes: response.data?.votes ?? 0,
        hasVoted: response.data?.hasVoted ?? false,
        voters,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_add_vote",
  {
    title: "Vote for Issue",
    description:
      "Add your vote to an issue.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
  },
  async ({ issueIdOrKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.post(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/votes`
      );

      return textResult({
        success: true,
        issueKey: issueIdOrKey,
        message: `Vote added successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_remove_vote",
  {
    title: "Remove Vote",
    description:
      "Remove your vote from an issue.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
  },
  async ({ issueIdOrKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.delete(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/votes`
      );

      return textResult({
        success: true,
        issueKey: issueIdOrKey,
        message: `Vote removed successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 4: Attachments ============

server.registerTool(
  "jira_get_attachments",
  {
    title: "Get Issue Attachments",
    description:
      "Get all attachments for an issue.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
  },
  async ({ issueIdOrKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`,
        {
          params: { fields: "attachment" },
        }
      );

      const attachments = Array.isArray(response.data?.fields?.attachment)
        ? response.data.fields.attachment.map((a: any) => ({
            id: a.id,
            filename: a.filename,
            size: a.size,
            mimeType: a.mimeType,
            content: a.content,
            thumbnail: a.thumbnail,
            author: a.author?.displayName,
            created: a.created,
          }))
        : [];

      return textResult({
        issueKey: issueIdOrKey,
        attachments,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_delete_attachment",
  {
    title: "Delete Attachment",
    description:
      "Delete an attachment from an issue.",
    inputSchema: z.object({
      attachmentId: z.string().min(1).describe("Attachment ID to delete"),
    }),
  },
  async ({ attachmentId }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.delete(`/rest/api/3/attachment/${attachmentId}`);

      return textResult({
        success: true,
        message: `Attachment ${attachmentId} deleted successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 5: Epic Management ============

server.registerTool(
  "jira_get_epics",
  {
    title: "Get Epics",
    description:
      "Get epics for a board.",
    inputSchema: z.object({
      boardId: z.number().int().positive().describe("Board ID"),
      done: z.enum(["true", "false"]).optional().describe("Filter by completion status"),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(50).optional().default(50),
    }),
  },
  async ({ boardId, done, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/agile/1.0/board/${boardId}/epic`, {
        params: {
          done,
          startAt,
          maxResults: maxResults ?? 50,
        },
      });

      const epics = Array.isArray(response.data?.values)
        ? response.data.values.map((e: any) => ({
            id: e.id,
            key: e.key,
            name: e.name,
            summary: e.summary,
            done: e.done ?? false,
          }))
        : [];

      return textResult({
        total: response.data?.total ?? epics.length,
        startAt: response.data?.startAt ?? 0,
        boardId,
        epics,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_epic_issues",
  {
    title: "Get Epic Issues",
    description:
      "Get all issues belonging to an epic.",
    inputSchema: z.object({
      epicIdOrKey: z.string().min(1).describe("Epic ID or key"),
      jql: z.string().optional().describe("Additional JQL filter"),
      fields: z.array(z.string()).optional().describe("Fields to return"),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(100).optional().default(50),
    }),
  },
  async ({ epicIdOrKey, jql, fields, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/agile/1.0/epic/${epicIdOrKey}/issue`, {
        params: {
          jql,
          fields: fields?.join(","),
          startAt,
          maxResults: maxResults ?? 50,
        },
      });

      const issues = Array.isArray(response.data?.issues)
        ? response.data.issues.map((issue: any) => ({
            key: issue.key,
            summary: issue.fields?.summary,
            status: issue.fields?.status?.name,
            assignee: issue.fields?.assignee?.displayName,
            issueType: issue.fields?.issuetype?.name,
          }))
        : [];

      return textResult({
        total: response.data?.total ?? issues.length,
        startAt: response.data?.startAt ?? 0,
        epicKey: epicIdOrKey,
        issues,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_move_issues_to_epic",
  {
    title: "Move Issues to Epic",
    description:
      "Move issues to an epic.",
    inputSchema: z.object({
      epicIdOrKey: z.string().min(1).describe("Epic ID or key"),
      issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to move"),
    }),
  },
  async ({ epicIdOrKey, issueKeys }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.post(`/rest/agile/1.0/epic/${epicIdOrKey}/issue`, {
        issues: issueKeys,
      });

      return textResult({
        success: true,
        epicKey: epicIdOrKey,
        issuesMoved: issueKeys,
        message: `${issueKeys.length} issue(s) moved to epic ${epicIdOrKey}`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_remove_issues_from_epic",
  {
    title: "Remove Issues from Epic",
    description:
      "Remove issues from their epic (move to no epic).",
    inputSchema: z.object({
      issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to remove from epic"),
    }),
  },
  async ({ issueKeys }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.post("/rest/agile/1.0/epic/none/issue", {
        issues: issueKeys,
      });

      return textResult({
        success: true,
        issuesRemoved: issueKeys,
        message: `${issueKeys.length} issue(s) removed from epic`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 6: Fields and Metadata ============

server.registerTool(
  "jira_get_fields",
  {
    title: "Get All Fields",
    description:
      "Get all available fields including custom fields.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/field");

      return textResult(
        (response.data || []).map((f: any) => ({
          id: f.id,
          key: f.key,
          name: f.name,
          custom: f.custom ?? false,
          orderable: f.orderable ?? false,
          navigable: f.navigable ?? false,
          searchable: f.searchable ?? false,
          clauseNames: f.clauseNames || [],
          schema: f.schema,
        }))
      );
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_create_metadata",
  {
    title: "Get Create Issue Metadata",
    description:
      "Get metadata for creating issues in a project, including required fields.",
    inputSchema: z.object({
      projectKeys: z.array(z.string()).optional().describe("Project keys to get metadata for"),
      projectIds: z.array(z.string()).optional().describe("Project IDs to get metadata for"),
      issuetypeNames: z.array(z.string()).optional().describe("Issue type names to filter"),
      expand: z.string().optional().describe("Expand options"),
    }),
  },
  async ({ projectKeys, projectIds, issuetypeNames, expand }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/issue/createmeta", {
        params: {
          projectKeys: projectKeys?.join(","),
          projectIds: projectIds?.join(","),
          issuetypeNames: issuetypeNames?.join(","),
          expand: expand || "projects.issuetypes.fields",
        },
      });

      return textResult(response.data);
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_edit_metadata",
  {
    title: "Get Edit Issue Metadata",
    description:
      "Get metadata for editing a specific issue, including editable fields.",
    inputSchema: z.object({
      issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
  },
  async ({ issueIdOrKey }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/editmeta`
      );

      return textResult(response.data);
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============ Phase 7: Filters and Dashboards ============

server.registerTool(
  "jira_get_filters",
  {
    title: "Get Filters",
    description:
      "Get saved filters, optionally filtered by name.",
    inputSchema: z.object({
      filterName: z.string().optional().describe("Filter by name (contains)"),
      owner: z.string().optional().describe("Filter by owner account ID"),
      expand: z.string().optional().describe("Expand options: description, owner, jql, viewUrl, searchUrl, favourite, favouritedCount, sharePermissions"),
      startAt: z.number().int().nonnegative().optional(),
      maxResults: z.number().int().positive().max(50).optional().default(50),
    }),
  },
  async ({ filterName, owner, expand, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/filter/search", {
        params: {
          filterName,
          owner,
          expand,
          startAt,
          maxResults: maxResults ?? 50,
        },
      });

      const filters = Array.isArray(response.data?.values)
        ? response.data.values.map((f: any) => ({
            id: f.id,
            name: f.name,
            description: f.description,
            owner: f.owner?.displayName,
            jql: f.jql,
            favourite: f.favourite ?? false,
            favouritedCount: f.favouritedCount ?? 0,
          }))
        : [];

      return textResult({
        total: response.data?.total ?? filters.length,
        startAt: response.data?.startAt ?? 0,
        filters,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_filter",
  {
    title: "Get Filter Details",
    description:
      "Get details of a specific filter.",
    inputSchema: z.object({
      filterId: z.string().min(1).describe("Filter ID"),
      expand: z.string().optional().describe("Expand options"),
    }),
  },
  async ({ filterId, expand }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/api/3/filter/${filterId}`, {
        params: { expand },
      });

      return textResult({
        id: response.data?.id,
        name: response.data?.name,
        description: response.data?.description,
        owner: response.data?.owner?.displayName,
        jql: response.data?.jql,
        favourite: response.data?.favourite ?? false,
        sharePermissions: response.data?.sharePermissions,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_create_filter",
  {
    title: "Create Filter",
    description:
      "Create a new saved filter.",
    inputSchema: z.object({
      name: z.string().min(1).describe("Filter name"),
      jql: z.string().min(1).describe("JQL query"),
      description: z.string().optional().describe("Filter description"),
      favourite: z.boolean().optional().describe("Mark as favourite"),
    }),
  },
  async ({ name, jql, description, favourite }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.post("/rest/api/3/filter", {
        name,
        jql,
        description,
        favourite,
      });

      return textResult({
        success: true,
        id: response.data?.id,
        name: response.data?.name,
        jql: response.data?.jql,
        message: `Filter "${name}" created successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_update_filter",
  {
    title: "Update Filter",
    description:
      "Update an existing filter.",
    inputSchema: z.object({
      filterId: z.string().min(1).describe("Filter ID"),
      name: z.string().optional().describe("New filter name"),
      jql: z.string().optional().describe("New JQL query"),
      description: z.string().optional().describe("New description"),
      favourite: z.boolean().optional().describe("Favourite status"),
    }),
  },
  async ({ filterId, name, jql, description, favourite }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const payload: Record<string, unknown> = {};
      if (name !== undefined) payload.name = name;
      if (jql !== undefined) payload.jql = jql;
      if (description !== undefined) payload.description = description;
      if (favourite !== undefined) payload.favourite = favourite;

      if (Object.keys(payload).length === 0) {
        return textResult({
          error: "no_changes",
          message: "No fields provided to update",
        });
      }

      const response = await client.put(`/rest/api/3/filter/${filterId}`, payload);

      return textResult({
        success: true,
        id: response.data?.id ?? filterId,
        name: response.data?.name,
        message: `Filter updated successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_delete_filter",
  {
    title: "Delete Filter",
    description:
      "Delete a saved filter.",
    inputSchema: z.object({
      filterId: z.string().min(1).describe("Filter ID to delete"),
      confirmDelete: z.boolean().describe("Must be true to confirm deletion"),
    }),
  },
  async ({ filterId, confirmDelete }) => {
    try {
      if (!confirmDelete) {
        return textResult({
          error: "confirmation_required",
          message: "Deletion not confirmed. Set confirmDelete: true to proceed.",
          filterId,
        });
      }

      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      await client.delete(`/rest/api/3/filter/${filterId}`);

      return textResult({
        success: true,
        message: `Filter ${filterId} deleted successfully`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_my_filters",
  {
    title: "Get My Filters",
    description:
      "Get filters owned by the current user.",
    inputSchema: z.object({
      expand: z.string().optional().describe("Expand options"),
    }),
  },
  async ({ expand }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/filter/my", {
        params: { expand },
      });

      return textResult(
        (response.data || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          jql: f.jql,
          favourite: f.favourite ?? false,
        }))
      );
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_favourite_filters",
  {
    title: "Get Favourite Filters",
    description:
      "Get filters marked as favourite by the current user.",
    inputSchema: z.object({
      expand: z.string().optional().describe("Expand options"),
    }),
  },
  async ({ expand }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/filter/favourite", {
        params: { expand },
      });

      return textResult(
        (response.data || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          owner: f.owner?.displayName,
          jql: f.jql,
        }))
      );
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============================================================================
// PHASE 8: BULK OPERATIONS
// ============================================================================

server.registerTool(
  "jira_bulk_edit_issues",
  {
    title: "Bulk Edit Issues",
    description:
      "Edit multiple issues at once. Supports bulk editing of labels, assignee, priority, components, and fix versions. Returns a taskId to track progress.",
    inputSchema: z.object({
      issueIdsOrKeys: z
        .array(z.string())
        .min(1)
        .describe("Array of issue IDs or keys to edit"),
      editedFieldsInput: z
        .object({
          labels: z
            .object({
              add: z.array(z.string()).optional().describe("Labels to add"),
              remove: z.array(z.string()).optional().describe("Labels to remove"),
              set: z.array(z.string()).optional().describe("Labels to set (replaces all)"),
            })
            .optional(),
          assignee: z
            .object({
              accountId: z.string().describe("Account ID of the assignee"),
            })
            .optional(),
          priority: z
            .object({
              id: z.string().describe("Priority ID"),
            })
            .optional(),
          components: z
            .object({
              add: z.array(z.object({ id: z.string() })).optional(),
              remove: z.array(z.object({ id: z.string() })).optional(),
            })
            .optional(),
          fixVersions: z
            .object({
              add: z.array(z.object({ id: z.string() })).optional(),
              remove: z.array(z.object({ id: z.string() })).optional(),
            })
            .optional(),
        })
        .describe("Fields to edit with their operations"),
      sendNotifications: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to send email notifications"),
    }),
  },
  async ({ issueIdsOrKeys, editedFieldsInput, sendNotifications }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.post("/rest/api/3/bulk/issues/fields", {
        issueIdsOrKeys,
        editedFieldsInput,
        sendNotifications,
      });

      return textResult({
        success: true,
        taskId: response.data.taskId,
        message: `Bulk edit initiated for ${issueIdsOrKeys.length} issues. Use jira_get_bulk_operation_progress with taskId to track progress.`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_bulk_watch_issues",
  {
    title: "Bulk Watch Issues",
    description:
      "Add watchers to multiple issues at once. Returns a taskId to track progress.",
    inputSchema: z.object({
      issueIdsOrKeys: z
        .array(z.string())
        .min(1)
        .describe("Array of issue IDs or keys to watch"),
      accountIds: z
        .array(z.string())
        .optional()
        .describe("Account IDs to add as watchers (defaults to current user)"),
    }),
  },
  async ({ issueIdsOrKeys, accountIds }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.post("/rest/api/3/bulk/issues/watch", {
        issueIdsOrKeys,
        ...(accountIds && { accountIds }),
      });

      return textResult({
        success: true,
        taskId: response.data.taskId,
        message: `Bulk watch initiated for ${issueIdsOrKeys.length} issues. Use jira_get_bulk_operation_progress with taskId to track progress.`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_bulk_unwatch_issues",
  {
    title: "Bulk Unwatch Issues",
    description:
      "Remove watchers from multiple issues at once. Returns a taskId to track progress.",
    inputSchema: z.object({
      issueIdsOrKeys: z
        .array(z.string())
        .min(1)
        .describe("Array of issue IDs or keys to unwatch"),
      accountIds: z
        .array(z.string())
        .optional()
        .describe("Account IDs to remove as watchers (defaults to current user)"),
    }),
  },
  async ({ issueIdsOrKeys, accountIds }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.post("/rest/api/3/bulk/issues/unwatch", {
        issueIdsOrKeys,
        ...(accountIds && { accountIds }),
      });

      return textResult({
        success: true,
        taskId: response.data.taskId,
        message: `Bulk unwatch initiated for ${issueIdsOrKeys.length} issues. Use jira_get_bulk_operation_progress with taskId to track progress.`,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_bulk_operation_progress",
  {
    title: "Get Bulk Operation Progress",
    description:
      "Check the progress of an async bulk operation using its taskId.",
    inputSchema: z.object({
      taskId: z.string().describe("The task ID returned from a bulk operation"),
    }),
  },
  async ({ taskId }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/api/3/bulk/queue/${taskId}`);

      const data = response.data;
      return textResult({
        taskId: data.taskId,
        status: data.status,
        progress: data.progress,
        submittedBy: data.submittedBy,
        created: data.created,
        started: data.started,
        finished: data.finished,
        successfulIssues: data.successfulIssues || [],
        failedIssues: data.failedIssues || [],
        totalIssues: (data.successfulIssues?.length || 0) + (data.failedIssues?.length || 0),
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============================================================================
// PHASE 9: DASHBOARD MANAGEMENT
// ============================================================================

server.registerTool(
  "jira_get_dashboards",
  {
    title: "Get Dashboards",
    description:
      "Get a list of dashboards. Can filter by favourite or owned dashboards.",
    inputSchema: z.object({
      filter: z
        .enum(["favourite", "my"])
        .optional()
        .describe("Filter dashboards: 'favourite' for favourited, 'my' for owned"),
      startAt: z.number().optional().default(0).describe("Index of first result"),
      maxResults: z.number().optional().default(50).describe("Maximum results to return"),
    }),
  },
  async ({ filter, startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/dashboard", {
        params: { filter, startAt, maxResults },
      });

      return textResult({
        total: response.data.total,
        startAt: response.data.startAt,
        maxResults: response.data.maxResults,
        dashboards: (response.data.dashboards || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          self: d.self,
          isFavourite: d.isFavourite,
          view: d.view,
        })),
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_search_dashboards",
  {
    title: "Search Dashboards",
    description:
      "Search for dashboards by name, owner, or other criteria.",
    inputSchema: z.object({
      dashboardName: z
        .string()
        .optional()
        .describe("Filter by dashboard name (case insensitive contains)"),
      accountId: z.string().optional().describe("Filter by owner account ID"),
      groupname: z.string().optional().describe("Filter by group permission"),
      orderBy: z
        .enum([
          "name",
          "-name",
          "id",
          "-id",
          "owner",
          "-owner",
          "favourite_count",
          "-favourite_count",
        ])
        .optional()
        .describe("Order results by field (prefix with - for descending)"),
      startAt: z.number().optional().default(0).describe("Index of first result"),
      maxResults: z.number().optional().default(50).describe("Maximum results"),
      expand: z
        .string()
        .optional()
        .describe("Expand options: description, owner, viewUrl, favourite, favouritedCount, sharePermissions, editPermissions"),
    }),
  },
  async ({ dashboardName, accountId, groupname, orderBy, startAt, maxResults, expand }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/dashboard/search", {
        params: {
          dashboardName,
          accountId,
          groupname,
          orderBy,
          startAt,
          maxResults,
          expand,
        },
      });

      return textResult({
        total: response.data.total,
        startAt: response.data.startAt,
        maxResults: response.data.maxResults,
        dashboards: (response.data.values || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          owner: d.owner
            ? { accountId: d.owner.accountId, displayName: d.owner.displayName }
            : undefined,
          isFavourite: d.isFavourite,
          popularity: d.popularity,
          view: d.view,
        })),
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_dashboard",
  {
    title: "Get Dashboard",
    description: "Get details of a specific dashboard by ID.",
    inputSchema: z.object({
      id: z.string().describe("Dashboard ID"),
    }),
  },
  async ({ id }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/api/3/dashboard/${id}`);

      const d = response.data;
      return textResult({
        id: d.id,
        name: d.name,
        description: d.description,
        self: d.self,
        isFavourite: d.isFavourite,
        owner: d.owner
          ? { accountId: d.owner.accountId, displayName: d.owner.displayName }
          : undefined,
        popularity: d.popularity,
        view: d.view,
        editPermissions: d.editPermissions,
        sharePermissions: d.sharePermissions,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_dashboard_gadgets",
  {
    title: "Get Dashboard Gadgets",
    description: "Get all gadgets on a dashboard.",
    inputSchema: z.object({
      dashboardId: z.string().describe("Dashboard ID"),
      moduleKey: z
        .array(z.string())
        .optional()
        .describe("Filter by gadget module keys"),
      uri: z.string().optional().describe("Filter by gadget URI"),
      gadgetId: z.array(z.string()).optional().describe("Filter by gadget IDs"),
    }),
  },
  async ({ dashboardId, moduleKey, uri, gadgetId }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        `/rest/api/3/dashboard/${dashboardId}/gadget`,
        {
          params: {
            moduleKey: moduleKey?.join(","),
            uri,
            gadgetId: gadgetId?.join(","),
          },
        }
      );

      return textResult({
        gadgets: (response.data.gadgets || []).map((g: any) => ({
          id: g.id,
          moduleKey: g.moduleKey,
          uri: g.uri,
          color: g.color,
          position: g.position,
          title: g.title,
        })),
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_add_dashboard_gadget",
  {
    title: "Add Dashboard Gadget",
    description:
      "Add a gadget to a dashboard. Provide either moduleKey or uri to specify the gadget type.",
    inputSchema: z.object({
      dashboardId: z.string().describe("Dashboard ID"),
      moduleKey: z
        .string()
        .optional()
        .describe("Module key of the gadget type (e.g., com.atlassian.jira.gadgets:filter-results-gadget)"),
      uri: z.string().optional().describe("URI of the gadget type"),
      color: z
        .enum(["blue", "red", "yellow", "green", "cyan", "purple", "gray", "white"])
        .optional()
        .describe("Gadget colour"),
      position: z
        .object({
          row: z.number().describe("Row position (0-indexed)"),
          column: z.number().describe("Column position (0-indexed)"),
        })
        .optional()
        .describe("Position on dashboard grid"),
      title: z.string().optional().describe("Gadget title"),
      ignoreUriAndModuleKeyValidation: z
        .boolean()
        .optional()
        .default(false)
        .describe("Skip validation of moduleKey/uri"),
    }),
  },
  async ({
    dashboardId,
    moduleKey,
    uri,
    color,
    position,
    title,
    ignoreUriAndModuleKeyValidation,
  }) => {
    try {
      if (!moduleKey && !uri) {
        return textResult({
          error: true,
          message: "Either moduleKey or uri must be provided",
        });
      }

      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.post(
        `/rest/api/3/dashboard/${dashboardId}/gadget`,
        {
          moduleKey,
          uri,
          color,
          position,
          title,
          ignoreUriAndModuleKeyValidation,
        }
      );

      return textResult({
        success: true,
        gadget: {
          id: response.data.id,
          moduleKey: response.data.moduleKey,
          uri: response.data.uri,
          color: response.data.color,
          position: response.data.position,
          title: response.data.title,
        },
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============================================================================
// PHASE 10: ATTACHMENTS ENHANCED
// ============================================================================

server.registerTool(
  "jira_upload_attachment",
  {
    title: "Upload Attachment",
    description:
      "Upload a file attachment to an issue. Requires the file path on the local filesystem.",
    inputSchema: z.object({
      issueIdOrKey: z.string().describe("Issue ID or key"),
      filePath: z.string().describe("Absolute path to the file to upload"),
      filename: z
        .string()
        .optional()
        .describe("Override the filename (defaults to original filename)"),
    }),
  },
  async ({ issueIdOrKey, filePath, filename }) => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const FormData = (await import("form-data")).default;

      if (!fs.existsSync(filePath)) {
        return textResult({
          error: true,
          message: `File not found: ${filePath}`,
        });
      }

      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const form = new FormData();
      const fileStream = fs.createReadStream(filePath);
      const finalFilename = filename || path.basename(filePath);
      form.append("file", fileStream, finalFilename);

      const response = await client.post(
        `/rest/api/3/issue/${issueIdOrKey}/attachments`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            "X-Atlassian-Token": "no-check",
          },
        }
      );

      const attachments = response.data || [];
      return textResult({
        success: true,
        attachments: attachments.map((a: any) => ({
          id: a.id,
          filename: a.filename,
          size: a.size,
          mimeType: a.mimeType,
          created: a.created,
          author: a.author?.displayName,
          content: a.content,
        })),
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_attachment_metadata",
  {
    title: "Get Attachment Metadata",
    description: "Get metadata for a specific attachment by ID.",
    inputSchema: z.object({
      id: z.string().describe("Attachment ID"),
    }),
  },
  async ({ id }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/api/3/attachment/${id}`);

      const a = response.data;
      return textResult({
        id: a.id,
        filename: a.filename,
        size: a.size,
        mimeType: a.mimeType,
        created: a.created,
        author: a.author
          ? { accountId: a.author.accountId, displayName: a.author.displayName }
          : undefined,
        content: a.content,
        thumbnail: a.thumbnail,
        self: a.self,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_attachment_content",
  {
    title: "Get Attachment Content",
    description:
      "Get the content/download URL for an attachment. Returns the redirect URL or content depending on redirect setting.",
    inputSchema: z.object({
      id: z.string().describe("Attachment ID"),
      redirect: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to return redirect URL (true) or follow redirect (false)"),
    }),
  },
  async ({ id, redirect }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(`/rest/api/3/attachment/content/${id}`, {
        params: { redirect },
        maxRedirects: redirect ? 0 : 5,
        validateStatus: (status) => status < 400 || status === 302,
      });

      if (response.status === 302 || response.headers.location) {
        return textResult({
          downloadUrl: response.headers.location || response.data,
          message: "Use this URL to download the attachment content",
        });
      }

      return textResult({
        contentType: response.headers["content-type"],
        contentLength: response.headers["content-length"],
        message: "Content retrieved. For binary files, use the download URL instead.",
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============================================================================
// PHASE 11: LABELS MANAGEMENT
// ============================================================================

server.registerTool(
  "jira_get_all_labels",
  {
    title: "Get All Labels",
    description:
      "Get all labels used across all issues in the Jira instance.",
    inputSchema: z.object({
      startAt: z.number().optional().default(0).describe("Index of first result"),
      maxResults: z
        .number()
        .optional()
        .default(1000)
        .describe("Maximum results to return"),
    }),
  },
  async ({ startAt, maxResults }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get("/rest/api/3/label", {
        params: { startAt, maxResults },
      });

      return textResult({
        total: response.data.total,
        maxResults: response.data.maxResults,
        startAt: response.data.startAt,
        labels: response.data.values || [],
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_add_labels",
  {
    title: "Add/Set/Remove Labels",
    description:
      "Add, set, or remove labels on an issue. Use 'add' to append, 'set' to replace all, or 'remove' to delete specific labels.",
    inputSchema: z.object({
      issueIdOrKey: z.string().describe("Issue ID or key"),
      labels: z.array(z.string()).min(1).describe("Labels to add/set/remove"),
      operation: z
        .enum(["add", "set", "remove"])
        .default("add")
        .describe("Operation: 'add' appends, 'set' replaces all, 'remove' deletes specified labels"),
    }),
  },
  async ({ issueIdOrKey, labels, operation }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      let updatePayload: any;

      if (operation === "set") {
        updatePayload = {
          fields: {
            labels: labels,
          },
        };
      } else {
        updatePayload = {
          update: {
            labels: labels.map((label) => ({ [operation]: label })),
          },
        };
      }

      await client.put(`/rest/api/3/issue/${issueIdOrKey}`, updatePayload);

      return textResult({
        success: true,
        message: `Labels ${operation === "add" ? "added to" : operation === "remove" ? "removed from" : "set on"} issue ${issueIdOrKey}`,
        labels: labels,
        operation: operation,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============================================================================
// PHASE 12: JQL TOOLS
// ============================================================================

server.registerTool(
  "jira_autocomplete_jql",
  {
    title: "Autocomplete JQL",
    description:
      "Get autocomplete suggestions for JQL field values. Useful for building JQL queries interactively.",
    inputSchema: z.object({
      fieldName: z
        .string()
        .optional()
        .describe("Field name to get value suggestions for (e.g., status, priority, assignee)"),
      fieldValue: z
        .string()
        .optional()
        .describe("Partial value to autocomplete"),
      predicateName: z
        .string()
        .optional()
        .describe("Predicate name for function suggestions"),
      predicateValue: z
        .string()
        .optional()
        .describe("Partial predicate value to autocomplete"),
    }),
  },
  async ({ fieldName, fieldValue, predicateName, predicateValue }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.get(
        "/rest/api/3/jql/autocompletedata/suggestions",
        {
          params: {
            fieldName,
            fieldValue,
            predicateName,
            predicateValue,
          },
        }
      );

      return textResult({
        results: (response.data.results || []).map((r: any) => ({
          value: r.value,
          displayName: r.displayName,
        })),
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_validate_jql",
  {
    title: "Validate JQL",
    description:
      "Validate one or more JQL queries for syntax and semantic correctness.",
    inputSchema: z.object({
      queries: z
        .array(z.string())
        .min(1)
        .describe("JQL queries to validate"),
      validation: z
        .enum(["strict", "warn", "none"])
        .optional()
        .default("strict")
        .describe("Validation level: strict (errors only), warn (errors and warnings), none (no validation)"),
    }),
  },
  async ({ queries, validation }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.post("/rest/api/3/jql/parse", {
        queries,
        validation,
      });

      return textResult({
        queries: (response.data.queries || []).map((q: any) => ({
          query: q.query,
          errors: q.errors || [],
          warnings: q.warnings || [],
          isValid: !q.errors || q.errors.length === 0,
        })),
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_parse_jql",
  {
    title: "Parse JQL",
    description:
      "Parse JQL queries and return their abstract syntax tree (AST) structure. Useful for understanding query structure.",
    inputSchema: z.object({
      queries: z.array(z.string()).min(1).describe("JQL queries to parse"),
      validation: z
        .enum(["strict", "warn", "none"])
        .optional()
        .default("none")
        .describe("Validation level"),
    }),
  },
  async ({ queries, validation }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const response = await client.post("/rest/api/3/jql/parse", {
        queries,
        validation,
      });

      return textResult({
        queries: (response.data.queries || []).map((q: any) => ({
          query: q.query,
          structure: q.structure,
          errors: q.errors || [],
        })),
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

// ============================================================================
// PHASE 13: TIME TRACKING REPORTS
// ============================================================================

server.registerTool(
  "jira_get_updated_worklog_ids",
  {
    title: "Get Updated Worklog IDs",
    description:
      "Get IDs of worklogs that were created or updated since a specific date/time. Use this to discover worklogs for reporting purposes.",
    inputSchema: z.object({
      since: z
        .string()
        .describe(
          "Get worklogs updated since this date. Can be ISO 8601 format (e.g., '2026-01-15T00:00:00.000Z') or Unix timestamp in milliseconds."
        ),
      expand: z
        .string()
        .optional()
        .describe("Expand options for additional worklog properties"),
    }),
  },
  async ({ since, expand }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      // Convert ISO date string to Unix timestamp if needed
      let sinceTimestamp: number;
      if (/^\d+$/.test(since)) {
        sinceTimestamp = parseInt(since, 10);
      } else {
        sinceTimestamp = new Date(since).getTime();
      }

      const params: Record<string, unknown> = { since: sinceTimestamp };
      if (expand) params.expand = expand;

      const response = await client.get("/rest/api/3/worklog/updated", { params });

      return textResult({
        since: sinceTimestamp,
        sinceDate: new Date(sinceTimestamp).toISOString(),
        until: response.data.until,
        untilDate: response.data.until ? new Date(response.data.until).toISOString() : null,
        lastPage: response.data.lastPage,
        nextPage: response.data.nextPage,
        worklogIds: (response.data.values || []).map((v: any) => ({
          worklogId: v.worklogId,
          updatedTime: v.updatedTime,
          updatedDate: new Date(v.updatedTime).toISOString(),
        })),
        total: response.data.values?.length || 0,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_worklogs_by_ids",
  {
    title: "Get Worklogs by IDs",
    description:
      "Get full worklog details for a list of worklog IDs. Use after getting IDs from jira_get_updated_worklog_ids.",
    inputSchema: z.object({
      ids: z
        .array(z.number().int().positive())
        .min(1)
        .max(1000)
        .describe("Array of worklog IDs to fetch (max 1000)"),
      expand: z.string().optional().describe("Expand options"),
    }),
  },
  async ({ ids, expand }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      const params: Record<string, unknown> = {};
      if (expand) params.expand = expand;

      const response = await client.post(
        "/rest/api/3/worklog/list",
        { ids },
        { params }
      );

      const worklogs = Array.isArray(response.data)
        ? response.data.map((worklog: any) => ({
            id: worklog.id,
            issueId: worklog.issueId,
            author: {
              accountId: worklog.author?.accountId,
              displayName: worklog.author?.displayName,
              emailAddress: worklog.author?.emailAddress,
            },
            updateAuthor: {
              accountId: worklog.updateAuthor?.accountId,
              displayName: worklog.updateAuthor?.displayName,
            },
            timeSpent: worklog.timeSpent,
            timeSpentSeconds: worklog.timeSpentSeconds,
            started: worklog.started,
            created: worklog.created,
            updated: worklog.updated,
            comment: normalizeFieldText(worklog.comment),
          }))
        : [];

      return textResult({
        worklogs,
        total: worklogs.length,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_user_worklogs",
  {
    title: "Get User Worklogs",
    description:
      "Get all worklogs for a specific user within a date range. Combines worklog discovery and filtering to provide a complete time tracking report for a person.",
    inputSchema: z.object({
      accountId: z
        .string()
        .optional()
        .describe(
          "User account ID to filter worklogs for. If not provided, returns worklogs for the current user."
        ),
      since: z
        .string()
        .describe(
          "Start date for the report. ISO 8601 format (e.g., '2026-01-15') or relative like '30 days ago' will be parsed."
        ),
      until: z
        .string()
        .optional()
        .describe("End date for the report. Defaults to now if not provided."),
      includeIssueDetails: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to fetch issue details (key, summary) for each worklog"),
    }),
  },
  async ({ accountId, since, until, includeIssueDetails }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      // Get current user if no accountId provided
      let targetAccountId = accountId;
      let targetUserName = "";
      if (!targetAccountId) {
        const meResponse = await client.get("/rest/api/3/myself");
        targetAccountId = meResponse.data.accountId;
        targetUserName = meResponse.data.displayName || meResponse.data.emailAddress;
      }

      // Parse since date
      let sinceTimestamp: number;
      const sinceMatch = since.match(/^(\d+)\s*(days?|weeks?|months?)\s*ago$/i);
      if (sinceMatch && sinceMatch[1] && sinceMatch[2]) {
        const amount = parseInt(sinceMatch[1], 10);
        const unit = sinceMatch[2].toLowerCase();
        const now = new Date();
        if (unit.startsWith("day")) {
          now.setDate(now.getDate() - amount);
        } else if (unit.startsWith("week")) {
          now.setDate(now.getDate() - amount * 7);
        } else if (unit.startsWith("month")) {
          now.setMonth(now.getMonth() - amount);
        }
        sinceTimestamp = now.getTime();
      } else {
        sinceTimestamp = new Date(since).getTime();
      }

      // Parse until date
      let untilTimestamp: number | undefined;
      if (until) {
        untilTimestamp = new Date(until).getTime();
      }

      // Fetch all updated worklog IDs since the date (paginated)
      const allWorklogIds: Array<number> = [];
      let nextPageUrl: string | undefined = `/rest/api/3/worklog/updated?since=${sinceTimestamp}`;
      let pageCount = 0;
      const maxPages = 10; // Safety limit

      while (nextPageUrl && pageCount < maxPages) {
        const pageResponse: { data: { values?: Array<{ worklogId: number; updatedTime: number }>; lastPage?: boolean; nextPage?: string } } = await client.get(nextPageUrl);
        const values = pageResponse.data.values || [];
        
        for (const v of values) {
          // Filter by until date if provided
          if (untilTimestamp && v.updatedTime > untilTimestamp) {
            continue;
          }
          allWorklogIds.push(v.worklogId);
        }

        if (pageResponse.data.lastPage) {
          break;
        }
        nextPageUrl = pageResponse.data.nextPage;
        pageCount++;
      }

      if (allWorklogIds.length === 0) {
        return textResult({
          user: targetUserName || targetAccountId,
          accountId: targetAccountId,
          period: {
            since: new Date(sinceTimestamp).toISOString(),
            until: untilTimestamp ? new Date(untilTimestamp).toISOString() : new Date().toISOString(),
          },
          worklogs: [],
          summary: {
            totalWorklogs: 0,
            totalTimeSpentSeconds: 0,
            totalTimeSpent: "0h",
          },
        });
      }

      // Fetch worklog details in batches of 1000
      const allWorklogs: Array<any> = [];
      for (let i = 0; i < allWorklogIds.length; i += 1000) {
        const batchIds = allWorklogIds.slice(i, i + 1000);
        const response = await client.post("/rest/api/3/worklog/list", { ids: batchIds });
        if (Array.isArray(response.data)) {
          allWorklogs.push(...response.data);
        }
      }

      // Filter worklogs by user
      const userWorklogs = allWorklogs.filter(
        (w: any) => w.author?.accountId === targetAccountId
      );

      // Optionally fetch issue details
      const issueCache: Record<string, { key: string; summary: string }> = {};
      if (includeIssueDetails && userWorklogs.length > 0) {
        const uniqueIssueIds = [...new Set(userWorklogs.map((w: any) => w.issueId))];
        // Fetch issues in batches using JQL
        for (let i = 0; i < uniqueIssueIds.length; i += 50) {
          const batchIds = uniqueIssueIds.slice(i, i + 50);
          try {
            const issueResponse = await client.get("/rest/api/3/search", {
              params: {
                jql: `id in (${batchIds.join(",")})`,
                fields: "summary",
                maxResults: 50,
              },
            });
            for (const issue of issueResponse.data.issues || []) {
              issueCache[issue.id] = {
                key: issue.key,
                summary: issue.fields?.summary || "",
              };
            }
          } catch {
            // Continue even if some issues can't be fetched
          }
        }
      }

      // Format worklogs
      const formattedWorklogs = userWorklogs.map((w: any) => {
        const result: Record<string, unknown> = {
          id: w.id,
          issueId: w.issueId,
          timeSpent: w.timeSpent,
          timeSpentSeconds: w.timeSpentSeconds,
          started: w.started,
          created: w.created,
          comment: normalizeFieldText(w.comment),
        };
        const cachedIssue = issueCache[w.issueId];
        if (includeIssueDetails && cachedIssue) {
          result.issueKey = cachedIssue.key;
          result.issueSummary = cachedIssue.summary;
        }
        return result;
      });

      // Sort by started date
      formattedWorklogs.sort((a: any, b: any) => 
        new Date(a.started).getTime() - new Date(b.started).getTime()
      );

      // Calculate summary
      const totalSeconds = userWorklogs.reduce(
        (sum: number, w: any) => sum + (w.timeSpentSeconds || 0),
        0
      );
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const totalTimeSpent = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;

      // Group by issue if details included
      let byIssue: Record<string, { key: string; summary: string; totalSeconds: number; totalTime: string }> | undefined;
      if (includeIssueDetails) {
        byIssue = {};
        for (const w of formattedWorklogs) {
          const issueId = w.issueId as string;
          if (!byIssue[issueId]) {
            byIssue[issueId] = {
              key: (w.issueKey as string) || issueId,
              summary: (w.issueSummary as string) || "",
              totalSeconds: 0,
              totalTime: "",
            };
          }
          byIssue[issueId].totalSeconds += (w.timeSpentSeconds as number) || 0;
        }
        // Format time for each issue
        for (const issueId of Object.keys(byIssue)) {
          const issueEntry = byIssue[issueId];
          if (issueEntry) {
            const secs = issueEntry.totalSeconds;
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            issueEntry.totalTime = m > 0 ? `${h}h ${m}m` : `${h}h`;
          }
        }
      }

      return textResult({
        user: targetUserName || targetAccountId,
        accountId: targetAccountId,
        period: {
          since: new Date(sinceTimestamp).toISOString(),
          until: untilTimestamp ? new Date(untilTimestamp).toISOString() : new Date().toISOString(),
        },
        worklogs: formattedWorklogs,
        summary: {
          totalWorklogs: formattedWorklogs.length,
          totalTimeSpentSeconds: totalSeconds,
          totalTimeSpent,
          ...(byIssue && { byIssue: Object.values(byIssue) }),
        },
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

server.registerTool(
  "jira_get_deleted_worklog_ids",
  {
    title: "Get Deleted Worklog IDs",
    description:
      "Get IDs of worklogs that were deleted since a specific date/time. Useful for audit and sync purposes.",
    inputSchema: z.object({
      since: z
        .string()
        .describe(
          "Get worklogs deleted since this date. ISO 8601 format or Unix timestamp in milliseconds."
        ),
    }),
  },
  async ({ since }) => {
    try {
      const auth = await getAuthOrThrow();
      const client = createClient(auth);

      // Convert ISO date string to Unix timestamp if needed
      let sinceTimestamp: number;
      if (/^\d+$/.test(since)) {
        sinceTimestamp = parseInt(since, 10);
      } else {
        sinceTimestamp = new Date(since).getTime();
      }

      const response = await client.get("/rest/api/3/worklog/deleted", {
        params: { since: sinceTimestamp },
      });

      return textResult({
        since: sinceTimestamp,
        sinceDate: new Date(sinceTimestamp).toISOString(),
        until: response.data.until,
        lastPage: response.data.lastPage,
        nextPage: response.data.nextPage,
        deletedWorklogIds: (response.data.values || []).map((v: any) => ({
          worklogId: v.worklogId,
          updatedTime: v.updatedTime,
        })),
        total: response.data.values?.length || 0,
      });
    } catch (error) {
      return textResult(errorToResult(error));
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

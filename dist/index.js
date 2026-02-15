import axios, { AxiosError } from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const AUTH_SERVICE = "jira-mcp";
const AUTH_ACCOUNT = "default";
const ACCEPTANCE_FIELD = (process.env.JIRA_ACCEPTANCE_CRITERIA_FIELD || "").trim();
// OAuth constants
const ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize";
const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const ATLASSIAN_API_URL = "https://api.atlassian.com";
const ATLASSIAN_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources";
let inMemoryAuth = null;
let keytarModule = undefined;
async function getKeytar() {
    if (keytarModule !== undefined) {
        return keytarModule;
    }
    try {
        keytarModule = await import("keytar");
    }
    catch {
        keytarModule = null;
    }
    return keytarModule;
}
function normalizeBaseUrl(input) {
    let parsed;
    try {
        parsed = new URL(input);
    }
    catch {
        throw new Error("baseUrl must be a valid URL like https://your-domain.atlassian.net");
    }
    const trimmedPath = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${trimmedPath}`;
}
// ============ Basic Auth Functions ============
function basicAuthFromEnv() {
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
function oauthFromEnv() {
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
function generateAuthorizationUrl(clientId, redirectUri, scopes, state) {
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
async function exchangeCodeForTokens(clientId, clientSecret, code, redirectUri) {
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
async function refreshAccessToken(clientId, clientSecret, refreshToken) {
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
async function getAccessibleResources(accessToken) {
    const response = await axios.get(ATLASSIAN_RESOURCES_URL, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
        },
    });
    return response.data;
}
async function getCloudIdFromResources(accessToken, siteUrl) {
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
async function authFromKeytar() {
    const keytar = await getKeytar();
    if (!keytar)
        return null;
    const stored = await keytar.getPassword(AUTH_SERVICE, AUTH_ACCOUNT);
    if (!stored)
        return null;
    try {
        const parsed = JSON.parse(stored);
        if (parsed.type === "basic") {
            return {
                ...parsed,
                baseUrl: normalizeBaseUrl(parsed.baseUrl),
            };
        }
        return parsed;
    }
    catch {
        return null;
    }
}
async function getAuthOrThrow() {
    if (inMemoryAuth) {
        // Check if OAuth token needs refresh
        if (inMemoryAuth.type === "oauth" && inMemoryAuth.expiresAt && inMemoryAuth.refreshToken) {
            const now = Date.now();
            // Refresh if token expires in less than 5 minutes
            if (now >= inMemoryAuth.expiresAt - 5 * 60 * 1000) {
                try {
                    const tokens = await refreshAccessToken(inMemoryAuth.clientId, inMemoryAuth.clientSecret, inMemoryAuth.refreshToken);
                    inMemoryAuth = {
                        ...inMemoryAuth,
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken || inMemoryAuth.refreshToken,
                        expiresAt: Date.now() + tokens.expiresIn * 1000,
                    };
                }
                catch (error) {
                    // If refresh fails, continue with existing token
                    console.error("Failed to refresh OAuth token:", error);
                }
            }
        }
        return inMemoryAuth;
    }
    // Try OAuth from env first
    const oauthEnv = oauthFromEnv();
    if (oauthEnv)
        return oauthEnv;
    // Try basic auth from env
    const basicEnv = basicAuthFromEnv();
    if (basicEnv)
        return basicEnv;
    // Try keytar
    const keytarAuth = await authFromKeytar();
    if (keytarAuth)
        return keytarAuth;
    throw new Error("MISSING_AUTH");
}
async function setAuth(auth, persist) {
    inMemoryAuth = auth;
    if (!persist)
        return;
    const keytar = await getKeytar();
    if (!keytar) {
        throw new Error("Keytar is not available to persist credentials.");
    }
    await keytar.setPassword(AUTH_SERVICE, AUTH_ACCOUNT, JSON.stringify(auth));
}
async function clearAuth() {
    inMemoryAuth = null;
    const keytar = await getKeytar();
    if (!keytar)
        return;
    await keytar.deletePassword(AUTH_SERVICE, AUTH_ACCOUNT);
}
// ============ Client Creation ============
function createClient(auth) {
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
function adfToText(node) {
    if (!node)
        return "";
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
function normalizeFieldText(value) {
    if (typeof value === "string")
        return value;
    if (typeof value === "number")
        return String(value);
    if (value && typeof value === "object") {
        const maybeAdf = value;
        const text = adfToText(maybeAdf);
        if (text)
            return text;
    }
    return "";
}
function textToAdf(text) {
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
function pickIssueSummary(issue) {
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
function pickIssueSearchSummary(issue) {
    const fields = issue?.fields || {};
    return {
        key: issue?.key ?? "",
        summary: fields.summary ?? "",
        status: fields.status?.name ?? "",
    };
}
function defaultIssueFields() {
    const base = ["summary", "description"];
    if (ACCEPTANCE_FIELD)
        base.push(ACCEPTANCE_FIELD);
    return base;
}
function errorToMessage(error) {
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
function errorToResult(error) {
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
function textResult(value) {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return {
        content: [
            {
                type: "text",
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
function buildIssueFields(params) {
    const fields = {};
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
        fields.components = params.components.map(c => /^\d+$/.test(c) ? { id: c } : { name: c });
    }
    if (params.fixVersions && params.fixVersions.length > 0) {
        fields.fixVersions = params.fixVersions.map(v => /^\d+$/.test(v) ? { id: v } : { name: v });
    }
    if (params.affectsVersions && params.affectsVersions.length > 0) {
        fields.versions = params.affectsVersions.map(v => /^\d+$/.test(v) ? { id: v } : { name: v });
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
            fields.timetracking.originalEstimate = params.originalEstimate;
        }
        if (params.remainingEstimate) {
            fields.timetracking.remainingEstimate = params.remainingEstimate;
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
            }
            else {
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
function buildUpdateOperations(params) {
    const update = {};
    // Labels use simple string values
    if (params.labels) {
        const labelsArr = [];
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
        const componentsArr = [];
        if (params.components.add) {
            params.components.add.forEach(c => componentsArr.push({ add: /^\d+$/.test(c) ? { id: c } : { name: c } }));
        }
        if (params.components.remove) {
            params.components.remove.forEach(c => componentsArr.push({ remove: /^\d+$/.test(c) ? { id: c } : { name: c } }));
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
        const fixVersionsArr = [];
        if (params.fixVersions.add) {
            params.fixVersions.add.forEach(v => fixVersionsArr.push({ add: /^\d+$/.test(v) ? { id: v } : { name: v } }));
        }
        if (params.fixVersions.remove) {
            params.fixVersions.remove.forEach(v => fixVersionsArr.push({ remove: /^\d+$/.test(v) ? { id: v } : { name: v } }));
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
        const versionsArr = [];
        if (params.affectsVersions.add) {
            params.affectsVersions.add.forEach(v => versionsArr.push({ add: /^\d+$/.test(v) ? { id: v } : { name: v } }));
        }
        if (params.affectsVersions.remove) {
            params.affectsVersions.remove.forEach(v => versionsArr.push({ remove: /^\d+$/.test(v) ? { id: v } : { name: v } }));
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
server.registerTool("_internal_jira_set_auth", {
    title: "Set Jira Auth (Basic)",
    description: "Use when the user wants to connect Jira using Basic Auth (email + API token). This tool should only be called when the user explicitly provides credentials.",
    inputSchema: z.object({
        baseUrl: z.string(),
        email: z.string().email(),
        apiToken: z.string().min(1),
        persist: z.boolean().optional().default(false),
    }),
}, async ({ baseUrl, email, apiToken, persist }) => {
    const normalized = normalizeBaseUrl(baseUrl);
    await setAuth({ type: "basic", baseUrl: normalized, email, apiToken }, persist ?? false);
    return textResult("Jira credentials loaded (Basic Auth).");
});
server.registerTool("jira_oauth_get_auth_url", {
    title: "Get OAuth Authorization URL",
    description: "Generate the OAuth 2.0 authorization URL that the user should visit to grant access. Returns the URL and required state parameter.",
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
}, async ({ clientId, redirectUri, scopes }) => {
    const state = Math.random().toString(36).substring(2, 15);
    const authUrl = generateAuthorizationUrl(clientId, redirectUri, scopes, state);
    return textResult({
        authUrl,
        state,
        instructions: "1. Visit the authUrl in your browser\n2. Grant access to your Jira site\n3. Copy the 'code' parameter from the redirect URL\n4. Use jira_oauth_exchange_code to exchange it for tokens",
    });
});
server.registerTool("jira_oauth_exchange_code", {
    title: "Exchange OAuth Code for Tokens",
    description: "Exchange the authorization code for access tokens after the user has completed the OAuth flow.",
    inputSchema: z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        code: z.string().min(1).describe("Authorization code from the OAuth callback"),
        redirectUri: z.string().url(),
        siteUrl: z.string().url().optional().describe("Optional: specific Jira site URL (e.g., https://yoursite.atlassian.net)"),
        persist: z.boolean().optional().default(false),
    }),
}, async ({ clientId, clientSecret, code, redirectUri, siteUrl, persist }) => {
    try {
        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(clientId, clientSecret, code, redirectUri);
        // Get cloud ID
        const { cloudId, siteName, siteUrl: actualSiteUrl } = await getCloudIdFromResources(tokens.accessToken, siteUrl);
        const auth = {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_oauth_set_tokens", {
    title: "Set OAuth Tokens Directly",
    description: "Set OAuth tokens directly if you already have them (e.g., from a previous session or external OAuth flow).",
    inputSchema: z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        accessToken: z.string().min(1),
        refreshToken: z.string().optional(),
        cloudId: z.string().optional().describe("Cloud ID of the Jira site. If not provided, will be fetched automatically."),
        siteUrl: z.string().url().optional().describe("Jira site URL to find the correct cloudId"),
        persist: z.boolean().optional().default(false),
    }),
}, async ({ clientId, clientSecret, accessToken, refreshToken, cloudId, siteUrl, persist }) => {
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
        const auth = {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_oauth_refresh", {
    title: "Refresh OAuth Token",
    description: "Manually refresh the OAuth access token using the refresh token.",
    inputSchema: z.object({}),
}, async () => {
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
        const updatedAuth = {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_oauth_list_sites", {
    title: "List Accessible Jira Sites",
    description: "List all Jira sites accessible with the current OAuth token.",
    inputSchema: z.object({}),
}, async () => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_clear_auth", {
    title: "Clear Jira Auth",
    description: "Use when the user asks to remove or reset stored Jira credentials.",
    inputSchema: z.object({}),
}, async () => {
    await clearAuth();
    return textResult("Jira credentials cleared.");
});
server.registerTool("jira_auth_status", {
    title: "Get Auth Status",
    description: "Check the current authentication status and type.",
    inputSchema: z.object({}),
}, async () => {
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
    }
    catch (error) {
        if (error instanceof Error && error.message === "MISSING_AUTH") {
            return textResult({
                authenticated: false,
                message: "No authentication configured. Use basic auth or OAuth to authenticate.",
            });
        }
        return textResult(errorToResult(error));
    }
});
// ============ Jira API Tools ============
server.registerTool("jira_whoami", {
    title: "Get Jira Profile",
    description: "Use when the user asks who they are in Jira or wants to verify the Jira account in use.",
}, async () => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get("/rest/api/3/myself");
        return textResult(response.data);
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_issue", {
    title: "Get Jira Issue",
    description: "Get the full details of a Jira issue when the user mentions an issue key like PROJ-123 or asks about a specific ticket.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1),
        fields: z.array(z.string()).optional(),
        expand: z.string().optional(),
    }),
}, async ({ issueIdOrKey, fields, expand }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_search_issues", {
    title: "Search Jira Issues",
    description: "Use when the user asks to find issues matching criteria (JQL), like 'my open bugs' or 'tickets updated this week'.",
    inputSchema: z.object({
        jql: z.string().min(1),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(200).optional(),
        fields: z.array(z.string()).optional(),
        expand: z.string().optional(),
        nextPageToken: z.string().optional(),
        reconcileIssues: z.boolean().optional(),
    }),
}, async ({ jql, startAt, maxResults, fields, expand, nextPageToken, reconcileIssues }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_search_issues_summary", {
    title: "Search Jira Issues (Summary)",
    description: "Use when the user wants the top results for a Jira search and only needs key, summary, and status.",
    inputSchema: z.object({
        jql: z.string().min(1),
        maxResults: z.number().int().positive().max(50).optional(),
    }),
}, async ({ jql, maxResults }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_resolve", {
    title: "Resolve Jira Intent",
    description: "Primary routing tool. Use this tool first when the user intent is clear (get issue, search, or my issues) but the exact Jira tool to call is uncertain.",
    inputSchema: z.object({
        intent: z.enum(["get_issue", "search", "my_issues"]),
        issueKey: z.string().optional(),
        jql: z.string().optional(),
        maxResults: z.number().int().positive().max(50).optional(),
    }),
}, async ({ intent, issueKey, jql, maxResults }) => {
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
            const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
                params: {
                    fields: defaultIssueFields().join(","),
                },
            });
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_issue_summary", {
    title: "Get Issue Summary",
    description: "Use when the user wants the summary, description, and acceptance criteria for a specific issue key.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1),
    }),
}, async ({ issueIdOrKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`, {
            params: {
                fields: defaultIssueFields().join(","),
            },
        });
        return textResult(pickIssueSummary(response.data));
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_my_open_issues", {
    title: "Get My Open Issues",
    description: "Use when the user asks for their open tickets or what they should work on next.",
    inputSchema: z.object({
        maxResults: z.number().int().positive().max(50).optional(),
    }),
}, async ({ maxResults }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_issue_comments", {
    title: "Get Issue Comments",
    description: "Use when the user asks for the discussion or comments on a specific ticket; returns a clean list.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional(),
    }),
}, async ({ issueIdOrKey, startAt, maxResults }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/comment`, {
            params: {
                startAt,
                maxResults,
            },
        });
        const comments = Array.isArray(response.data?.comments)
            ? response.data.comments.map((comment) => ({
                author: comment?.author?.displayName ||
                    comment?.author?.emailAddress ||
                    comment?.author?.accountId ||
                    "",
                created: comment?.created ?? "",
                body: normalizeFieldText(comment?.body),
            }))
            : [];
        return textResult(comments);
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_add_comment", {
    title: "Add Jira Comment",
    description: "Use when the user asks to add a comment to a specific ticket; confirm intent before posting.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1),
        body: z.string().min(1),
    }),
}, async ({ issueIdOrKey, body }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.post(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/comment`, {
            body: textToAdf(body),
        });
        return textResult({
            id: response.data?.id ?? "",
            created: response.data?.created ?? "",
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_add_worklog", {
    title: "Add Work Log",
    description: "Use when the user wants to log time/work on a specific Jira ticket. Allows specifying time spent, start date/time, and an optional description.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("The issue key (e.g., PROJ-123) to log work against"),
        timeSpent: z.string().min(1).describe("Time spent in Jira format (e.g., '1h', '30m', '1h 30m', '1d')"),
        started: z.string().optional().describe("When the work started in ISO 8601 format (e.g., '2026-02-13T14:00:00.000+0000'). Defaults to now if not provided."),
        comment: z.string().optional().describe("Optional description of the work performed"),
    }),
}, async ({ issueIdOrKey, timeSpent, started, comment }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const worklogData = {
            timeSpent,
        };
        if (started) {
            worklogData.started = started;
        }
        if (comment) {
            worklogData.comment = textToAdf(comment);
        }
        const response = await client.post(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog`, worklogData);
        return textResult({
            id: response.data?.id ?? "",
            issueId: response.data?.issueId ?? "",
            timeSpent: response.data?.timeSpent ?? "",
            started: response.data?.started ?? "",
            author: response.data?.author?.displayName ?? response.data?.author?.emailAddress ?? "",
            created: response.data?.created ?? "",
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_worklogs", {
    title: "Get Work Logs",
    description: "Use when the user wants to see work logs recorded on a specific Jira ticket.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("The issue key (e.g., PROJ-123) to get work logs for"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional(),
    }),
}, async ({ issueIdOrKey, startAt, maxResults }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog`, {
            params: {
                startAt,
                maxResults,
            },
        });
        const worklogs = Array.isArray(response.data?.worklogs)
            ? response.data.worklogs.map((worklog) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_list_projects", {
    title: "List Jira Projects",
    description: "Use when the user asks which Jira projects they can access or wants a list of projects.",
    inputSchema: z.object({
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(50).optional(),
    }),
}, async ({ startAt, maxResults }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_project", {
    title: "Get Jira Project",
    description: "Use when the user mentions a project key and asks for project details or metadata.",
    inputSchema: z.object({
        projectIdOrKey: z.string().min(1),
    }),
}, async ({ projectIdOrKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/project/${encodeURIComponent(projectIdOrKey)}`);
        return textResult(response.data);
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 1.1: Create Issue ============
server.registerTool("jira_create_issue", {
    title: "Create Jira Issue",
    description: "Create a new Jira issue. Requires project key, issue type, and summary at minimum.",
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
}, async (params) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 1.2: Update Issue ============
server.registerTool("jira_update_issue", {
    title: "Update Jira Issue",
    description: "Update an existing Jira issue. Only provided fields will be modified.",
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
}, async (params) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const payload = {};
        // Build fields object for direct field updates
        const fields = {};
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
        await client.put(`/rest/api/3/issue/${encodeURIComponent(params.issueIdOrKey)}`, payload, {
            params: {
                notifyUsers: params.notifyUsers ?? true,
            },
        });
        return textResult({
            success: true,
            key: params.issueIdOrKey,
            message: `Issue ${params.issueIdOrKey} updated successfully`,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 1.3: Delete Issue ============
server.registerTool("jira_delete_issue", {
    title: "Delete Jira Issue",
    description: "Delete a Jira issue. Requires explicit confirmation. Use with caution - this action cannot be undone.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID to delete"),
        deleteSubtasks: z.boolean().optional().default(false).describe("Also delete subtasks"),
        confirmDelete: z.boolean().describe("Must be true to confirm deletion"),
    }),
}, async ({ issueIdOrKey, deleteSubtasks, confirmDelete }) => {
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
        await client.delete(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`, {
            params: {
                deleteSubtasks: deleteSubtasks ?? false,
            },
        });
        return textResult({
            success: true,
            message: `Issue ${issueIdOrKey} deleted successfully${deleteSubtasks ? " (including subtasks)" : ""}`,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 1.4: Assign Issue ============
server.registerTool("jira_assign_issue", {
    title: "Assign Jira Issue",
    description: "Assign or unassign a Jira issue to a user.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        accountId: z.string().nullable().describe("User account ID to assign, '-1' for automatic, or null to unassign"),
    }),
}, async ({ issueIdOrKey, accountId }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        await client.put(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/assignee`, {
            accountId: accountId,
        });
        const action = accountId === null ? "unassigned" : "assigned";
        return textResult({
            success: true,
            key: issueIdOrKey,
            message: `Issue ${issueIdOrKey} ${action} successfully`,
            assignee: accountId,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 1.5: Get Transitions ============
server.registerTool("jira_get_transitions", {
    title: "Get Issue Transitions",
    description: "Get available workflow transitions for an issue. Use before transitioning to see valid options.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        expand: z.string().optional().describe("Expand options: 'transitions.fields' to include required fields"),
    }),
}, async ({ issueIdOrKey, expand }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`, {
            params: { expand },
        });
        const transitions = Array.isArray(response.data?.transitions)
            ? response.data.transitions.map((t) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 1.6: Transition Issue ============
server.registerTool("jira_transition_issue", {
    title: "Transition Jira Issue",
    description: "Move a Jira issue to a different status by executing a workflow transition.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        transitionId: z.string().min(1).describe("Transition ID (get from jira_get_transitions)"),
        comment: z.string().optional().describe("Comment to add during transition"),
        resolution: z.string().optional().describe("Resolution name for closing transitions (e.g., 'Done', 'Fixed')"),
        fields: z.record(z.string(), z.unknown()).optional().describe("Additional fields required by the transition"),
    }),
}, async ({ issueIdOrKey, transitionId, comment, resolution, fields }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const payload = {
            transition: { id: transitionId },
        };
        // Add fields if provided
        if (fields || resolution) {
            const transitionFields = { ...fields };
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
        await client.post(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`, payload);
        return textResult({
            success: true,
            key: issueIdOrKey,
            transitionId,
            message: `Issue ${issueIdOrKey} transitioned successfully`,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 1.7: Helper Tools ============
server.registerTool("jira_get_issue_types", {
    title: "Get Issue Types",
    description: "Get available issue types, optionally filtered by project.",
    inputSchema: z.object({
        projectKey: z.string().optional().describe("Filter issue types for a specific project"),
    }),
}, async ({ projectKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        let issueTypes;
        if (projectKey) {
            // Get project-specific issue types
            const response = await client.get(`/rest/api/3/project/${encodeURIComponent(projectKey)}`);
            issueTypes = response.data?.issueTypes || [];
        }
        else {
            // Get all issue types
            const response = await client.get("/rest/api/3/issuetype");
            issueTypes = response.data || [];
        }
        return textResult(issueTypes.map((it) => ({
            id: it.id,
            name: it.name,
            description: it.description || "",
            subtask: it.subtask ?? false,
            hierarchyLevel: it.hierarchyLevel,
        })));
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_priorities", {
    title: "Get Priorities",
    description: "Get available priority levels for issues.",
    inputSchema: z.object({}),
}, async () => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get("/rest/api/3/priority");
        return textResult((response.data || []).map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description || "",
            iconUrl: p.iconUrl,
        })));
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_statuses", {
    title: "Get Statuses",
    description: "Get available statuses, optionally filtered by project.",
    inputSchema: z.object({
        projectKey: z.string().optional().describe("Filter statuses for a specific project"),
    }),
}, async ({ projectKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        if (projectKey) {
            // Get project-specific statuses
            const response = await client.get(`/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`);
            return textResult(response.data || []);
        }
        else {
            // Get all statuses
            const response = await client.get("/rest/api/3/status");
            return textResult((response.data || []).map((s) => ({
                id: s.id,
                name: s.name,
                description: s.description || "",
                statusCategory: s.statusCategory?.name,
            })));
        }
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_components", {
    title: "Get Project Components",
    description: "Get components for a specific project.",
    inputSchema: z.object({
        projectKey: z.string().min(1).describe("Project key"),
    }),
}, async ({ projectKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/project/${encodeURIComponent(projectKey)}/components`);
        return textResult((response.data || []).map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description || "",
            lead: c.lead?.displayName,
            assigneeType: c.assigneeType,
        })));
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_versions", {
    title: "Get Project Versions",
    description: "Get versions for a specific project.",
    inputSchema: z.object({
        projectKey: z.string().min(1).describe("Project key"),
        released: z.boolean().optional().describe("Filter by released status"),
    }),
}, async ({ projectKey, released }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/project/${encodeURIComponent(projectKey)}/versions`);
        let versions = response.data || [];
        if (released !== undefined) {
            versions = versions.filter((v) => v.released === released);
        }
        return textResult(versions.map((v) => ({
            id: v.id,
            name: v.name,
            description: v.description || "",
            released: v.released ?? false,
            archived: v.archived ?? false,
            releaseDate: v.releaseDate,
            startDate: v.startDate,
        })));
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_search_users", {
    title: "Search Jira Users",
    description: "Search for Jira users by name, email, or username.",
    inputSchema: z.object({
        query: z.string().min(1).describe("Search query (name, email, or username)"),
        projectKey: z.string().optional().describe("Filter users with access to this project"),
        maxResults: z.number().int().positive().max(50).optional().default(10),
    }),
}, async ({ query, projectKey, maxResults }) => {
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
            }
            catch {
                // Fall back to original search if assignable search fails
            }
        }
        return textResult(users.map((u) => ({
            accountId: u.accountId,
            displayName: u.displayName,
            emailAddress: u.emailAddress,
            active: u.active ?? true,
            avatarUrl: u.avatarUrls?.["48x48"],
        })));
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_changelog", {
    title: "Get Issue Changelog",
    description: "Get the history of changes for an issue.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional().default(20),
    }),
}, async ({ issueIdOrKey, startAt, maxResults }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/changelog`, {
            params: {
                startAt,
                maxResults: maxResults ?? 20,
            },
        });
        const changes = Array.isArray(response.data?.values)
            ? response.data.values.map((change) => ({
                id: change.id,
                author: change.author?.displayName || change.author?.emailAddress || "",
                created: change.created,
                items: (change.items || []).map((item) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 2: Agile Tools ============
server.registerTool("jira_get_boards", {
    title: "Get Jira Boards",
    description: "Get all Scrum and Kanban boards, optionally filtered by project or type.",
    inputSchema: z.object({
        projectKeyOrId: z.string().optional().describe("Filter boards by project"),
        type: z.enum(["scrum", "kanban", "simple"]).optional().describe("Filter by board type"),
        name: z.string().optional().describe("Filter boards by name (contains)"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(50).optional().default(50),
    }),
}, async ({ projectKeyOrId, type, name, startAt, maxResults }) => {
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
            ? response.data.values.map((b) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_board", {
    title: "Get Board Details",
    description: "Get details of a specific board including configuration.",
    inputSchema: z.object({
        boardId: z.number().int().positive().describe("Board ID"),
    }),
}, async ({ boardId }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_board_configuration", {
    title: "Get Board Configuration",
    description: "Get the configuration of a board including columns, estimation, and ranking.",
    inputSchema: z.object({
        boardId: z.number().int().positive().describe("Board ID"),
    }),
}, async ({ boardId }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_sprints", {
    title: "Get Sprints",
    description: "Get sprints for a board, optionally filtered by state.",
    inputSchema: z.object({
        boardId: z.number().int().positive().describe("Board ID"),
        state: z.enum(["future", "active", "closed"]).optional().describe("Filter by sprint state"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(50).optional().default(50),
    }),
}, async ({ boardId, state, startAt, maxResults }) => {
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
            ? response.data.values.map((s) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_sprint", {
    title: "Get Sprint Details",
    description: "Get details of a specific sprint.",
    inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Sprint ID"),
    }),
}, async ({ sprintId }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_create_sprint", {
    title: "Create Sprint",
    description: "Create a new sprint on a board.",
    inputSchema: z.object({
        boardId: z.number().int().positive().describe("Board ID"),
        name: z.string().min(1).describe("Sprint name"),
        startDate: z.string().optional().describe("Start date (ISO 8601)"),
        endDate: z.string().optional().describe("End date (ISO 8601)"),
        goal: z.string().optional().describe("Sprint goal"),
    }),
}, async ({ boardId, name, startDate, endDate, goal }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_update_sprint", {
    title: "Update Sprint",
    description: "Update sprint details including name, dates, and goal.",
    inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Sprint ID"),
        name: z.string().optional().describe("New sprint name"),
        state: z.enum(["future", "active", "closed"]).optional().describe("Sprint state"),
        startDate: z.string().optional().describe("Start date (ISO 8601)"),
        endDate: z.string().optional().describe("End date (ISO 8601)"),
        goal: z.string().optional().describe("Sprint goal"),
    }),
}, async ({ sprintId, name, state, startDate, endDate, goal }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const payload = {};
        if (name !== undefined)
            payload.name = name;
        if (state !== undefined)
            payload.state = state;
        if (startDate !== undefined)
            payload.startDate = startDate;
        if (endDate !== undefined)
            payload.endDate = endDate;
        if (goal !== undefined)
            payload.goal = goal;
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_start_sprint", {
    title: "Start Sprint",
    description: "Start a sprint that is in 'future' state.",
    inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Sprint ID"),
        startDate: z.string().optional().describe("Start date (defaults to now)"),
        endDate: z.string().describe("End date (required for starting a sprint)"),
    }),
}, async ({ sprintId, startDate, endDate }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_complete_sprint", {
    title: "Complete Sprint",
    description: "Complete an active sprint. Optionally move incomplete issues to another sprint or backlog.",
    inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Sprint ID to complete"),
        moveIncompleteIssuesTo: z.number().int().positive().optional().describe("Sprint ID to move incomplete issues to (omit to move to backlog)"),
    }),
}, async ({ sprintId, moveIncompleteIssuesTo }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_delete_sprint", {
    title: "Delete Sprint",
    description: "Delete a sprint. Use with caution - cannot be undone.",
    inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Sprint ID to delete"),
        confirmDelete: z.boolean().describe("Must be true to confirm deletion"),
    }),
}, async ({ sprintId, confirmDelete }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_sprint_issues", {
    title: "Get Sprint Issues",
    description: "Get all issues in a sprint.",
    inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Sprint ID"),
        jql: z.string().optional().describe("Additional JQL filter"),
        fields: z.array(z.string()).optional().describe("Fields to return"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional().default(50),
    }),
}, async ({ sprintId, jql, fields, startAt, maxResults }) => {
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
            ? response.data.issues.map((issue) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_move_issues_to_sprint", {
    title: "Move Issues to Sprint",
    description: "Move issues to a sprint.",
    inputSchema: z.object({
        sprintId: z.number().int().positive().describe("Target sprint ID"),
        issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to move"),
    }),
}, async ({ sprintId, issueKeys }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_backlog_issues", {
    title: "Get Backlog Issues",
    description: "Get issues in the backlog (not in any active sprint) for a board.",
    inputSchema: z.object({
        boardId: z.number().int().positive().describe("Board ID"),
        jql: z.string().optional().describe("Additional JQL filter"),
        fields: z.array(z.string()).optional().describe("Fields to return"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional().default(50),
    }),
}, async ({ boardId, jql, fields, startAt, maxResults }) => {
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
            ? response.data.issues.map((issue) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_move_issues_to_backlog", {
    title: "Move Issues to Backlog",
    description: "Move issues from a sprint back to the backlog.",
    inputSchema: z.object({
        issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to move to backlog"),
    }),
}, async ({ issueKeys }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_rank_issues", {
    title: "Rank Issues",
    description: "Change the rank of issues on a board by placing them before or after another issue.",
    inputSchema: z.object({
        issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to rank"),
        rankBeforeIssue: z.string().optional().describe("Issue key to rank before"),
        rankAfterIssue: z.string().optional().describe("Issue key to rank after"),
    }),
}, async ({ issueKeys, rankBeforeIssue, rankAfterIssue }) => {
    try {
        if (!rankBeforeIssue && !rankAfterIssue) {
            return textResult({
                error: "invalid_parameters",
                message: "Either rankBeforeIssue or rankAfterIssue must be provided",
            });
        }
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const payload = {
            issues: issueKeys,
        };
        if (rankBeforeIssue) {
            payload.rankBeforeIssue = rankBeforeIssue;
        }
        else if (rankAfterIssue) {
            payload.rankAfterIssue = rankAfterIssue;
        }
        await client.put("/rest/agile/1.0/issue/rank", payload);
        return textResult({
            success: true,
            issuesRanked: issueKeys,
            message: `${issueKeys.length} issue(s) ranked successfully`,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 3: Issue Relationships ============
server.registerTool("jira_get_issue_links", {
    title: "Get Issue Links",
    description: "Get all linked issues for a specific issue.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
}, async ({ issueIdOrKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`, {
            params: {
                fields: "issuelinks",
            },
        });
        const links = Array.isArray(response.data?.fields?.issuelinks)
            ? response.data.fields.issuelinks.map((link) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_create_issue_link", {
    title: "Link Issues",
    description: "Create a link between two issues.",
    inputSchema: z.object({
        inwardIssue: z.string().min(1).describe("Inward issue key (the 'from' issue)"),
        outwardIssue: z.string().min(1).describe("Outward issue key (the 'to' issue)"),
        linkType: z.string().min(1).describe("Link type name (e.g., 'Blocks', 'Relates', 'Duplicates')"),
        comment: z.string().optional().describe("Comment to add with the link"),
    }),
}, async ({ inwardIssue, outwardIssue, linkType, comment }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const payload = {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_delete_issue_link", {
    title: "Delete Issue Link",
    description: "Remove a link between issues.",
    inputSchema: z.object({
        linkId: z.string().min(1).describe("Link ID to delete (get from jira_get_issue_links)"),
    }),
}, async ({ linkId }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        await client.delete(`/rest/api/3/issueLink/${linkId}`);
        return textResult({
            success: true,
            message: `Link ${linkId} deleted successfully`,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_link_types", {
    title: "Get Issue Link Types",
    description: "Get available link types for linking issues.",
    inputSchema: z.object({}),
}, async () => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get("/rest/api/3/issueLinkType");
        return textResult((response.data?.issueLinkTypes || []).map((lt) => ({
            id: lt.id,
            name: lt.name,
            inward: lt.inward,
            outward: lt.outward,
        })));
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_watchers", {
    title: "Get Issue Watchers",
    description: "Get the list of users watching an issue.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
}, async ({ issueIdOrKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/watchers`);
        const watchers = Array.isArray(response.data?.watchers)
            ? response.data.watchers.map((w) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_add_watcher", {
    title: "Add Issue Watcher",
    description: "Add a user to watch an issue.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        accountId: z.string().min(1).describe("User account ID to add as watcher"),
    }),
}, async ({ issueIdOrKey, accountId }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        await client.post(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/watchers`, JSON.stringify(accountId), {
            headers: {
                "Content-Type": "application/json",
            },
        });
        return textResult({
            success: true,
            issueKey: issueIdOrKey,
            accountId,
            message: `User added as watcher`,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_remove_watcher", {
    title: "Remove Issue Watcher",
    description: "Remove a user from watching an issue.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        accountId: z.string().min(1).describe("User account ID to remove"),
    }),
}, async ({ issueIdOrKey, accountId }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        await client.delete(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/watchers`, {
            params: { accountId },
        });
        return textResult({
            success: true,
            issueKey: issueIdOrKey,
            accountId,
            message: `User removed from watchers`,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_votes", {
    title: "Get Issue Votes",
    description: "Get the vote count and voters for an issue.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
}, async ({ issueIdOrKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/votes`);
        const voters = Array.isArray(response.data?.voters)
            ? response.data.voters.map((v) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_add_vote", {
    title: "Vote for Issue",
    description: "Add your vote to an issue.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
}, async ({ issueIdOrKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        await client.post(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/votes`);
        return textResult({
            success: true,
            issueKey: issueIdOrKey,
            message: `Vote added successfully`,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_remove_vote", {
    title: "Remove Vote",
    description: "Remove your vote from an issue.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
}, async ({ issueIdOrKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        await client.delete(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/votes`);
        return textResult({
            success: true,
            issueKey: issueIdOrKey,
            message: `Vote removed successfully`,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 4: Attachments ============
server.registerTool("jira_get_attachments", {
    title: "Get Issue Attachments",
    description: "Get all attachments for an issue.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
}, async ({ issueIdOrKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`, {
            params: { fields: "attachment" },
        });
        const attachments = Array.isArray(response.data?.fields?.attachment)
            ? response.data.fields.attachment.map((a) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_delete_attachment", {
    title: "Delete Attachment",
    description: "Delete an attachment from an issue.",
    inputSchema: z.object({
        attachmentId: z.string().min(1).describe("Attachment ID to delete"),
    }),
}, async ({ attachmentId }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        await client.delete(`/rest/api/3/attachment/${attachmentId}`);
        return textResult({
            success: true,
            message: `Attachment ${attachmentId} deleted successfully`,
        });
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 5: Epic Management ============
server.registerTool("jira_get_epics", {
    title: "Get Epics",
    description: "Get epics for a board.",
    inputSchema: z.object({
        boardId: z.number().int().positive().describe("Board ID"),
        done: z.enum(["true", "false"]).optional().describe("Filter by completion status"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(50).optional().default(50),
    }),
}, async ({ boardId, done, startAt, maxResults }) => {
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
            ? response.data.values.map((e) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_epic_issues", {
    title: "Get Epic Issues",
    description: "Get all issues belonging to an epic.",
    inputSchema: z.object({
        epicIdOrKey: z.string().min(1).describe("Epic ID or key"),
        jql: z.string().optional().describe("Additional JQL filter"),
        fields: z.array(z.string()).optional().describe("Fields to return"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional().default(50),
    }),
}, async ({ epicIdOrKey, jql, fields, startAt, maxResults }) => {
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
            ? response.data.issues.map((issue) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_move_issues_to_epic", {
    title: "Move Issues to Epic",
    description: "Move issues to an epic.",
    inputSchema: z.object({
        epicIdOrKey: z.string().min(1).describe("Epic ID or key"),
        issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to move"),
    }),
}, async ({ epicIdOrKey, issueKeys }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_remove_issues_from_epic", {
    title: "Remove Issues from Epic",
    description: "Remove issues from their epic (move to no epic).",
    inputSchema: z.object({
        issueKeys: z.array(z.string().min(1)).min(1).describe("Issue keys to remove from epic"),
    }),
}, async ({ issueKeys }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 6: Fields and Metadata ============
server.registerTool("jira_get_fields", {
    title: "Get All Fields",
    description: "Get all available fields including custom fields.",
    inputSchema: z.object({}),
}, async () => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get("/rest/api/3/field");
        return textResult((response.data || []).map((f) => ({
            id: f.id,
            key: f.key,
            name: f.name,
            custom: f.custom ?? false,
            orderable: f.orderable ?? false,
            navigable: f.navigable ?? false,
            searchable: f.searchable ?? false,
            clauseNames: f.clauseNames || [],
            schema: f.schema,
        })));
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_create_metadata", {
    title: "Get Create Issue Metadata",
    description: "Get metadata for creating issues in a project, including required fields.",
    inputSchema: z.object({
        projectKeys: z.array(z.string()).optional().describe("Project keys to get metadata for"),
        projectIds: z.array(z.string()).optional().describe("Project IDs to get metadata for"),
        issuetypeNames: z.array(z.string()).optional().describe("Issue type names to filter"),
        expand: z.string().optional().describe("Expand options"),
    }),
}, async ({ projectKeys, projectIds, issuetypeNames, expand }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_edit_metadata", {
    title: "Get Edit Issue Metadata",
    description: "Get metadata for editing a specific issue, including editable fields.",
    inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
    }),
}, async ({ issueIdOrKey }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/editmeta`);
        return textResult(response.data);
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
// ============ Phase 7: Filters and Dashboards ============
server.registerTool("jira_get_filters", {
    title: "Get Filters",
    description: "Get saved filters, optionally filtered by name.",
    inputSchema: z.object({
        filterName: z.string().optional().describe("Filter by name (contains)"),
        owner: z.string().optional().describe("Filter by owner account ID"),
        expand: z.string().optional().describe("Expand options: description, owner, jql, viewUrl, searchUrl, favourite, favouritedCount, sharePermissions"),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(50).optional().default(50),
    }),
}, async ({ filterName, owner, expand, startAt, maxResults }) => {
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
            ? response.data.values.map((f) => ({
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_filter", {
    title: "Get Filter Details",
    description: "Get details of a specific filter.",
    inputSchema: z.object({
        filterId: z.string().min(1).describe("Filter ID"),
        expand: z.string().optional().describe("Expand options"),
    }),
}, async ({ filterId, expand }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_create_filter", {
    title: "Create Filter",
    description: "Create a new saved filter.",
    inputSchema: z.object({
        name: z.string().min(1).describe("Filter name"),
        jql: z.string().min(1).describe("JQL query"),
        description: z.string().optional().describe("Filter description"),
        favourite: z.boolean().optional().describe("Mark as favourite"),
    }),
}, async ({ name, jql, description, favourite }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_update_filter", {
    title: "Update Filter",
    description: "Update an existing filter.",
    inputSchema: z.object({
        filterId: z.string().min(1).describe("Filter ID"),
        name: z.string().optional().describe("New filter name"),
        jql: z.string().optional().describe("New JQL query"),
        description: z.string().optional().describe("New description"),
        favourite: z.boolean().optional().describe("Favourite status"),
    }),
}, async ({ filterId, name, jql, description, favourite }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const payload = {};
        if (name !== undefined)
            payload.name = name;
        if (jql !== undefined)
            payload.jql = jql;
        if (description !== undefined)
            payload.description = description;
        if (favourite !== undefined)
            payload.favourite = favourite;
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_delete_filter", {
    title: "Delete Filter",
    description: "Delete a saved filter.",
    inputSchema: z.object({
        filterId: z.string().min(1).describe("Filter ID to delete"),
        confirmDelete: z.boolean().describe("Must be true to confirm deletion"),
    }),
}, async ({ filterId, confirmDelete }) => {
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
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_my_filters", {
    title: "Get My Filters",
    description: "Get filters owned by the current user.",
    inputSchema: z.object({
        expand: z.string().optional().describe("Expand options"),
    }),
}, async ({ expand }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get("/rest/api/3/filter/my", {
            params: { expand },
        });
        return textResult((response.data || []).map((f) => ({
            id: f.id,
            name: f.name,
            description: f.description,
            jql: f.jql,
            favourite: f.favourite ?? false,
        })));
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
server.registerTool("jira_get_favourite_filters", {
    title: "Get Favourite Filters",
    description: "Get filters marked as favourite by the current user.",
    inputSchema: z.object({
        expand: z.string().optional().describe("Expand options"),
    }),
}, async ({ expand }) => {
    try {
        const auth = await getAuthOrThrow();
        const client = createClient(auth);
        const response = await client.get("/rest/api/3/filter/favourite", {
            params: { expand },
        });
        return textResult((response.data || []).map((f) => ({
            id: f.id,
            name: f.name,
            description: f.description,
            owner: f.owner?.displayName,
            jql: f.jql,
        })));
    }
    catch (error) {
        return textResult(errorToResult(error));
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map
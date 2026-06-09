import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createServer } from "./server.js";

// ============ CLI Handling ============

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPackageJson(): { name: string; version: string; description: string } {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    try {
      const devPkgPath = join(__dirname, "package.json");
      return JSON.parse(readFileSync(devPkgPath, "utf-8"));
    } catch {
      return { name: "mcp-jira-cloud", version: "0.0.0", description: "Jira MCP Server" };
    }
  }
}

function printHelp(): void {
  const pkg = getPackageJson();
  console.log(`
${pkg.name} v${pkg.version}
${pkg.description}

USAGE:
  npx -y mcp-jira-cloud@latest [OPTIONS]
  jira-mcp [OPTIONS]
  mcp-jira-cloud [OPTIONS]

OPTIONS:
  -h, --help       Show this help message and exit
  -v, --version    Show version number and exit

FEATURES:
  - 91 specialized Jira tools
  - Comprehensive Agile support (Sprints, Boards, Backlogs, Epics)
  - Issue management (Search, Create, Update, Transitions)
  - Worklog management and time tracking
  - Attachment and comment handling
  - Advanced JQL search, filters, and dashboards
  - Metadata and project exploration

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
  npx -y mcp-jira-cloud@latest

  # Check version
  npx -y mcp-jira-cloud@latest --version

  # Show this help message
  npx -y mcp-jira-cloud@latest --help

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
  https://github.com/tezaswiraj7222/jira-mcp#readme

ISSUES:
  https://github.com/tezaswiraj7222/jira-mcp/issues
`);
}

function printVersion(): void {
  const pkg = getPackageJson();
  console.log(`${pkg.name} v${pkg.version}`);
}

// Parse CLI arguments
const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help") || args.includes("help")) {
  printHelp();
  process.exit(0);
}

if (args.includes("-v") || args.includes("--version")) {
  printVersion();
  process.exit(0);
}

// ============ Start Server ============

const server = createServer();
const transport = new StdioServerTransport();

// Graceful shutdown
function shutdown() {
  server.close().catch(() => {}).finally(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(transport);

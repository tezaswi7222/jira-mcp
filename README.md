# Jira MCP Server

A Model Context Protocol (MCP) server that provides seamless integration with Jira Cloud. This server enables AI assistants like GitHub Copilot and Claude to interact with your Jira instance - search issues, manage tickets, log work, and more.

![MCP](https://img.shields.io/badge/MCP-Compatible-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- 🔐 **Dual Authentication** - Basic Auth (API Token) or OAuth 2.0
- 🔍 **Search Issues** - Query Jira with JQL
- 📋 **Issue Management** - Get issue details, comments, and metadata
- ⏱️ **Work Logging** - Log time spent on tickets
- 💬 **Comments** - Add comments to issues
- 📁 **Projects** - List and explore Jira projects
- 🔄 **Auto Token Refresh** - OAuth tokens refresh automatically

## Installation

### From npm (Recommended)

```bash
npm install -g jira-mcp
```

### From Source

```bash
git clone https://github.com/tezaswi7222/jira-mcp.git
cd jira-mcp
npm install
npm run build
```

## Configuration

### VS Code Setup

Create or edit `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "jira": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/jira-mcp/dist/index.js"],
      "env": {
        "JIRA_BASE_URL": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

### Claude Desktop Setup

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/path/to/jira-mcp/dist/index.js"],
      "env": {
        "JIRA_BASE_URL": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Authentication

### Option 1: Basic Auth (API Token)

1. Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Copy the token and set the environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `JIRA_BASE_URL` | Your Jira instance URL | `https://yourcompany.atlassian.net` |
| `JIRA_EMAIL` | Your Atlassian email | `you@example.com` |
| `JIRA_API_TOKEN` | API token from step 2 | `ATATT3xF...` |

### Option 2: OAuth 2.0

For OAuth authentication, you'll need to:

1. Create an OAuth 2.0 app in the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Configure the required scopes:
   - `read:jira-work`
   - `read:jira-user`
   - `write:jira-work`
   - `offline_access`
3. Set the environment variables:

| Variable | Description |
|----------|-------------|
| `JIRA_OAUTH_CLIENT_ID` | OAuth Client ID |
| `JIRA_OAUTH_CLIENT_SECRET` | OAuth Client Secret |
| `JIRA_OAUTH_ACCESS_TOKEN` | Access token |
| `JIRA_OAUTH_REFRESH_TOKEN` | Refresh token (optional) |
| `JIRA_CLOUD_ID` | Your Jira Cloud ID |

### Optional Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `JIRA_ACCEPTANCE_CRITERIA_FIELD` | Custom field ID for acceptance criteria | (none) |

## Available Tools

### Authentication Tools

| Tool | Description |
|------|-------------|
| `jira_auth_status` | Check current authentication status |
| `jira_whoami` | Get current user's Jira profile |
| `jira_clear_auth` | Clear stored credentials |
| `jira_oauth_get_auth_url` | Generate OAuth authorization URL |
| `jira_oauth_exchange_code` | Exchange OAuth code for tokens |
| `jira_oauth_refresh` | Manually refresh OAuth token |
| `jira_oauth_list_sites` | List accessible Jira sites |

### Issue Tools

| Tool | Description |
|------|-------------|
| `jira_get_issue` | Get full details of a Jira issue |
| `jira_get_issue_summary` | Get summary, description, and acceptance criteria |
| `jira_search_issues` | Search issues with JQL |
| `jira_search_issues_summary` | Search with minimal fields (key, summary, status) |
| `jira_get_my_open_issues` | Get your open/in-progress issues |
| `jira_resolve` | Smart routing tool for common intents |

### Comments & Work Logs

| Tool | Description |
|------|-------------|
| `jira_get_issue_comments` | Get comments on an issue |
| `jira_add_comment` | Add a comment to an issue |
| `jira_add_worklog` | Log time spent on an issue |
| `jira_get_worklogs` | Get work logs for an issue |

### Project Tools

| Tool | Description |
|------|-------------|
| `jira_list_projects` | List accessible Jira projects |
| `jira_get_project` | Get project details |

## Usage Examples

Once configured, you can interact with Jira through your AI assistant:

### Get Issue Details
> "What's the status of PROJ-123?"

### Search Issues
> "Find all open bugs assigned to me"

### Log Work
> "Log 2 hours on PROJ-456 for today"

### Add Comments
> "Add a comment to PROJ-789 saying 'Fixed in latest commit'"

### Get My Tasks
> "What tickets am I working on?"

## Development

### Build

```bash
npm run build
```

### Run in Development Mode

```bash
npm run dev
```

### Project Structure

```
jira-mcp/
├── src/
│   └── index.ts      # Main server implementation
├── dist/
│   └── index.js      # Compiled JavaScript
├── package.json
├── tsconfig.json
├── .gitignore
├── .npmignore
└── README.md
```

## Troubleshooting

### "MISSING_AUTH" Error
Ensure your environment variables are correctly set. Check with `jira_auth_status`.

### "401 Unauthorized" Error
- For Basic Auth: Verify your API token is valid and not expired
- For OAuth: Try refreshing the token with `jira_oauth_refresh`

### "403 Forbidden" Error
You don't have permission to access the requested resource. Check your Jira permissions.

### "404 Not Found" Error
The issue or project doesn't exist, or you don't have access to view it.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/tezaswi7222/jira-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Jira REST API Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
- [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

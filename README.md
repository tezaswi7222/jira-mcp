<p align="center">
  <img src="https://raw.githubusercontent.com/tezaswi7222/jira-mcp/main/assets/logo.svg" alt="Jira MCP Logo" width="120" height="120">
</p>

<h1 align="center">Jira MCP Server</h1>

<p align="center">
  <strong>Supercharge your AI assistant with seamless Jira integration</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mcp-jira-cloud">
    <img src="https://img.shields.io/npm/v/mcp-jira-cloud?style=flat-square&color=cb3837&logo=npm" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/mcp-jira-cloud">
    <img src="https://img.shields.io/npm/dm/mcp-jira-cloud?style=flat-square&color=blue" alt="npm downloads">
  </a>
  <a href="https://github.com/tezaswi7222/jira-mcp/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/mcp-jira-cloud?style=flat-square&color=green" alt="license">
  </a>
  <a href="https://github.com/tezaswi7222/jira-mcp">
    <img src="https://img.shields.io/github/stars/tezaswi7222/jira-mcp?style=flat-square&logo=github" alt="GitHub stars">
  </a>
</p>

<p align="center">
  <a href="https://modelcontextprotocol.io/">
    <img src="https://img.shields.io/badge/MCP-Compatible-8A2BE2?style=flat-square" alt="MCP Compatible">
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 18+">
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-5.0%2B-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.0+">
  </a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#%EF%B8%8F-configuration">Configuration</a> •
  <a href="#-available-tools">Tools</a> •
  <a href="#-usage-examples">Examples</a> •
  <a href="#-troubleshooting">Troubleshooting</a>
</p>

---

A **Model Context Protocol (MCP)** server that enables AI assistants like **GitHub Copilot** and **Claude** to interact with your Jira Cloud instance. Search issues, manage tickets, log work, and more — all through natural language conversation.

## 🎯 Why Use This Package?

| Without MCP | With Jira MCP |
|-------------|---------------|
| Switch between IDE and browser | Stay in your coding environment |
| Manual copy-paste of issue details | AI fetches context automatically |
| Learn JQL syntax | Natural language queries |
| Click through Jira UI | Voice/text commands |
| Context switching kills productivity | Seamless workflow integration |

### Supported AI Assistants

| Assistant | Status |
|-----------|--------|
| GitHub Copilot (VS Code) | ✅ Fully Supported |
| Claude Desktop | ✅ Fully Supported |
| Cursor | ✅ Fully Supported |
| Windsurf | ✅ Fully Supported |
| Any MCP-compatible client | ✅ Fully Supported |

## ✨ Features

<table>
<tr>
<td>

### 🔐 Authentication
- Basic Auth (API Token)
- OAuth 2.0 with auto-refresh
- Secure credential storage via Keytar

</td>
<td>

### 📋 Issue Management
- Full CRUD operations
- Workflow transitions
- Search with JQL

</td>
</tr>
<tr>
<td>

### 🏃 Agile/Scrum
- Sprint management (create, start, complete)
- Board views (Scrum & Kanban)
- Backlog & ranking

</td>
<td>

### 🔗 Relationships
- Issue linking (blocks, relates, duplicates)
- Watchers & voting
- Epic management

</td>
</tr>
<tr>
<td>

### ⏱️ Time Tracking
- Log work on issues
- View work logs
- Flexible time formats

</td>
<td>

### 🗄️ Filters & Metadata
- Create/manage saved filters
- Field metadata access
- Component & version management

</td>
</tr>
</table>

<p align="center">
  <strong>57 Tools</strong> for comprehensive Jira management
</p>

## 🚀 Quick Start

### Installation

```bash
npm install -g mcp-jira-cloud
```

Or use directly with `npx`:

```bash
npx mcp-jira-cloud
```

### Get Your API Token

1. Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Copy the token

### Configure Your AI Assistant

<details>
<summary><strong>📘 VS Code (GitHub Copilot)</strong></summary>

Create or edit `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "jira": {
      "type": "stdio",
      "command": "npx",
      "args": ["mcp-jira-cloud"],
      "env": {
        "JIRA_BASE_URL": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>🤖 Claude Desktop</strong></summary>

Add to your Claude configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["mcp-jira-cloud"],
      "env": {
        "JIRA_BASE_URL": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>⚡ Cursor</strong></summary>

Create `.cursor/mcp.json` in your project or home directory:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["mcp-jira-cloud"],
      "env": {
        "JIRA_BASE_URL": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>🔧 Windsurf</strong></summary>

Add to your Windsurf MCP configuration:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["mcp-jira-cloud"],
      "env": {
        "JIRA_BASE_URL": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

</details>

## ⚙️ Configuration

### Environment Variables

#### Basic Authentication (Recommended)

| Variable | Description | Required |
|----------|-------------|:--------:|
| `JIRA_BASE_URL` | Your Jira instance URL (e.g., `https://company.atlassian.net`) | ✅ |
| `JIRA_EMAIL` | Your Atlassian account email | ✅ |
| `JIRA_API_TOKEN` | API token from Atlassian | ✅ |

#### OAuth 2.0 Authentication

<details>
<summary>Click to expand OAuth configuration</summary>

For OAuth authentication:

1. Create an OAuth 2.0 app in the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Configure the required scopes:
   - `read:jira-work`
   - `read:jira-user`
   - `write:jira-work`
   - `offline_access`

| Variable | Description | Required |
|----------|-------------|:--------:|
| `JIRA_OAUTH_CLIENT_ID` | OAuth Client ID | ✅ |
| `JIRA_OAUTH_CLIENT_SECRET` | OAuth Client Secret | ✅ |
| `JIRA_OAUTH_ACCESS_TOKEN` | Access token | ✅ |
| `JIRA_OAUTH_REFRESH_TOKEN` | Refresh token | ⬜ |
| `JIRA_CLOUD_ID` | Your Jira Cloud ID | ✅ |

</details>

#### Optional Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `JIRA_ACCEPTANCE_CRITERIA_FIELD` | Custom field ID for acceptance criteria | — |

## 🛠️ Available Tools

> **57 tools** organised into 10 categories

### 🔐 Authentication (7 tools)

| Tool | Description |
|------|-------------|
| `jira_auth_status` | Check current authentication status |
| `jira_whoami` | Get current user's Jira profile |
| `jira_clear_auth` | Clear stored credentials |
| `jira_oauth_get_auth_url` | Generate OAuth authorisation URL |
| `jira_oauth_exchange_code` | Exchange OAuth code for tokens |
| `jira_oauth_refresh` | Manually refresh OAuth token |
| `jira_oauth_list_sites` | List accessible Jira sites |

### 📝 Issue CRUD (6 tools)

| Tool | Description |
|------|-------------|
| `jira_create_issue` | Create a new issue with full field support |
| `jira_update_issue` | Update issue fields (partial update supported) |
| `jira_delete_issue` | Delete an issue (with safety confirmation) |
| `jira_assign_issue` | Assign or unassign a user |
| `jira_get_transitions` | Get available workflow transitions |
| `jira_transition_issue` | Move issue through workflow states |

### 🔍 Issue Query (6 tools)

| Tool | Description |
|------|-------------|
| `jira_get_issue` | Get full details of a Jira issue |
| `jira_get_issue_summary` | Get summary, description, and acceptance criteria |
| `jira_search_issues` | Search issues with JQL (full results) |
| `jira_search_issues_summary` | Search with minimal fields (key, summary, status) |
| `jira_get_my_open_issues` | Get your open/in-progress issues |
| `jira_resolve` | Smart routing tool for common intents |

### 💬 Comments & Work Logs (4 tools)

| Tool | Description |
|------|-------------|
| `jira_get_issue_comments` | Get comments on an issue |
| `jira_add_comment` | Add a comment to an issue |
| `jira_add_worklog` | Log time spent on an issue |
| `jira_get_worklogs` | Get work logs for an issue |

### ⚙️ Configuration & Metadata (9 tools)

| Tool | Description |
|------|-------------|
| `jira_list_projects` | List accessible Jira projects |
| `jira_get_project` | Get project details and metadata |
| `jira_get_issue_types` | Get available issue types |
| `jira_get_priorities` | Get priority levels |
| `jira_get_statuses` | Get available statuses |
| `jira_get_components` | Get project components |
| `jira_get_versions` | Get project versions |
| `jira_search_users` | Search for Jira users |
| `jira_get_changelog` | Get issue change history |

<details>
<summary><strong>🏃 Agile/Sprint Tools (16 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_boards` | List Scrum and Kanban boards |
| `jira_get_board` | Get board details |
| `jira_get_board_configuration` | Get board configuration (columns, estimation) |
| `jira_get_sprints` | Get sprints for a board |
| `jira_get_sprint` | Get sprint details |
| `jira_create_sprint` | Create a new sprint |
| `jira_update_sprint` | Update sprint details |
| `jira_start_sprint` | Start a future sprint |
| `jira_complete_sprint` | Complete an active sprint |
| `jira_delete_sprint` | Delete a sprint |
| `jira_get_sprint_issues` | Get issues in a sprint |
| `jira_move_issues_to_sprint` | Move issues to a sprint |
| `jira_get_backlog_issues` | Get backlog issues for a board |
| `jira_move_issues_to_backlog` | Move issues to backlog |
| `jira_rank_issues` | Change issue ranking |

</details>

<details>
<summary><strong>🔗 Issue Relationships (11 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_issue_links` | Get linked issues |
| `jira_create_issue_link` | Link two issues together |
| `jira_delete_issue_link` | Remove an issue link |
| `jira_get_link_types` | Get available link types |
| `jira_get_watchers` | Get issue watchers |
| `jira_add_watcher` | Add a watcher to an issue |
| `jira_remove_watcher` | Remove a watcher |
| `jira_get_votes` | Get issue vote count |
| `jira_add_vote` | Vote for an issue |
| `jira_remove_vote` | Remove your vote |

</details>

<details>
<summary><strong>📎 Attachments (2 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_attachments` | Get issue attachments |
| `jira_delete_attachment` | Delete an attachment |

</details>

<details>
<summary><strong>📊 Epic Management (4 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_epics` | Get epics for a board |
| `jira_get_epic_issues` | Get issues belonging to an epic |
| `jira_move_issues_to_epic` | Move issues to an epic |
| `jira_remove_issues_from_epic` | Remove issues from an epic |

</details>

<details>
<summary><strong>🗂️ Field Metadata (3 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_fields` | Get all available fields (including custom) |
| `jira_get_create_metadata` | Get metadata for creating issues |
| `jira_get_edit_metadata` | Get metadata for editing issues |

</details>

<details>
<summary><strong>🗄️ Filters (7 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_filters` | Search saved filters |
| `jira_get_filter` | Get filter details |
| `jira_create_filter` | Create a new saved filter |
| `jira_update_filter` | Update an existing filter |
| `jira_delete_filter` | Delete a filter |
| `jira_get_my_filters` | Get filters owned by you |
| `jira_get_favourite_filters` | Get favourite filters |

</details>

## 💡 Usage Examples

Once configured, interact with Jira through natural conversation:

### Issue Management

```
👤 "What's the status of PROJ-123?"
🤖 Fetches and displays issue details, status, and assignee

👤 "Create a bug in PROJ for 'Login button not working'"
🤖 Creates a new bug issue and returns the issue key

👤 "Assign PROJ-456 to john@example.com"
🤖 Assigns the issue to the specified user

👤 "Move PROJ-789 to 'In Progress'"
🤖 Transitions the issue to the new status
```

### Sprint & Agile

```
👤 "Show me the active sprint for board 123"
🤖 Displays current sprint details with dates and goal

👤 "Move PROJ-123 and PROJ-124 to sprint 456"
🤖 Moves the issues to the specified sprint

👤 "What's in the backlog for the PROJ board?"
🤖 Lists all backlog issues with priorities
```

### Time Tracking

```
👤 "Log 2 hours on PROJ-456 for code review"
🤖 Creates work log entry with description

👤 "How much time has been logged on PROJ-789?"
🤖 Retrieves and summarises work logs
```

### Collaboration

```
👤 "Link PROJ-123 as blocking PROJ-456"
🤖 Creates a "blocks" relationship between issues

👤 "Add me as a watcher on PROJ-789"
🤖 Adds you to the issue's watch list

👤 "Show all issues in epic PROJ-100"
🤖 Lists all child issues of the epic
```

## 🔧 Troubleshooting

<details>
<summary><strong>❌ "MISSING_AUTH" Error</strong></summary>

Ensure your environment variables are correctly set. Verify with `jira_auth_status`.

**Checklist:**
- ✅ `JIRA_BASE_URL` includes `https://` and is your full Jira domain
- ✅ `JIRA_EMAIL` matches your Atlassian account email
- ✅ `JIRA_API_TOKEN` is a valid, non-expired token

</details>

<details>
<summary><strong>❌ "401 Unauthorised" Error</strong></summary>

Your credentials are invalid or expired.

**For Basic Auth:**
- Verify your API token at [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- Ensure the token hasn't been revoked

**For OAuth:**
- Try refreshing the token with `jira_oauth_refresh`
- Re-authenticate if the refresh token has expired

</details>

<details>
<summary><strong>❌ "403 Forbidden" Error</strong></summary>

You don't have permission to access the requested resource.

**Solutions:**
- Check your Jira permissions for the project
- Contact your Jira administrator
- Verify your OAuth scopes include required permissions

</details>

<details>
<summary><strong>❌ "404 Not Found" Error</strong></summary>

The issue or project doesn't exist, or you don't have access to view it.

**Solutions:**
- Verify the issue key is correct (e.g., `PROJ-123`)
- Check if you have access to the project
- Ensure the issue hasn't been deleted or moved

</details>

## 📦 Package Information

| Attribute | Value |
|-----------|-------|
| Package name | [`mcp-jira-cloud`](https://www.npmjs.com/package/mcp-jira-cloud) |
| Version | **2.0.0** |
| License | [MIT](LICENSE) |
| Node.js | ≥18.0.0 |
| TypeScript | ≥5.0.0 |
| Module | ES Modules |
| Tools | **57** |

### Dependencies

| Package | Purpose |
|---------|---------|
| [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | MCP protocol implementation |
| [`axios`](https://www.npmjs.com/package/axios) | HTTP client for Jira API |
| [`keytar`](https://www.npmjs.com/package/keytar) | Secure credential storage |
| [`zod`](https://www.npmjs.com/package/zod) | Schema validation |

## 🆕 What's New in v2.0.0

<details>
<summary><strong>Click to see full changelog</strong></summary>

### Added
- **Issue CRUD** - Create, update, delete issues with full field support
- **Workflow Transitions** - Move issues through workflow states
- **Agile/Scrum** - Complete sprint and board management (16 tools)
- **Issue Linking** - Blocks, relates, duplicates relationships
- **Watchers & Voting** - Collaboration features
- **Epic Management** - Organise issues under epics
- **Filters** - Create and manage saved JQL filters
- **Metadata** - Access field configurations and create metadata

### Changed
- Total tools increased from 18 to 57
- Improved TypeScript strict mode compliance
- Enhanced error handling and validation

</details>

## 🔒 Security

- Credentials are stored securely via system keychain (Keytar)
- OAuth tokens auto-refresh before expiration
- No credentials are logged or exposed in error messages
- See [SECURITY.md](SECURITY.md) for our security policy

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes in each version.

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

## 🔗 Links

| Resource | Link |
|----------|------|
| GitHub | [github.com/tezaswi7222/jira-mcp](https://github.com/tezaswi7222/jira-mcp) |
| npm | [npmjs.com/package/mcp-jira-cloud](https://www.npmjs.com/package/mcp-jira-cloud) |
| Issues | [Report a bug](https://github.com/tezaswi7222/jira-mcp/issues) |
| MCP Protocol | [modelcontextprotocol.io](https://modelcontextprotocol.io/) |
| Jira API | [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/) |

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/tezaswi7222">Tezaswi Raj (github: tezaswi7222)</a>
</p>

<p align="center">
  <a href="https://github.com/sponsors/tezaswi7222">
    <img src="https://img.shields.io/badge/Sponsor-❤️-ea4aaa?style=for-the-badge" alt="Sponsor">
  </a>
</p>

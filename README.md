<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/mcp-jira-cloud@latest/assets/logo.svg" alt="Jira MCP Logo" width="120" height="120">
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
  <a href="https://bun.sh/">
    <img src="https://img.shields.io/badge/Bun-1.0%2B-fbf0df?style=flat-square&logo=bun&logoColor=black" alt="Bun 1.0+">
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
- Query worklogs by user & date range
- Flexible time formats

</td>
<td>

### 🗄️ Filters & Metadata
- Create/manage saved filters
- Field metadata access
- Component & version management

</td>
</tr>
<tr>
<td>

### 📊 Bulk Operations
- Bulk edit issues
- Bulk watch/unwatch
- Async operation tracking

</td>
<td>

### 📈 Dashboards & JQL
- Dashboard management
- JQL validation & autocomplete
- Labels management

</td>
</tr>
</table>

<p align="center">
  <strong>74 Tools</strong> for comprehensive Jira management
</p>

## 📋 Prerequisites

### Runtime Environment (choose ONE)

<table>
<tr>
<th width="50%">🥟 Bun (Easier for beginners)</th>
<th width="50%">📦 Node.js (Traditional)</th>
</tr>
<tr>
<td>

**Simpler installation, faster execution**

**Install Bun (one command):**

Windows (PowerShell as Admin):
```powershell
irm bun.sh/install.ps1 | iex
```

macOS / Linux:
```bash
curl -fsSL https://bun.sh/install | bash
```

</td>
<td>

**More widely used, larger ecosystem**

**Requirements:**
- Node.js ≥18.0.0 ([Download](https://nodejs.org/))
- npm ≥8.0.0 (included with Node.js)

</td>
</tr>
</table>

### Jira Requirements

| Requirement | Notes |
|-------------|-------|
| **Jira Cloud** | Jira Server/Data Center not supported |
| **Atlassian Account** | With access to your Jira instance |
| **API Token** | [Generate here](https://id.atlassian.com/manage-profile/security/api-tokens) |

### MCP-Compatible Client (one of)
- **VS Code** with GitHub Copilot extension
- **Claude Desktop** app
- **Cursor** IDE
- **Windsurf** IDE
- Any other MCP-compatible AI assistant

## 🚀 Quick Start

### Installation

<table>
<tr>
<th width="50%">🥟 Using Bun (Recommended)</th>
<th width="50%">📦 Using npm</th>
</tr>
<tr>
<td>

```bash
# Run directly (no install needed)
bunx mcp-jira-cloud@latest

# Or install globally
bun install -g mcp-jira-cloud
```

</td>
<td>

```bash
# Run directly (no install needed)
npx -y mcp-jira-cloud@latest

# Or install globally
npm install -g mcp-jira-cloud
```

</td>
</tr>
</table>

### Get Your API Token

1. Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Copy the token

### Configure Your AI Assistant

Choose the command based on your runtime:

| Runtime | Method | Command |
|---------|--------|---------|
| **Bun** | Run directly | `bunx mcp-jira-cloud@latest` |
| **Bun** | Global install | `bun install -g mcp-jira-cloud` → `jira-mcp` |
| **npm** | Run directly | `npx -y mcp-jira-cloud@latest` |
| **npm** | Global install | `npm i -g mcp-jira-cloud` → `jira-mcp` |

---

#### 📘 VS Code (GitHub Copilot)

Create or edit `.vscode/mcp.json` in your workspace:

<details>
<summary><strong>🥟 Using Bun (recommended for beginners)</strong></summary>

```json
{
  "servers": {
    "jira": {
      "type": "stdio",
      "command": "bunx",
      "args": ["mcp-jira-cloud@latest"],
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
<summary><strong>📦 Using npx</strong></summary>

```json
{
  "servers": {
    "jira": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-jira-cloud@latest"],
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
<summary><strong>⚡ After global install</strong></summary>

```json
{
  "servers": {
    "jira": {
      "type": "stdio",
      "command": "jira-mcp",
      "args": [],
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

---

#### 🤖 Claude Desktop

Add to your Claude configuration (`claude_desktop_config.json`):

<details>
<summary><strong>🥟 Using Bun (recommended for beginners)</strong></summary>

```json
{
  "mcpServers": {
    "jira": {
      "command": "bunx",
      "args": ["mcp-jira-cloud@latest"],
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
<summary><strong>📦 Using npx</strong></summary>

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "mcp-jira-cloud@latest"],
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

---

#### ⚡ Cursor

Create `.cursor/mcp.json` in your project or home directory:

<details>
<summary><strong>🥟 Using Bun (recommended for beginners)</strong></summary>

```json
{
  "mcpServers": {
    "jira": {
      "command": "bunx",
      "args": ["mcp-jira-cloud@latest"],
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
<summary><strong>📦 Using npx</strong></summary>

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "mcp-jira-cloud@latest"],
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
<summary><strong>⚡ After global install</strong></summary>

```json
{
  "mcpServers": {
    "jira": {
      "command": "jira-mcp",
      "args": [],
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

---

#### 🔧 Windsurf

Add to your Windsurf MCP configuration:

<details>
<summary><strong>🥟 Using Bun (recommended for beginners)</strong></summary>

```json
{
  "mcpServers": {
    "jira": {
      "command": "bunx",
      "args": ["mcp-jira-cloud@latest"],
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
<summary><strong>📦 Using npx</strong></summary>

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "mcp-jira-cloud@latest"],
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
<summary><strong>⚡ After global install</strong></summary>

```json
{
  "mcpServers": {
    "jira": {
      "command": "jira-mcp",
      "args": [],
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

> **74 tools** organised into 14 categories

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

### 📝 Issue CRUD (5 tools)

| Tool | Description |
|------|-------------|
| `jira_create_issue` | Create a new issue with full field support |
| `jira_update_issue` | Update issue fields (partial update supported) |
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

### 💬 Comments & Work Logs (5 tools)

| Tool | Description |
|------|-------------|
| `jira_get_issue_comments` | Get comments on an issue |
| `jira_add_comment` | Add a comment to an issue |
| `jira_add_worklog` | Log time spent on an issue |
| `jira_get_issue_worklogs` | Get work logs for an issue |
| `jira_get_user_worklogs` | Get worklogs by user and date range |

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
<summary><strong>🏃 Agile/Sprint Tools (15 tools)</strong></summary>

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
| `jira_get_sprint_issues` | Get issues in a sprint |
| `jira_move_issues_to_sprint` | Move issues to a sprint |
| `jira_get_backlog_issues` | Get backlog issues for a board |
| `jira_move_issues_to_backlog` | Move issues to backlog |
| `jira_rank_issues` | Change issue ranking |

</details>

<details>
<summary><strong>🔗 Issue Relationships (9 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_issue_links` | Get linked issues |
| `jira_create_issue_link` | Link two issues together |
| `jira_get_link_types` | Get available link types |
| `jira_get_watchers` | Get issue watchers |
| `jira_add_watcher` | Add a watcher to an issue |
| `jira_remove_watcher` | Remove a watcher |
| `jira_get_votes` | Get issue vote count |
| `jira_add_vote` | Vote for an issue |
| `jira_remove_vote` | Remove your vote |

</details>

<details>
<summary><strong> Epic Management (4 tools)</strong></summary>

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
<summary><strong>🗄️ Filters (6 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_filters` | Search saved filters |
| `jira_get_filter` | Get filter details |
| `jira_create_filter` | Create a new saved filter |
| `jira_update_filter` | Update an existing filter |
| `jira_get_my_filters` | Get filters owned by you |
| `jira_get_favourite_filters` | Get favourite filters |

</details>

<details>
<summary><strong>⚡ Bulk Operations (4 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_bulk_edit_issues` | Edit multiple issues at once (labels, assignee, priority, etc.) |
| `jira_bulk_watch_issues` | Add watchers to multiple issues |
| `jira_bulk_unwatch_issues` | Remove watchers from multiple issues |
| `jira_get_bulk_operation_progress` | Track async bulk operation progress |

</details>

<details>
<summary><strong>📊 Dashboard Management (5 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_dashboards` | Get dashboards (filter by favourite/owned) |
| `jira_search_dashboards` | Search dashboards by name, owner, etc. |
| `jira_get_dashboard` | Get dashboard details by ID |
| `jira_get_dashboard_gadgets` | Get all gadgets on a dashboard |
| `jira_add_dashboard_gadget` | Add a gadget to a dashboard |

</details>

<details>
<summary><strong>📎 Enhanced Attachments (4 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_attachments` | Get issue attachments |
| `jira_upload_attachment` | Upload a file to an issue |
| `jira_get_attachment_metadata` | Get attachment metadata by ID |
| `jira_get_attachment_content` | Get attachment download URL |

</details>

<details>
<summary><strong>🏷️ Labels Management (2 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_all_labels` | Get all labels in the Jira instance |
| `jira_add_labels` | Add, set, or remove labels on an issue |

</details>

<details>
<summary><strong>🔎 JQL Tools (3 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_autocomplete_jql` | Get autocomplete suggestions for JQL fields |
| `jira_validate_jql` | Validate JQL queries for syntax errors |
| `jira_parse_jql` | Parse JQL into abstract syntax tree |

</details>

<details>
<summary><strong>⏱️ Time Tracking Reports (4 tools)</strong></summary>

| Tool | Description |
|------|-------------|
| `jira_get_updated_worklog_ids` | Get worklog IDs created/updated since a date |
| `jira_get_worklogs_by_ids` | Get full worklog details by IDs (batch up to 1000) |
| `jira_get_user_worklogs` | Get all worklogs for a user in a date range with summary |
| `jira_get_deleted_worklog_ids` | Get IDs of deleted worklogs for audit purposes |

</details>

### 🛡️ Phase 14: Code Quality & Security

This release underwent a comprehensive audit to ensure best practices and security:

| Category | Status | Details |
|----------|:------:|---------|
| **API Version** | ✅ | All 74 tools use Jira REST API v3 (latest) |
| **Agile API** | ✅ | Sprint/Board tools use Jira Agile API v1.0 |
| **Deprecated APIs** | ✅ | All deprecated endpoints migrated to modern alternatives |
| **Security Vulnerabilities** | ✅ | 0 vulnerabilities (axios & qs patched) |
| **OAuth 2.0 Support** | ✅ | Full OAuth 2.0 (3LO) with auto-refresh |
| **Credential Storage** | ✅ | OS-level encryption via Keytar |
| **Input Validation** | ✅ | Zod v4 schema validation on all parameters |
| **URL Encoding** | ✅ | All dynamic path parameters properly encoded |
| **Error Handling** | ✅ | Consistent error handling across all endpoints |

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
<summary><strong>🥟 Bun Installation Issues</strong></summary>

**Windows (PowerShell as Administrator):**
```powershell
# If irm fails, try:
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm bun.sh/install.ps1 | iex
```

**macOS/Linux:**
```bash
# If curl fails, check your internet connection or try:
brew install oven-sh/bun/bun  # macOS with Homebrew
```

**Verify Installation:**
```bash
bun --version  # Should show 1.x.x
```

</details>

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

<details>
<summary><strong>❌ npx/bunx Using Old Version</strong></summary>

Clear the cache to ensure you get the latest version:

**npm:**
```bash
npx -y --package=mcp-jira-cloud@latest mcp-jira-cloud
# or clear cache:
npm cache clean --force
```

**Bun:**
```bash
bunx --bun mcp-jira-cloud@latest
# or clear cache:
bun pm cache rm
```

</details>

## 📦 Package Information

| Attribute | Value |
|-----------|-------|
| Package name | [`mcp-jira-cloud`](https://www.npmjs.com/package/mcp-jira-cloud) |
| Latest Version | ![npm version](https://img.shields.io/npm/v/mcp-jira-cloud?style=flat-square) |
| License | [MIT](LICENSE) |
| Runtime | Bun ≥1.0.0 or Node.js ≥18.0.0 |
| TypeScript | ≥5.0.0 |
| Module | ES Modules |
| Tools | **74** |

### Dependencies

| Package | Purpose |
|---------|---------|
| [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | MCP protocol implementation |
| [`axios`](https://www.npmjs.com/package/axios) | HTTP client for Jira API |
| [`keytar`](https://www.npmjs.com/package/keytar) | Secure credential storage |
| [`zod`](https://www.npmjs.com/package/zod) | Schema validation |

## 🆕 What's New

### 🥟 v4.2.0 (Latest)

| Feature | Description |
|---------|-------------|
| 🥟 **Bun Support** | Run with `bunx mcp-jira-cloud@latest` - easier for beginners |
| 📖 **Better Docs** | Simplified prerequisites and configuration examples |

---

### 🔍 v4.1.0

| Feature | Description |
|---------|-------------|
| 🎯 **Improved Tool Descriptions** | Better trigger phrases, negative guidance, and cross-references for AI agents |
| 📋 **Prerequisites Section** | Clear requirements documented in README |

---

### 🚀 v4.0.0

| Change | Description |
|--------|-------------|
| ⚠️ **Breaking** | `jira_get_worklogs` renamed to `jira_get_issue_worklogs` for clarity |
| 🐛 **Fix** | Removed duplicate tool registration that caused startup errors |

**Total tools: 74**

---

### 📦 v3.1.0

| Feature | Description |
|---------|-------------|
| 🔍 **User Worklogs Query** | New `jira_get_user_worklogs` tool to query worklogs by user and date range |
| 📊 **Time Summary** | Returns total time logged with formatted hours/minutes |

---

### ⚠️ v3.0.0 (Breaking Changes)

<table>
<tr><td>

**Removed for Safety:**
- `jira_delete_issue`
- `jira_delete_sprint`
- `jira_delete_attachment`
- `jira_delete_filter`
- `jira_delete_issue_link`

</td><td>

**Improvements:**
- 🔒 Security patches (axios, qs)
- 🔄 Deprecated API migration
- ✅ 0 known vulnerabilities

</td></tr>
</table>

---

<details>
<summary><strong>📅 v2.x Changelog</strong></summary>

### v2.2.0
- **Time Tracking Reports** - Get user worklogs for any date range with summaries

### v2.1.0
- **Dashboard Management** - View and manage Jira dashboards and gadgets
- **Enhanced Attachments** - Upload attachments, get metadata and content
- **Labels Management** - Get all labels, bulk add/remove/set labels
- **JQL Tools** - Autocomplete, validate, and parse JQL queries

### v2.0.0
- **Issue CRUD** - Create, update issues with full field support
- **Workflow Transitions** - Move issues through workflow states
- **Agile/Scrum** - Complete sprint and board management (15 tools)
- **Issue Linking** - Blocks, relates, duplicates relationships
- **Watchers & Voting** - Collaboration features
- **Epic Management** - Organise issues under epics
- **Filters** - Create and manage saved JQL filters
- **Metadata** - Access field configurations and create metadata
- **Bulk Operations** - Edit, watch, unwatch multiple issues at once

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

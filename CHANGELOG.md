# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-15

### Added

- Initial release
- **Authentication**
  - Basic Auth support (email + API token)
  - OAuth 2.0 support with automatic token refresh
  - Keytar integration for secure credential storage
  - Multiple authentication status tools
  
- **Issue Management**
  - `jira_get_issue` - Get full issue details
  - `jira_get_issue_summary` - Get issue summary with acceptance criteria
  - `jira_search_issues` - Search with JQL (full results)
  - `jira_search_issues_summary` - Search with minimal fields
  - `jira_get_my_open_issues` - Get current user's open tickets
  - `jira_resolve` - Smart routing for common intents

- **Comments**
  - `jira_get_issue_comments` - Retrieve issue comments
  - `jira_add_comment` - Add comments to issues

- **Work Logs**
  - `jira_add_worklog` - Log time spent on issues
  - `jira_get_worklogs` - Retrieve work logs from issues

- **Projects**
  - `jira_list_projects` - List accessible projects
  - `jira_get_project` - Get project details

- **User**
  - `jira_whoami` - Get current user profile

### Security

- Credentials stored securely via Keytar
- `.gitignore` and `.npmignore` configured to protect sensitive data
- OAuth tokens auto-refresh before expiration

---

## [Unreleased]

### Planned

- Issue creation and updates
- Transition issues between statuses
- Attachment support
- Sprint management tools
- Board and backlog views

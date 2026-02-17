## [4.1.0](https://github.com/tezaswi7222/jira-mcp/compare/v4.0.0...v4.1.0) (2026-02-17)

### ✨ Features

* improve tool descriptions for better AI agent selection ([6cfdd2f](https://github.com/tezaswi7222/jira-mcp/commit/6cfdd2f84d8dc6eec7d55db2d6d111ffaadf78a6))

## [4.0.0](https://github.com/tezaswi7222/jira-mcp/compare/v3.1.1...v4.0.0) (2026-02-17)

### ⚠ BREAKING CHANGES

* jira_get_worklogs renamed to jira_get_issue_worklogs for clarity

- Removed duplicate jira_get_user_worklogs registration that caused startup error
- Renamed jira_get_worklogs to jira_get_issue_worklogs to match naming pattern
- Updated README documentation

### 🐛 Bug Fixes

* remove duplicate jira_get_user_worklogs and rename jira_get_worklogs ([40cfa95](https://github.com/tezaswi7222/jira-mcp/commit/40cfa958905a09a130d6f6bbdb36942db2c6fe05))

## [3.1.1](https://github.com/tezaswi7222/jira-mcp/compare/v3.1.0...v3.1.1) (2026-02-17)

### 🐛 Bug Fixes

* remove .default() from zod schema in jira_get_user_worklogs ([7620b45](https://github.com/tezaswi7222/jira-mcp/commit/7620b451b581a50023c2d8ee896cc02f8ee3064d))

## [3.1.0](https://github.com/tezaswi7222/jira-mcp/compare/v3.0.0...v3.1.0) (2026-02-17)

### ✨ Features

* add jira_get_user_worklogs tool for querying worklogs by user and date range ([fa653ba](https://github.com/tezaswi7222/jira-mcp/commit/fa653baa24b18afc1faf6dbe56c46315ee6f63ff))

## [3.0.0](https://github.com/tezaswi7222/jira-mcp/compare/v2.0.5...v3.0.0) (2026-02-17)

### ⚠ BREAKING CHANGES

* The following tools have been removed to prevent accidental data loss:
- jira_delete_issue (permanent issue deletion)
- jira_delete_sprint (sprint deletion)
- jira_delete_attachment (attachment deletion)
- jira_delete_filter (filter deletion)
- jira_delete_issue_link (link removal)

Users requiring delete functionality should use the Jira web interface.
Total tools reduced from 78 to 73.

Updated documentation:
- README.md: Updated tool counts and removed deleted tool references
- CHANGELOG.md: Added [Unreleased] section documenting removals
- package.json: Updated description with new tool count

### ✨ Features

* add Phase 13 Time Tracking Reports (78 tools) - jira_get_user_worklogs for user worklog reports by date range ([878ea04](https://github.com/tezaswi7222/jira-mcp/commit/878ea042967f601fd0795963e7df01fa8e1143f3))
* remove destructive delete tools for safety ([ad40090](https://github.com/tezaswi7222/jira-mcp/commit/ad400900792f13a95323ed85bb1a727bd0dd5c0d))

### 🐛 Bug Fixes

* add semantic-release plugins to devDependencies ([1955510](https://github.com/tezaswi7222/jira-mcp/commit/19555101284852b7a98f92d826b71fb3c37fb931))
* **ci:** remove conflicting npm scripts and fix git credentials ([79240ee](https://github.com/tezaswi7222/jira-mcp/commit/79240eef7b0a7e0c117c94c6ab80136a8a7df95a))
* **ci:** use deploy key for branch protection bypass ([37b4af8](https://github.com/tezaswi7222/jira-mcp/commit/37b4af83efcd29f067db8094f793dae6716bab5f))
* **ci:** use GH_ACTION_TOKEN PAT for branch protection bypass ([f46ecdd](https://github.com/tezaswi7222/jira-mcp/commit/f46ecdd8030c4668f02942408200e2f41d545606))
* update deprecated createmeta API and patch security vulnerabilities ([3a98dd0](https://github.com/tezaswi7222/jira-mcp/commit/3a98dd01059b41bb86f4f8467ea064e37a31d093))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- **BREAKING CHANGE: Destructive Tools Removed for Safety**
  - `jira_delete_issue` - Permanent issue deletion (use Jira web interface)
  - `jira_delete_sprint` - Sprint deletion (use Jira web interface)
  - `jira_delete_attachment` - Attachment deletion (use Jira web interface)
  - `jira_delete_filter` - Filter deletion (use Jira web interface)
  - `jira_delete_issue_link` - Issue link removal (use Jira web interface)

### Changed

- Total tool count reduced from 78 to 73 tools
- Improved safety by removing all destructive operations

### Added

- **CI/CD: Automated Releases with semantic-release**
  - Automatic version bumping based on conventional commits
  - Auto-generated CHANGELOG from commit messages
  - GitHub releases created automatically
  - npm publishing on every release

## [2.2.1] - 2026-02-15

### Added

- **Phase 14: Code Quality & Security Hardening**
  - Comprehensive codebase audit for deprecated APIs and best practices
  - Migrated all API endpoints to Jira REST API v3 (latest stable)
  - Verified Jira Agile API v1.0 compliance for all sprint/board operations
  - Conducted full security vulnerability assessment

### Fixed

- **Deprecated API Migration**: Updated `jira_get_create_metadata` tool to use modern non-deprecated endpoints
  - Replaced deprecated `GET /rest/api/3/issue/createmeta` with:
    - `GET /rest/api/3/issue/createmeta/{projectIdOrKey}/issuetypes` - Get available issue types
    - `GET /rest/api/3/issue/createmeta/{projectIdOrKey}/issuetypes/{issueTypeId}` - Get field metadata
  - Now requires `projectIdOrKey` parameter (breaking change from optional `projectKeys` array)
  - Added pagination support with `startAt` and `maxResults` parameters

### Security

- **Dependency Updates**: Patched critical security vulnerabilities
  - Updated axios to fix HIGH severity DoS vulnerability (CVE in versions ≤1.13.4) - prototype pollution via `__proto__`
  - Updated qs to fix LOW severity arrayLimit bypass vulnerability (versions 6.7.0-6.14.1)
  - All 166 packages now pass security audit with 0 vulnerabilities

### Verified

- **API Modernisation Audit Results**:
  - ✅ All 78 tools use Jira REST API v3 (`/rest/api/3/`)
  - ✅ All Agile tools use Jira Agile API v1.0 (`/rest/agile/1.0/`)
  - ✅ OAuth 2.0 (3LO) and Basic Auth both fully supported
  - ✅ Secure credential storage via keytar (OS-level encryption)
  - ✅ Input validation via Zod v4 on all tool parameters
  - ✅ Consistent error handling across all endpoints
  - ✅ URL encoding applied to all dynamic path parameters

## [2.2.0] - 2026-02-15

### Added

- **Phase 13: Time Tracking Reports** (4 new tools)
  - `jira_get_updated_worklog_ids` - Get worklog IDs updated since a timestamp (for efficient sync)
  - `jira_get_worklogs_by_ids` - Bulk fetch worklogs by their IDs (up to 1000 at once)
  - `jira_get_user_worklogs` - Get all worklogs for a user within a date range with automatic JQL and pagination
  - `jira_get_deleted_worklog_ids` - Get worklog IDs that have been deleted since a timestamp

### Changed

- Total tool count now at 78 tools across 13 phases
- Enhanced time tracking capabilities for better reporting and analysis

## [2.1.0] - 2026-02-15

### Added

- **Phase 1: Core Issue CRUD** (14 new tools)
  - `jira_create_issue` - Create new issues with full field support
  - `jira_update_issue` - Update issues with partial field support
  - `jira_delete_issue` - Delete issues with safety confirmation
  - `jira_assign_issue` - Assign/unassign users
  - `jira_get_transitions` - Get available workflow transitions
  - `jira_transition_issue` - Move issues through workflow
  - `jira_get_issue_types` - Get available issue types
  - `jira_get_priorities` - Get priority levels
  - `jira_get_statuses` - Get available statuses
  - `jira_get_components` - Get project components
  - `jira_get_versions` - Get project versions
  - `jira_search_users` - Search for Jira users
  - `jira_get_changelog` - Get issue history

- **Phase 2: Agile Tools** (16 new tools)
  - `jira_get_boards` - List Scrum/Kanban boards
  - `jira_get_board` - Get board details
  - `jira_get_board_configuration` - Get board configuration
  - `jira_get_sprints` - List sprints for a board
  - `jira_get_sprint` - Get sprint details
  - `jira_create_sprint` - Create new sprints
  - `jira_update_sprint` - Update sprint details
  - `jira_start_sprint` - Start a future sprint
  - `jira_complete_sprint` - Complete an active sprint
  - `jira_delete_sprint` - Delete sprints with confirmation
  - `jira_get_sprint_issues` - Get issues in a sprint
  - `jira_move_issues_to_sprint` - Move issues to a sprint
  - `jira_get_backlog_issues` - Get backlog issues
  - `jira_move_issues_to_backlog` - Move issues to backlog
  - `jira_rank_issues` - Change issue ranking

- **Phase 3: Issue Relationships** (11 new tools)
  - `jira_get_issue_links` - Get linked issues
  - `jira_create_issue_link` - Link issues together
  - `jira_delete_issue_link` - Remove issue links
  - `jira_get_link_types` - Get available link types
  - `jira_get_watchers` - Get issue watchers
  - `jira_add_watcher` - Add watchers to issues
  - `jira_remove_watcher` - Remove watchers
  - `jira_get_votes` - Get issue vote count
  - `jira_add_vote` - Vote for an issue
  - `jira_remove_vote` - Remove vote from issue

- **Phase 4: Attachments** (2 new tools)
  - `jira_get_attachments` - Get issue attachments
  - `jira_delete_attachment` - Delete attachments

- **Phase 5: Epic Management** (4 new tools)
  - `jira_get_epics` - Get epics for a board
  - `jira_get_epic_issues` - Get issues in an epic
  - `jira_move_issues_to_epic` - Move issues to epic
  - `jira_remove_issues_from_epic` - Remove issues from epic

- **Phase 6: Fields and Metadata** (3 new tools)
  - `jira_get_fields` - Get all available fields
  - `jira_get_create_metadata` - Get metadata for creating issues
  - `jira_get_edit_metadata` - Get metadata for editing issues

- **Phase 7: Filters** (7 new tools)
  - `jira_get_filters` - Search saved filters
  - `jira_get_filter` - Get filter details
  - `jira_create_filter` - Create new filters
  - `jira_update_filter` - Update existing filters
  - `jira_delete_filter` - Delete filters with confirmation
  - `jira_get_my_filters` - Get filters owned by current user
  - `jira_get_favourite_filters` - Get favourite filters

- **Phase 8: Bulk Operations** (4 new tools)
  - `jira_bulk_edit_issues` - Bulk edit multiple issues at once
  - `jira_bulk_watch_issues` - Add watchers to multiple issues
  - `jira_bulk_unwatch_issues` - Remove watchers from multiple issues
  - `jira_get_bulk_operation_progress` - Track async bulk operation progress

- **Phase 9: Dashboard Management** (5 new tools)
  - `jira_get_dashboards` - Get dashboards (favourite/owned)
  - `jira_search_dashboards` - Search dashboards by criteria
  - `jira_get_dashboard` - Get dashboard details
  - `jira_get_dashboard_gadgets` - Get gadgets on a dashboard
  - `jira_add_dashboard_gadget` - Add a gadget to a dashboard

- **Phase 10: Enhanced Attachments** (3 new tools)
  - `jira_upload_attachment` - Upload files to issues
  - `jira_get_attachment_metadata` - Get attachment metadata
  - `jira_get_attachment_content` - Get attachment download URL

- **Phase 11: Labels Management** (2 new tools)
  - `jira_get_all_labels` - Get all labels in the instance
  - `jira_add_labels` - Add, set, or remove labels on issues

- **Phase 12: JQL Tools** (3 new tools)
  - `jira_autocomplete_jql` - Get JQL autocomplete suggestions
  - `jira_validate_jql` - Validate JQL query syntax
  - `jira_parse_jql` - Parse JQL into AST structure

- **Phase 13: Time Tracking Reports** (4 new tools)
  - `jira_get_updated_worklog_ids` - Get worklog IDs created/updated since a date
  - `jira_get_worklogs_by_ids` - Get full worklog details by IDs
  - `jira_get_user_worklogs` - Get all worklogs for a user in a date range with summary
  - `jira_get_deleted_worklog_ids` - Get IDs of deleted worklogs for audit

### Changed

- Version bumped to 2.0.0 (major feature release)
- Helper functions for field building (`buildIssueFields`, `buildUpdateOperations`)
- Improved TypeScript strict mode compliance
- Total tools: 78 (up from 18)

---

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

- Webhook integration
- Burndown chart data
- Release management
- Custom field management
- Team workload reports

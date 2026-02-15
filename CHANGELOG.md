# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-15

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

### Changed

- Version bumped to 2.0.0 (major feature release)
- Helper functions for field building (`buildIssueFields`, `buildUpdateOperations`)
- Improved TypeScript strict mode compliance
- Total tools: 57 (up from 18)

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

- Attachment upload support
- Bulk operations
- Dashboard management
- Advanced JQL builder
- Webhook integration

# Jira MCP Server - Feature Roadmap

> A comprehensive analysis of current capabilities and potential enhancements for the Jira MCP Server.

## Table of Contents

1. [Current Implementation](#current-implementation)
2. [Missing Features by Category](#missing-features-by-category)
3. [Enhancement Priorities](#enhancement-priorities)
4. [Implementation Roadmap](#implementation-roadmap)
5. [Technical Considerations](#technical-considerations)

---

## Current Implementation

### ✅ Implemented Tools (11 Tools)

| Tool | Description | API Endpoint |
|------|-------------|--------------|
| `jira_auth_status` | Check authentication status | N/A (local) |
| `jira_clear_auth` | Clear stored credentials | N/A (local) |
| `jira_set_auth` | Set Basic Auth credentials | N/A (local) |
| `jira_oauth_get_auth_url` | Generate OAuth URL | N/A (local) |
| `jira_oauth_exchange_code` | Exchange OAuth code for token | OAuth flow |
| `jira_whoami` | Get current user info | `GET /rest/api/3/myself` |
| `jira_get_issue` | Get issue details | `GET /rest/api/3/issue/{issueIdOrKey}` |
| `jira_get_issue_summary` | Get issue summary only | `GET /rest/api/3/issue/{issueIdOrKey}` |
| `jira_search_issues` | Search issues with JQL | `GET /rest/api/3/search` |
| `jira_search_issues_summary` | Search with summary results | `GET /rest/api/3/search` |
| `jira_get_my_open_issues` | Get user's open issues | `GET /rest/api/3/search` |
| `jira_get_issue_comments` | Get issue comments | `GET /rest/api/3/issue/{id}/comment` |
| `jira_add_comment` | Add comment to issue | `POST /rest/api/3/issue/{id}/comment` |
| `jira_add_worklog` | Log work on issue | `POST /rest/api/3/issue/{id}/worklog` |
| `jira_get_worklogs` | Get issue worklogs | `GET /rest/api/3/issue/{id}/worklog` |
| `jira_list_projects` | List all projects | `GET /rest/api/3/project` |
| `jira_get_project` | Get project details | `GET /rest/api/3/project/{projectIdOrKey}` |
| `jira_resolve` | Routing tool for intents | N/A (router) |

---

## Missing Features by Category

### 🔴 Priority 1: Core Issue Management (High Impact)

#### Issue Creation & Updates

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Create Issue** | `POST /rest/api/3/issue` | Medium | ⭐⭐⭐⭐⭐ |
| **Edit/Update Issue** | `PUT /rest/api/3/issue/{issueIdOrKey}` | Medium | ⭐⭐⭐⭐⭐ |
| **Delete Issue** | `DELETE /rest/api/3/issue/{issueIdOrKey}` | Low | ⭐⭐⭐ |
| **Bulk Create Issues** | `POST /rest/api/3/issue/bulk` | High | ⭐⭐⭐⭐ |
| **Bulk Fetch Issues** | `POST /rest/api/3/issue/bulkfetch` | Medium | ⭐⭐⭐ |
| **Archive Issues** | `PUT /rest/api/3/issue/archive` | Low | ⭐⭐ |
| **Unarchive Issues** | `PUT /rest/api/3/issue/unarchive` | Low | ⭐⭐ |

```typescript
// Example: Create Issue Tool Schema
{
  name: "jira_create_issue",
  description: "Create a new Jira issue",
  inputSchema: {
    projectKey: string,      // Required: "MXTS"
    issueType: string,       // Required: "Bug", "Task", "Story"
    summary: string,         // Required
    description?: string,    // Optional: ADF format
    assignee?: string,       // Optional: account ID
    priority?: string,       // Optional: "High", "Medium", "Low"
    labels?: string[],       // Optional
    components?: string[],   // Optional
    fixVersions?: string[],  // Optional
    dueDate?: string,        // Optional: "2024-12-31"
    parentKey?: string,      // Optional: for subtasks
    customFields?: object    // Optional: custom field values
  }
}
```

#### Issue Transitions & Workflow

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Transitions** | `GET /rest/api/3/issue/{id}/transitions` | Low | ⭐⭐⭐⭐⭐ |
| **Transition Issue** | `POST /rest/api/3/issue/{id}/transitions` | Medium | ⭐⭐⭐⭐⭐ |

```typescript
// Example: Transition Issue Tool
{
  name: "jira_transition_issue",
  description: "Move issue to different status (e.g., In Progress, Done)",
  inputSchema: {
    issueIdOrKey: string,    // Required: "MXTS-72032"
    transitionId: string,    // Required: transition ID
    comment?: string,        // Optional: add comment during transition
    resolution?: string,     // Optional: for closing issues
    fields?: object          // Optional: update fields during transition
  }
}
```

#### Issue Assignment

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Assign Issue** | `PUT /rest/api/3/issue/{id}/assignee` | Low | ⭐⭐⭐⭐⭐ |
| **Unassign Issue** | `PUT /rest/api/3/issue/{id}/assignee` | Low | ⭐⭐⭐⭐ |

---

### 🟠 Priority 2: Issue Relationships & Metadata (Medium-High Impact)

#### Issue Links

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Issue Links** | Included in issue response | Low | ⭐⭐⭐⭐ |
| **Create Issue Link** | `POST /rest/api/3/issueLink` | Medium | ⭐⭐⭐⭐ |
| **Delete Issue Link** | `DELETE /rest/api/3/issueLink/{linkId}` | Low | ⭐⭐⭐ |
| **Get Link Types** | `GET /rest/api/3/issueLinkType` | Low | ⭐⭐⭐ |

```typescript
// Example: Create Issue Link Tool
{
  name: "jira_link_issues",
  description: "Link two issues together",
  inputSchema: {
    inwardIssue: string,     // Issue key: "MXTS-100"
    outwardIssue: string,    // Issue key: "MXTS-200"
    linkType: string         // "blocks", "is blocked by", "relates to", "duplicates"
  }
}
```

#### Issue Watchers

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Watchers** | `GET /rest/api/3/issue/{id}/watchers` | Low | ⭐⭐⭐ |
| **Add Watcher** | `POST /rest/api/3/issue/{id}/watchers` | Low | ⭐⭐⭐ |
| **Remove Watcher** | `DELETE /rest/api/3/issue/{id}/watchers` | Low | ⭐⭐⭐ |

#### Issue Votes

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Votes** | `GET /rest/api/3/issue/{id}/votes` | Low | ⭐⭐ |
| **Add Vote** | `POST /rest/api/3/issue/{id}/votes` | Low | ⭐⭐ |
| **Remove Vote** | `DELETE /rest/api/3/issue/{id}/votes` | Low | ⭐⭐ |

#### Labels Management

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get All Labels** | `GET /rest/api/3/label` | Low | ⭐⭐⭐ |
| **Add Labels to Issue** | Via Edit Issue | Medium | ⭐⭐⭐⭐ |
| **Remove Labels** | Via Edit Issue | Medium | ⭐⭐⭐⭐ |

---

### 🟡 Priority 3: Attachments & Remote Links (Medium Impact)

#### Attachments

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Attachments** | Included in issue response | Low | ⭐⭐⭐ |
| **Add Attachment** | `POST /rest/api/3/issue/{id}/attachments` | High | ⭐⭐⭐⭐ |
| **Delete Attachment** | `DELETE /rest/api/3/attachment/{id}` | Low | ⭐⭐⭐ |
| **Get Attachment Metadata** | `GET /rest/api/3/attachment/{id}` | Low | ⭐⭐⭐ |
| **Get Attachment Content** | `GET /rest/api/3/attachment/content/{id}` | Medium | ⭐⭐⭐ |

```typescript
// Example: Add Attachment Tool
{
  name: "jira_add_attachment",
  description: "Attach a file to an issue",
  inputSchema: {
    issueIdOrKey: string,    // Required
    filePath: string,        // Path to file
    // Note: Requires multipart/form-data handling
  }
}
```

#### Remote Issue Links

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Remote Links** | `GET /rest/api/3/issue/{id}/remotelink` | Low | ⭐⭐⭐ |
| **Create Remote Link** | `POST /rest/api/3/issue/{id}/remotelink` | Medium | ⭐⭐⭐ |
| **Update Remote Link** | `PUT /rest/api/3/issue/{id}/remotelink/{linkId}` | Medium | ⭐⭐⭐ |
| **Delete Remote Link** | `DELETE /rest/api/3/issue/{id}/remotelink/{linkId}` | Low | ⭐⭐ |

---

### 🟢 Priority 4: Agile/Scrum Features (High Impact for Agile Teams)

#### Board Management

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get All Boards** | `GET /rest/agile/1.0/board` | Low | ⭐⭐⭐⭐ |
| **Get Board** | `GET /rest/agile/1.0/board/{boardId}` | Low | ⭐⭐⭐⭐ |
| **Get Board Configuration** | `GET /rest/agile/1.0/board/{boardId}/configuration` | Low | ⭐⭐⭐ |
| **Get Board Issues** | `GET /rest/agile/1.0/board/{boardId}/issue` | Low | ⭐⭐⭐⭐ |
| **Get Backlog Issues** | `GET /rest/agile/1.0/board/{boardId}/backlog` | Low | ⭐⭐⭐⭐ |
| **Move to Board** | `POST /rest/agile/1.0/board/{boardId}/issue` | Medium | ⭐⭐⭐ |

```typescript
// Example: Get Board Tool
{
  name: "jira_get_board",
  description: "Get agile board details",
  inputSchema: {
    boardId?: number,        // Optional: specific board ID
    projectKey?: string,     // Optional: filter by project
    type?: string            // Optional: "scrum" | "kanban"
  }
}
```

#### Sprint Management

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get All Sprints** | `GET /rest/agile/1.0/board/{boardId}/sprint` | Low | ⭐⭐⭐⭐⭐ |
| **Get Sprint** | `GET /rest/agile/1.0/sprint/{sprintId}` | Low | ⭐⭐⭐⭐ |
| **Create Sprint** | `POST /rest/agile/1.0/sprint` | Medium | ⭐⭐⭐⭐ |
| **Update Sprint** | `PUT /rest/agile/1.0/sprint/{sprintId}` | Medium | ⭐⭐⭐⭐ |
| **Start/Close Sprint** | `POST /rest/agile/1.0/sprint/{sprintId}` | Medium | ⭐⭐⭐⭐ |
| **Delete Sprint** | `DELETE /rest/agile/1.0/sprint/{sprintId}` | Low | ⭐⭐⭐ |
| **Get Sprint Issues** | `GET /rest/agile/1.0/sprint/{sprintId}/issue` | Low | ⭐⭐⭐⭐⭐ |
| **Move Issues to Sprint** | `POST /rest/agile/1.0/sprint/{sprintId}/issue` | Medium | ⭐⭐⭐⭐⭐ |

```typescript
// Example: Sprint Management Tools
{
  name: "jira_get_sprints",
  description: "Get all sprints for a board",
  inputSchema: {
    boardId: number,         // Required
    state?: string           // Optional: "future" | "active" | "closed"
  }
}

{
  name: "jira_move_to_sprint",
  description: "Move issues to a sprint",
  inputSchema: {
    sprintId: number,        // Required
    issues: string[],        // Issue keys: ["MXTS-100", "MXTS-101"]
    rankBefore?: string,     // Optional: rank before this issue
    rankAfter?: string       // Optional: rank after this issue
  }
}
```

#### Epic Management

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Epics for Board** | `GET /rest/agile/1.0/board/{boardId}/epic` | Low | ⭐⭐⭐⭐ |
| **Get Epic** | `GET /rest/agile/1.0/epic/{epicIdOrKey}` | Low | ⭐⭐⭐⭐ |
| **Get Epic Issues** | `GET /rest/agile/1.0/epic/{epicIdOrKey}/issue` | Low | ⭐⭐⭐⭐ |
| **Move Issues to Epic** | `POST /rest/agile/1.0/epic/{epicIdOrKey}/issue` | Medium | ⭐⭐⭐⭐ |
| **Remove from Epic** | `POST /rest/agile/1.0/epic/none/issue` | Medium | ⭐⭐⭐ |
| **Rank Epics** | `PUT /rest/agile/1.0/epic/{epicIdOrKey}/rank` | Medium | ⭐⭐⭐ |

---

### 🔵 Priority 5: Project & Configuration (Medium Impact)

#### Project Components

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Components** | `GET /rest/api/3/project/{projectKey}/components` | Low | ⭐⭐⭐ |
| **Create Component** | `POST /rest/api/3/component` | Medium | ⭐⭐⭐ |
| **Update Component** | `PUT /rest/api/3/component/{id}` | Medium | ⭐⭐⭐ |
| **Delete Component** | `DELETE /rest/api/3/component/{id}` | Low | ⭐⭐ |

#### Project Versions

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Versions** | `GET /rest/api/3/project/{projectKey}/versions` | Low | ⭐⭐⭐⭐ |
| **Create Version** | `POST /rest/api/3/version` | Medium | ⭐⭐⭐ |
| **Update Version** | `PUT /rest/api/3/version/{id}` | Medium | ⭐⭐⭐ |
| **Release Version** | `POST /rest/api/3/version/{id}/move` | Medium | ⭐⭐⭐ |
| **Delete Version** | `DELETE /rest/api/3/version/{id}` | Low | ⭐⭐ |

#### Issue Types

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get All Issue Types** | `GET /rest/api/3/issuetype` | Low | ⭐⭐⭐ |
| **Get Project Issue Types** | `GET /rest/api/3/issuetype/project` | Low | ⭐⭐⭐⭐ |

#### Priorities

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Priorities** | `GET /rest/api/3/priority` | Low | ⭐⭐⭐ |

#### Statuses

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get All Statuses** | `GET /rest/api/3/status` | Low | ⭐⭐⭐ |
| **Get Project Statuses** | `GET /rest/api/3/project/{projectKey}/statuses` | Low | ⭐⭐⭐ |

---

### ⚪ Priority 6: User Management (Low-Medium Impact)

#### User Operations

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Search Users** | `GET /rest/api/3/user/search` | Low | ⭐⭐⭐⭐ |
| **Get User** | `GET /rest/api/3/user` | Low | ⭐⭐⭐ |
| **Find Assignable Users** | `GET /rest/api/3/user/assignable/search` | Low | ⭐⭐⭐⭐ |
| **Get User Groups** | `GET /rest/api/3/user/groups` | Low | ⭐⭐ |

```typescript
// Example: Search Users Tool
{
  name: "jira_search_users",
  description: "Search for Jira users",
  inputSchema: {
    query: string,           // Required: search string
    projectKey?: string,     // Optional: filter by project
    maxResults?: number      // Optional: default 50
  }
}
```

#### Groups

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Groups** | `GET /rest/api/3/group/bulk` | Low | ⭐⭐ |
| **Get Group Members** | `GET /rest/api/3/group/member` | Low | ⭐⭐ |

---

### 🟣 Priority 7: History & Changelog (Medium Impact)

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Issue Changelog** | `GET /rest/api/3/issue/{id}/changelog` | Low | ⭐⭐⭐⭐ |
| **Bulk Fetch Changelogs** | `POST /rest/api/3/changelog/bulkfetch` | Medium | ⭐⭐⭐ |

```typescript
// Example: Get Changelog Tool
{
  name: "jira_get_changelog",
  description: "Get history of changes for an issue",
  inputSchema: {
    issueIdOrKey: string,    // Required
    maxResults?: number,     // Optional
    startAt?: number         // Optional: pagination
  }
}
```

---

### 🟤 Priority 8: Filters & Dashboards (Low Impact)

#### Filters

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Favourite Filters** | `GET /rest/api/3/filter/favourite` | Low | ⭐⭐⭐ |
| **Get Filter** | `GET /rest/api/3/filter/{id}` | Low | ⭐⭐⭐ |
| **Create Filter** | `POST /rest/api/3/filter` | Medium | ⭐⭐⭐ |
| **Update Filter** | `PUT /rest/api/3/filter/{id}` | Medium | ⭐⭐ |
| **Delete Filter** | `DELETE /rest/api/3/filter/{id}` | Low | ⭐⭐ |

#### Dashboards

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Get Dashboards** | `GET /rest/api/3/dashboard` | Low | ⭐⭐ |
| **Get Dashboard** | `GET /rest/api/3/dashboard/{id}` | Low | ⭐⭐ |

---

### ⬛ Priority 9: DevOps Integration (Specialised)

#### Development Information (Jira Software)

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Store Dev Info** | `POST /rest/devinfo/0.10/bulk` | High | ⭐⭐⭐ |
| **Get Dev Info** | `GET /rest/devinfo/0.10/repository/{id}` | Medium | ⭐⭐⭐ |

#### Deployments

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Submit Deployments** | `POST /rest/deployments/0.1/bulk` | High | ⭐⭐⭐ |
| **Get Deployments** | `GET /rest/deployments/0.1/pipelines/{id}` | Medium | ⭐⭐⭐ |

#### Builds

| Feature | API Endpoint | Complexity | Impact |
|---------|--------------|------------|--------|
| **Submit Builds** | `POST /rest/builds/0.1/bulk` | High | ⭐⭐⭐ |
| **Get Builds** | `GET /rest/builds/0.1/pipelines/{id}` | Medium | ⭐⭐⭐ |

---

## Enhancement Priorities

### Phase 1: Essential CRUD (v1.1.0) - High Priority

**Timeline: 1-2 weeks**

1. ✨ `jira_create_issue` - Create new issues
2. ✨ `jira_update_issue` - Edit existing issues  
3. ✨ `jira_assign_issue` - Assign/unassign users
4. ✨ `jira_get_transitions` - Get available transitions
5. ✨ `jira_transition_issue` - Move issues through workflow

### Phase 2: Agile Tools (v1.2.0) - High Priority

**Timeline: 2-3 weeks**

1. 🏃 `jira_get_boards` - List agile boards
2. 🏃 `jira_get_sprints` - Get sprints for a board
3. 🏃 `jira_get_sprint_issues` - Get issues in a sprint
4. 🏃 `jira_move_to_sprint` - Move issues to sprint
5. 🏃 `jira_get_backlog` - Get backlog issues

### Phase 3: Relationships & Links (v1.3.0) - Medium Priority

**Timeline: 1-2 weeks**

1. 🔗 `jira_link_issues` - Create issue links
2. 🔗 `jira_get_issue_links` - Get linked issues
3. 🔗 `jira_unlink_issues` - Remove issue links
4. 👁️ `jira_add_watcher` - Add watcher to issue
5. 👁️ `jira_remove_watcher` - Remove watcher

### Phase 4: Project Configuration (v1.4.0) - Medium Priority

**Timeline: 1-2 weeks**

1. 📦 `jira_get_components` - Get project components
2. 📦 `jira_get_versions` - Get project versions
3. 📦 `jira_get_issue_types` - Get available issue types
4. 📦 `jira_get_priorities` - Get priority levels
5. 📦 `jira_get_statuses` - Get available statuses

### Phase 5: User Management (v1.5.0) - Medium Priority

**Timeline: 1 week**

1. 👤 `jira_search_users` - Search for users
2. 👤 `jira_get_assignable_users` - Get assignable users for project
3. 📜 `jira_get_changelog` - Get issue history

### Phase 6: Epic Management (v1.6.0) - Medium Priority

**Timeline: 1-2 weeks**

1. 📚 `jira_get_epics` - Get epics for board
2. 📚 `jira_get_epic_issues` - Get issues in epic
3. 📚 `jira_move_to_epic` - Move issues to epic
4. 📚 `jira_remove_from_epic` - Remove issues from epic

### Phase 7: Attachments (v1.7.0) - Low Priority

**Timeline: 2 weeks**

1. 📎 `jira_add_attachment` - Upload file attachment
2. 📎 `jira_get_attachment` - Download attachment
3. 📎 `jira_delete_attachment` - Remove attachment

### Phase 8: Advanced Features (v2.0.0) - Future

**Timeline: TBD**

1. 🔄 `jira_bulk_create_issues` - Create multiple issues
2. 🔄 `jira_bulk_update_issues` - Update multiple issues
3. 📊 `jira_get_filters` - Get saved filters
4. 📊 `jira_create_filter` - Create JQL filter
5. 🔔 `jira_send_notification` - Send notification for issue

---

## Implementation Roadmap

### Gantt Chart View

```
v1.1.0 Essential CRUD     ████████░░░░░░░░░░░░  Week 1-2
v1.2.0 Agile Tools        ░░░░░░████████████░░  Week 3-5
v1.3.0 Links & Watchers   ░░░░░░░░░░░░░░████░░  Week 6-7
v1.4.0 Configuration      ░░░░░░░░░░░░░░░░████  Week 8-9
v1.5.0 User Management    ░░░░░░░░░░░░░░░░░░██  Week 10
v1.6.0 Epic Management    ░░░░░░░░░░░░░░░░░░░░  Week 11-12
v1.7.0 Attachments        ░░░░░░░░░░░░░░░░░░░░  Week 13-14
v2.0.0 Advanced           ░░░░░░░░░░░░░░░░░░░░  Future
```

### Estimated Effort per Feature

| Complexity | Estimated Time | Example Features |
|------------|----------------|------------------|
| Low | 1-2 hours | Get Priorities, Get Statuses, Add Watcher |
| Medium | 2-4 hours | Create Issue, Transition Issue, Get Sprints |
| High | 4-8 hours | Add Attachment, Bulk Operations |

---

## Technical Considerations

### OAuth Scopes Required

For full functionality, the following OAuth scopes are needed:

```
Classic Scopes:
- read:jira-work (current)
- write:jira-work (needed for create/update)
- delete:jira-work (needed for delete operations)
- manage:jira-project (needed for project configuration)

Granular Scopes:
- read:issue:jira
- write:issue:jira
- read:sprint:jira-software
- write:sprint:jira-software
- read:board-scope:jira-software
- read:epic:jira-software
```

### API Rate Limits

- Jira Cloud: Rate limiting is based on available resources
- Recommended: Implement request queuing for bulk operations
- Consider: Adding retry logic with exponential backoff

### ADF (Atlassian Document Format)

Many fields (description, comments) use ADF. Current implementation includes:
- `textToAdf()` - Convert plain text to ADF
- `adfToText()` - Convert ADF to plain text

Consider enhancing to support:
- Rich text formatting
- Mentions (@user)
- Links
- Code blocks
- Tables

### Error Handling Patterns

Current pattern is good, but consider adding:
- More specific error types
- Retry logic for transient failures
- Rate limit handling
- Better error messages for common issues

### Caching Opportunities

Consider caching for:
- Issue types (rarely change)
- Priorities (rarely change)
- Statuses (rarely change)
- Project components (change infrequently)
- User search results (short TTL)

---

## Quick Reference: API Endpoints Summary

### Issues
```
GET    /rest/api/3/issue/{issueIdOrKey}     - Get issue
POST   /rest/api/3/issue                     - Create issue
PUT    /rest/api/3/issue/{issueIdOrKey}     - Update issue
DELETE /rest/api/3/issue/{issueIdOrKey}     - Delete issue
PUT    /rest/api/3/issue/{issueIdOrKey}/assignee - Assign issue
GET    /rest/api/3/issue/{issueIdOrKey}/transitions - Get transitions
POST   /rest/api/3/issue/{issueIdOrKey}/transitions - Transition issue
```

### Comments & Worklogs
```
GET    /rest/api/3/issue/{issueIdOrKey}/comment  - Get comments
POST   /rest/api/3/issue/{issueIdOrKey}/comment  - Add comment
GET    /rest/api/3/issue/{issueIdOrKey}/worklog  - Get worklogs
POST   /rest/api/3/issue/{issueIdOrKey}/worklog  - Add worklog
```

### Links & Attachments
```
POST   /rest/api/3/issueLink                     - Create link
DELETE /rest/api/3/issueLink/{linkId}            - Delete link
POST   /rest/api/3/issue/{issueIdOrKey}/attachments - Add attachment
DELETE /rest/api/3/attachment/{id}               - Delete attachment
```

### Watchers & Votes
```
GET    /rest/api/3/issue/{issueIdOrKey}/watchers - Get watchers
POST   /rest/api/3/issue/{issueIdOrKey}/watchers - Add watcher
DELETE /rest/api/3/issue/{issueIdOrKey}/watchers - Remove watcher
GET    /rest/api/3/issue/{issueIdOrKey}/votes    - Get votes
POST   /rest/api/3/issue/{issueIdOrKey}/votes    - Add vote
```

### Agile/Scrum
```
GET    /rest/agile/1.0/board                     - Get boards
GET    /rest/agile/1.0/board/{boardId}           - Get board
GET    /rest/agile/1.0/board/{boardId}/sprint    - Get sprints
GET    /rest/agile/1.0/sprint/{sprintId}         - Get sprint
POST   /rest/agile/1.0/sprint                    - Create sprint
PUT    /rest/agile/1.0/sprint/{sprintId}         - Update sprint
GET    /rest/agile/1.0/sprint/{sprintId}/issue   - Get sprint issues
POST   /rest/agile/1.0/sprint/{sprintId}/issue   - Move to sprint
GET    /rest/agile/1.0/board/{boardId}/epic      - Get epics
GET    /rest/agile/1.0/epic/{epicIdOrKey}/issue  - Get epic issues
POST   /rest/agile/1.0/epic/{epicIdOrKey}/issue  - Move to epic
```

### Project & Configuration
```
GET    /rest/api/3/project                       - List projects
GET    /rest/api/3/project/{projectIdOrKey}      - Get project
GET    /rest/api/3/project/{key}/components      - Get components
GET    /rest/api/3/project/{key}/versions        - Get versions
GET    /rest/api/3/issuetype                     - Get issue types
GET    /rest/api/3/priority                      - Get priorities
GET    /rest/api/3/status                        - Get statuses
```

### Users & Groups
```
GET    /rest/api/3/myself                        - Current user
GET    /rest/api/3/user/search                   - Search users
GET    /rest/api/3/user/assignable/search        - Assignable users
```

---

## Conclusion

This roadmap outlines a comprehensive plan to evolve the Jira MCP Server from a basic issue viewer to a full-featured Jira administration tool. The priorities are organised to deliver maximum value early while building towards complete coverage of Jira's capabilities.

**Next Steps:**
1. Review and prioritise based on team needs
2. Create GitHub issues for each feature
3. Begin Phase 1 implementation
4. Gather user feedback for re-prioritisation

---

*Last Updated: February 2026*
*Author: Tezaswi Raj*

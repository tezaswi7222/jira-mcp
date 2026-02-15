# Jira MCP Server - Implementation Plan

> A comprehensive, phased implementation plan for enhancing the Jira MCP Server with robust error handling, testing strategies, and rollback procedures.

## Executive Summary

This plan outlines the systematic implementation of 40+ new features across 8 phases, with each phase broken into sub-phases for granular progress tracking and risk mitigation.

---

## Implementation Principles

### 1. Code Quality Standards
- **TypeScript Strict Mode**: All new code follows strict TypeScript patterns
- **Zod Validation**: All input schemas use Zod for runtime validation
- **Error Handling**: Consistent error handling using existing `errorToResult` pattern
- **DRY Principle**: Reuse existing helper functions (`textToAdf`, `adfToText`, `textResult`, etc.)

### 2. Testing Strategy
- **Unit Tests**: Each tool tested independently
- **Integration Tests**: Cross-tool workflows tested
- **Edge Cases**: Empty inputs, invalid data, permission errors, rate limits
- **Regression Tests**: Existing tools must continue working

### 3. Rollback Strategy
- **Git Commits**: Atomic commits per sub-phase
- **Feature Flags**: New tools can be disabled if issues arise
- **Version Bumps**: Semantic versioning (patch/minor/major)

---

## Phase 1: Core Issue CRUD (v1.1.0)

**Timeline**: Week 1-2  
**Risk Level**: Medium  
**Dependencies**: None

### Sub-Phase 1.1: Create Issue Tool

**Tool Name**: `jira_create_issue`

**API Endpoint**: `POST /rest/api/3/issue`

**Required Fields**:
- `projectKey` (string) - Project key like "MXTS"
- `issueType` (string) - Issue type name or ID
- `summary` (string) - Issue title

**Optional Fields**:
- `description` (string) - Plain text, auto-converted to ADF
- `assignee` (string) - Account ID
- `reporter` (string) - Account ID
- `priority` (string) - Priority name or ID
- `labels` (string[]) - Array of label strings
- `components` (string[]) - Component names or IDs
- `fixVersions` (string[]) - Version names or IDs
- `affectsVersions` (string[]) - Version names or IDs
- `dueDate` (string) - ISO date format YYYY-MM-DD
- `parentKey` (string) - For subtasks
- `customFields` (object) - Key-value pairs for custom fields
- `timeTracking` (object) - Original/remaining estimate

**Test Cases**:
| # | Test Case | Input | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Minimal creation | project, type, summary | Success, returns key |
| 2 | Full creation | All fields populated | Success, all fields set |
| 3 | Invalid project | Non-existent project | 404 error handled |
| 4 | Invalid issue type | Wrong type for project | 400 error handled |
| 5 | Missing required | No summary | Zod validation error |
| 6 | Subtask creation | With parentKey | Success, linked to parent |
| 7 | Custom fields | With customfield_xxxxx | Success, custom values set |
| 8 | Permission denied | No create permission | 403 error handled |
| 9 | Rate limited | Bulk creation | 429 error handled |
| 10 | Large description | 10KB+ text | Success, truncated if needed |

**Rollback**: Delete tool registration, revert to previous version

---

### Sub-Phase 1.2: Update Issue Tool

**Tool Name**: `jira_update_issue`

**API Endpoint**: `PUT /rest/api/3/issue/{issueIdOrKey}`

**Input Schema**:
- `issueIdOrKey` (string, required)
- `summary` (string, optional)
- `description` (string, optional)
- `assignee` (string, optional) - Use `null` to unassign
- `priority` (string, optional)
- `labels` (object, optional) - `{add: [], remove: [], set: []}`
- `components` (object, optional) - `{add: [], remove: [], set: []}`
- `fixVersions` (object, optional) - `{add: [], remove: [], set: []}`
- `dueDate` (string, optional) - Use `null` to clear
- `customFields` (object, optional)
- `notifyUsers` (boolean, optional) - Default true

**Test Cases**:
| # | Test Case | Input | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Update summary | New summary text | Success |
| 2 | Update description | New description | Success, ADF converted |
| 3 | Clear field | `dueDate: null` | Field cleared |
| 4 | Add label | `labels: {add: ["new"]}` | Label added |
| 5 | Remove label | `labels: {remove: ["old"]}` | Label removed |
| 6 | Set labels | `labels: {set: ["only"]}` | Labels replaced |
| 7 | Invalid issue | Non-existent key | 404 error |
| 8 | No permission | Read-only user | 403 error |
| 9 | Concurrent edit | Stale data | Handles gracefully |
| 10 | Silent update | `notifyUsers: false` | No notifications sent |

---

### Sub-Phase 1.3: Delete Issue Tool

**Tool Name**: `jira_delete_issue`

**API Endpoint**: `DELETE /rest/api/3/issue/{issueIdOrKey}`

**Safety Features**:
- Requires explicit confirmation parameter
- Option to delete subtasks
- Soft delete warning for linked issues

**Input Schema**:
- `issueIdOrKey` (string, required)
- `deleteSubtasks` (boolean, optional) - Default false
- `confirmDelete` (boolean, required) - Must be true to proceed

**Test Cases**:
| # | Test Case | Input | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Delete issue | Valid key, confirmed | Success |
| 2 | Without confirm | confirmDelete: false | Rejected with warning |
| 3 | With subtasks | deleteSubtasks: true | All deleted |
| 4 | Linked issue | Has blockers | Warning returned |
| 5 | Invalid issue | Non-existent key | 404 error |
| 6 | No permission | Non-admin user | 403 error |

---

### Sub-Phase 1.4: Assign Issue Tool

**Tool Name**: `jira_assign_issue`

**API Endpoint**: `PUT /rest/api/3/issue/{issueIdOrKey}/assignee`

**Input Schema**:
- `issueIdOrKey` (string, required)
- `accountId` (string, optional) - User account ID, null to unassign

**Test Cases**:
| # | Test Case | Input | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Assign to user | Valid accountId | Success |
| 2 | Unassign | accountId: null | Unassigned |
| 3 | Self-assign | accountId: "-1" | Assigned to current user |
| 4 | Invalid user | Non-existent accountId | 400 error |
| 5 | Invalid issue | Non-existent key | 404 error |
| 6 | No permission | Non-assignable user | 403 error |

---

### Sub-Phase 1.5: Get Transitions Tool

**Tool Name**: `jira_get_transitions`

**API Endpoint**: `GET /rest/api/3/issue/{issueIdOrKey}/transitions`

**Input Schema**:
- `issueIdOrKey` (string, required)
- `expand` (string, optional) - Include transition fields

**Response Structure**:
```json
{
  "transitions": [
    {
      "id": "11",
      "name": "In Progress",
      "to": {
        "id": "3",
        "name": "In Progress",
        "statusCategory": {
          "key": "indeterminate",
          "name": "In Progress"
        }
      },
      "hasScreen": false,
      "isGlobal": false,
      "isInitial": false,
      "isConditional": false,
      "fields": {}
    }
  ]
}
```

**Test Cases**:
| # | Test Case | Input | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Get transitions | Valid issue | List of available transitions |
| 2 | With fields | expand: "transitions.fields" | Includes required fields |
| 3 | No transitions | Workflow end state | Empty list |
| 4 | Invalid issue | Non-existent key | 404 error |
| 5 | No view permission | Private issue | 403 error |

---

### Sub-Phase 1.6: Transition Issue Tool

**Tool Name**: `jira_transition_issue`

**API Endpoint**: `POST /rest/api/3/issue/{issueIdOrKey}/transitions`

**Input Schema**:
- `issueIdOrKey` (string, required)
- `transitionId` (string, required)
- `comment` (string, optional)
- `resolution` (string, optional) - For Done transitions
- `fields` (object, optional) - Required fields for transition
- `historyMetadata` (object, optional) - Custom history entry

**Test Cases**:
| # | Test Case | Input | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Simple transition | To In Progress | Success |
| 2 | With comment | Add transition comment | Comment added |
| 3 | With resolution | To Done, resolution: Fixed | Success, resolved |
| 4 | Required fields | Missing required field | 400 error with details |
| 5 | Invalid transition | Wrong transitionId | 400 error |
| 6 | Invalid issue | Non-existent key | 404 error |
| 7 | No permission | No transition permission | 403 error |
| 8 | Screen transition | hasScreen: true | Fields validated |

---

### Sub-Phase 1.7: Helper Functions

**New Utility Functions**:

```typescript
// Get issue types for a project
async function getIssueTypes(client: AxiosInstance, projectKey: string)

// Get priorities
async function getPriorities(client: AxiosInstance)

// Get create metadata for validation
async function getCreateMetadata(client: AxiosInstance, projectKey: string, issueTypeId: string)

// Validate issue fields before creation
function validateIssueFields(fields: object, metadata: object)

// Build issue update payload
function buildUpdatePayload(updates: object)

// Build fields object with proper format
function buildFieldsObject(fields: object)
```

---

## Phase 2: Agile/Scrum Tools (v1.2.0)

**Timeline**: Week 3-5  
**Risk Level**: Medium  
**Dependencies**: Phase 1 complete

### Sub-Phase 2.1: Board Management

**Tools**:
- `jira_get_boards` - List all boards
- `jira_get_board` - Get single board details
- `jira_get_board_configuration` - Get board config

**API Base**: `/rest/agile/1.0/board`

### Sub-Phase 2.2: Sprint Management

**Tools**:
- `jira_get_sprints` - List sprints for board
- `jira_get_sprint` - Get single sprint
- `jira_create_sprint` - Create new sprint
- `jira_update_sprint` - Update sprint details
- `jira_start_sprint` - Start a future sprint
- `jira_complete_sprint` - Complete active sprint

**API Base**: `/rest/agile/1.0/sprint`

### Sub-Phase 2.3: Sprint Issue Operations

**Tools**:
- `jira_get_sprint_issues` - Get issues in sprint
- `jira_move_to_sprint` - Move issues to sprint
- `jira_move_to_backlog` - Move issues to backlog

### Sub-Phase 2.4: Backlog Management

**Tools**:
- `jira_get_backlog` - Get backlog issues
- `jira_rank_issues` - Reorder issues

---

## Phase 3: Issue Relationships (v1.3.0)

**Timeline**: Week 6-7  
**Risk Level**: Low  
**Dependencies**: Phase 1 complete

### Sub-Phase 3.1: Issue Links

**Tools**:
- `jira_get_link_types` - Available link types
- `jira_link_issues` - Create link between issues
- `jira_unlink_issues` - Remove link

### Sub-Phase 3.2: Watchers

**Tools**:
- `jira_get_watchers` - Get issue watchers
- `jira_add_watcher` - Add watcher
- `jira_remove_watcher` - Remove watcher

### Sub-Phase 3.3: Votes

**Tools**:
- `jira_get_votes` - Get issue votes
- `jira_add_vote` - Vote for issue
- `jira_remove_vote` - Remove vote

---

## Phase 4: Project Configuration (v1.4.0)

**Timeline**: Week 8-9  
**Risk Level**: Low  
**Dependencies**: None

### Sub-Phase 4.1: Issue Types & Priorities

**Tools**:
- `jira_get_issue_types` - All issue types
- `jira_get_project_issue_types` - Project-specific types
- `jira_get_priorities` - All priorities

### Sub-Phase 4.2: Components & Versions

**Tools**:
- `jira_get_components` - Project components
- `jira_get_versions` - Project versions
- `jira_get_statuses` - Available statuses

---

## Phase 5: User Management (v1.5.0)

**Timeline**: Week 10  
**Risk Level**: Low  
**Dependencies**: None

### Sub-Phase 5.1: User Search

**Tools**:
- `jira_search_users` - Search users by query
- `jira_get_assignable_users` - Users assignable to project/issue

### Sub-Phase 5.2: User Details

**Tools**:
- `jira_get_user` - Get user details by accountId

---

## Phase 6: History & Changelog (v1.6.0)

**Timeline**: Week 11  
**Risk Level**: Low  
**Dependencies**: Phase 1 complete

**Tools**:
- `jira_get_changelog` - Issue change history
- `jira_get_changelogs_bulk` - Bulk fetch changelogs

---

## Phase 7: Epic Management (v1.7.0)

**Timeline**: Week 12-13  
**Risk Level**: Medium  
**Dependencies**: Phase 2 complete

**Tools**:
- `jira_get_epics` - List epics for board
- `jira_get_epic` - Single epic details
- `jira_get_epic_issues` - Issues in epic
- `jira_move_to_epic` - Add issues to epic
- `jira_remove_from_epic` - Remove from epic

---

## Phase 8: Attachments (v1.8.0)

**Timeline**: Week 14-15  
**Risk Level**: High (file handling)  
**Dependencies**: Phase 1 complete

**Tools**:
- `jira_get_attachments` - List issue attachments
- `jira_add_attachment` - Upload file
- `jira_delete_attachment` - Remove attachment

---

## Risk Mitigation Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| API Rate Limiting | Medium | High | Implement exponential backoff |
| Breaking Changes | Low | High | Comprehensive test suite |
| Permission Errors | High | Low | Clear error messages |
| OAuth Token Expiry | Medium | Medium | Auto-refresh logic (exists) |
| Large Payload Errors | Low | Medium | Size validation |
| Concurrent Modifications | Medium | Low | Handle 409 conflicts |

---

## Testing Checklist

### Pre-Release Checklist

- [ ] All new tools have input validation
- [ ] Error handling covers all API error codes
- [ ] Existing tools still function correctly
- [ ] OAuth and Basic Auth both work
- [ ] Rate limiting handled gracefully
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] Version bumped appropriately
- [ ] Git tag created

### Manual Test Scenarios

1. **Happy Path**: Create issue → Update → Transition → Add comment → Resolve
2. **Error Path**: Invalid inputs, permission denied, not found
3. **Workflow Path**: Get transitions → Select → Transition with fields
4. **Agile Path**: Get board → Get sprint → Move issues → Complete sprint
5. **Bulk Path**: Search issues → Bulk operations (future)

---

## Version Changelog Plan

### v1.1.0 - Core Issue CRUD
- Added: `jira_create_issue`
- Added: `jira_update_issue`
- Added: `jira_delete_issue`
- Added: `jira_assign_issue`
- Added: `jira_get_transitions`
- Added: `jira_transition_issue`

### v1.2.0 - Agile Tools
- Added: Board management tools
- Added: Sprint management tools
- Added: Backlog operations

### v1.3.0 - Relationships
- Added: Issue linking tools
- Added: Watcher tools
- Added: Vote tools

---

## Getting Started

1. Review this plan
2. Set up test Jira project
3. Implement Phase 1.1
4. Test thoroughly
5. Commit and document
6. Proceed to next sub-phase

---

*Document Version: 1.0*  
*Created: February 2026*  
*Author: Jira Admin / Node.js Developer*

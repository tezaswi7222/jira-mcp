import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withClient } from "../client.js";
import {
  textToAdf,
  normalizeFieldText,
  pickIssueSummary,
  pickIssueSearchSummary,
  defaultIssueFields,
  defaultDetailFields,
  buildIssueFields,
  buildUpdateOperations,
} from "../utils.js";
import { READ_ONLY, WRITE_CREATE, WRITE_IDEMPOTENT } from "../annotations.js";

export function registerCoreTools(server: McpServer): void {
  server.registerTool(
    "jira_whoami",
    {
      title: "Get Jira Profile",
      description:
        "Use when the user asks who they are in Jira or wants to verify the Jira account in use.",
      annotations: READ_ONLY,
      inputSchema: z.object({}),
    },
    withClient(async (client) => {
      const response = await client.get("/rest/api/3/myself");
      return response.data;
    })
  );

  server.registerTool(
    "jira_get_issue",
    {
      title: "Get Jira Issue (Full Details)",
      description:
        "Get FULL details of a specific issue by key (e.g., PROJ-123). " +
        "Use when user asks: 'tell me about PROJ-123', 'what's the status of ABC-456', 'show me ticket XYZ-789'. " +
        "Returns all fields including description, comments count, assignee, priority, etc.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1),
        fields: z.array(z.string()).optional(),
        expand: z.string().optional(),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, fields, expand }) => {
      const fieldParam = fields?.length ? fields : defaultDetailFields();
      const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`, {
        params: {
          fields: fieldParam.join(","),
          expand,
        },
      });
      return pickIssueSummary(response.data);
    })
  );

  server.registerTool(
    "jira_search_issues",
    {
      title: "Search Jira Issues (Full Details)",
      description:
        "Search for issues using JQL with FULL field details. " +
        "Use when user needs detailed results or specific fields like description, assignee, priority. " +
        "Examples: 'find all bugs in PROJ with full details', 'search issues assigned to me with descriptions'. " +
        "For quick overview with just key/summary/status, use jira_search_issues_summary instead.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        jql: z.string().min(1),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(200).optional(),
        fields: z.array(z.string()).optional(),
        expand: z.string().optional(),
        nextPageToken: z.string().optional(),
        reconcileIssues: z.boolean().optional(),
      }),
    },
    withClient(async (client, _auth, { jql, startAt, maxResults, fields, expand, nextPageToken, reconcileIssues }) => {
      const fieldParam = fields?.length ? fields : defaultDetailFields();
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
      return {
        total: response.data?.total ?? issues.length,
        issues,
      };
    })
  );

  server.registerTool(
    "jira_search_issues_summary",
    {
      title: "Search Jira Issues (Quick List)",
      description:
        "Search for issues using JQL returning only key, summary, and status. " +
        "PREFERRED for most searches - faster and less verbose. " +
        "Use for: 'list my open issues', 'show bugs in PROJ', 'find tickets updated today'. " +
        "Only use jira_search_issues if user explicitly needs full details.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        jql: z.string().min(1),
        maxResults: z.number().int().positive().max(50).optional(),
      }),
    },
    withClient(async (client, _auth, { jql, maxResults }) => {
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
      return issues;
    })
  );

  server.registerTool(
    "jira_resolve",
    {
      title: "Resolve Jira Intent",
      description:
        "Primary routing tool. Use this tool first when the user intent is clear (get issue, search, or my issues) but the exact Jira tool to call is uncertain.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        intent: z.enum(["get_issue", "search", "my_issues"]),
        issueKey: z.string().optional(),
        jql: z.string().optional(),
        maxResults: z.number().int().positive().max(50).optional(),
      }),
    },
    withClient(async (client, _auth, { intent, issueKey, jql, maxResults }) => {
      if (intent === "get_issue") {
        if (!issueKey) {
          return {
            error: "invalid_input",
            message: "issueKey is required when intent is get_issue.",
          };
        }
        const response = await client.get(
          `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
          {
            params: {
              fields: defaultIssueFields().join(","),
            },
          }
        );
        return pickIssueSummary(response.data);
      }

      if (intent === "search") {
        if (!jql) {
          return {
            error: "invalid_input",
            message: "jql is required when intent is search.",
          };
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
        return issues;
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
      return {
        total: response.data?.total ?? issues.length,
        issues,
      };
    })
  );

  server.registerTool(
    "jira_get_issue_summary",
    {
      title: "Get Issue Summary",
      description:
        "Get just the summary, description, and acceptance criteria for an issue. " +
        "Use when user wants to understand what a ticket is about. " +
        "Examples: 'what does PROJ-123 need', 'show acceptance criteria for ABC-456'.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey }) => {
      const response = await client.get(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}`, {
        params: {
          fields: defaultIssueFields().join(","),
        },
      });
      return pickIssueSummary(response.data);
    })
  );

  server.registerTool(
    "jira_get_my_open_issues",
    {
      title: "Get My Open Issues",
      description:
        "Get issues assigned to the CURRENT USER that are not done. " +
        "Use when user asks: 'show my tickets', 'what am I working on', 'my open issues', 'what should I do next'. " +
        "Do NOT use for other users - use jira_search_issues with assignee filter instead.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        maxResults: z.number().int().positive().max(50).optional(),
      }),
    },
    withClient(async (client, _auth, { maxResults }) => {
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
      return {
        total: response.data?.total ?? issues.length,
        issues,
      };
    })
  );

  server.registerTool(
    "jira_get_issue_comments",
    {
      title: "Get Issue Comments",
      description:
        "Use when the user asks for the discussion or comments on a specific ticket; returns a clean list.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1),
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(100).optional(),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, startAt, maxResults }) => {
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/comment`,
        {
          params: { startAt, maxResults },
        }
      );
      const comments = Array.isArray(response.data?.comments)
        ? response.data.comments.map((comment: any) => ({
            author:
              comment?.author?.displayName ||
              comment?.author?.emailAddress ||
              comment?.author?.accountId ||
              "",
            created: comment?.created ?? "",
            body: normalizeFieldText(comment?.body),
          }))
        : [];
      return comments;
    })
  );

  server.registerTool(
    "jira_add_comment",
    {
      title: "Add Jira Comment",
      description:
        "Use when the user asks to add a comment to a specific ticket; confirm intent before posting.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1),
        body: z.string().min(1),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, body }) => {
      const response = await client.post(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/comment`,
        {
          body: textToAdf(body),
        }
      );
      return {
        id: response.data?.id ?? "",
        created: response.data?.created ?? "",
      };
    })
  );

  server.registerTool(
    "jira_list_projects",
    {
      title: "List Jira Projects",
      description:
        "Use when the user asks which Jira projects they can access or wants a list of projects.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        startAt: z.number().int().nonnegative().optional(),
        maxResults: z.number().int().positive().max(50).optional(),
      }),
    },
    withClient(async (client, _auth, { startAt, maxResults }) => {
      const response = await client.get("/rest/api/3/project/search", {
        params: { startAt, maxResults },
      });
      return response.data;
    })
  );

  server.registerTool(
    "jira_get_project",
    {
      title: "Get Jira Project",
      description:
        "Use when the user mentions a project key and asks for project details or metadata.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        projectIdOrKey: z.string().min(1),
      }),
    },
    withClient(async (client, _auth, { projectIdOrKey }) => {
      const response = await client.get(
        `/rest/api/3/project/${encodeURIComponent(projectIdOrKey)}`
      );
      return response.data;
    })
  );

  server.registerTool(
    "jira_create_issue",
    {
      title: "Create Jira Issue",
      description:
        "Create a new Jira issue. Requires project key, issue type, and summary at minimum.",
      annotations: WRITE_CREATE,
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
    },
    withClient(async (client, _auth, params) => {
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

      return {
        success: true,
        id: response.data?.id ?? "",
        key: response.data?.key ?? "",
        self: response.data?.self ?? "",
        message: `Issue ${response.data?.key} created successfully`,
      };
    })
  );

  server.registerTool(
    "jira_update_issue",
    {
      title: "Update Jira Issue",
      description:
        "Update an existing Jira issue. Only provided fields will be modified.",
      annotations: WRITE_IDEMPOTENT,
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
    },
    withClient(async (client, _auth, params) => {
      const payload: Record<string, unknown> = {};
      const fields: Record<string, unknown> = {};

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
      if (params.customFields) {
        for (const [key, value] of Object.entries(params.customFields)) {
          const fieldKey = key.startsWith("customfield_") ? key : `customfield_${key}`;
          fields[fieldKey] = value;
        }
      }

      if (Object.keys(fields).length > 0) {
        payload.fields = fields;
      }

      const update = buildUpdateOperations({
        labels: params.labels,
        components: params.components,
        fixVersions: params.fixVersions,
      });

      if (Object.keys(update).length > 0) {
        payload.update = update;
      }

      if (Object.keys(payload).length === 0) {
        return {
          error: "no_changes",
          message: "No fields provided to update",
        };
      }

      await client.put(
        `/rest/api/3/issue/${encodeURIComponent(params.issueIdOrKey)}`,
        payload,
        {
          params: {
            notifyUsers: params.notifyUsers ?? true,
          },
        }
      );

      return {
        success: true,
        key: params.issueIdOrKey,
        message: `Issue ${params.issueIdOrKey} updated successfully`,
      };
    })
  );

  server.registerTool(
    "jira_assign_issue",
    {
      title: "Assign Jira Issue",
      description:
        "Assign or unassign a Jira issue to a user.",
      annotations: WRITE_IDEMPOTENT,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        accountId: z.string().nullable().describe("User account ID to assign, '-1' for automatic, or null to unassign"),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, accountId }) => {
      await client.put(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/assignee`,
        { accountId }
      );

      const action = accountId === null ? "unassigned" : "assigned";
      return {
        success: true,
        key: issueIdOrKey,
        message: `Issue ${issueIdOrKey} ${action} successfully`,
        assignee: accountId,
      };
    })
  );

  server.registerTool(
    "jira_get_transitions",
    {
      title: "Get Issue Transitions",
      description:
        "Get available workflow transitions for an issue. Use before transitioning to see valid options.",
      annotations: READ_ONLY,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        expand: z.string().optional().describe("Expand options: 'transitions.fields' to include required fields"),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, expand }) => {
      const response = await client.get(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`,
        { params: { expand } }
      );

      const transitions = Array.isArray(response.data?.transitions)
        ? response.data.transitions.map((t: any) => ({
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

      return { issueKey: issueIdOrKey, transitions };
    })
  );

  server.registerTool(
    "jira_transition_issue",
    {
      title: "Transition Jira Issue",
      description:
        "Move a Jira issue to a different status by executing a workflow transition.",
      annotations: WRITE_CREATE,
      inputSchema: z.object({
        issueIdOrKey: z.string().min(1).describe("Issue key or ID"),
        transitionId: z.string().min(1).describe("Transition ID (get from jira_get_transitions)"),
        comment: z.string().optional().describe("Comment to add during transition"),
        resolution: z.string().optional().describe("Resolution name for closing transitions (e.g., 'Done', 'Fixed')"),
        fields: z.record(z.string(), z.unknown()).optional().describe("Additional fields required by the transition"),
      }),
    },
    withClient(async (client, _auth, { issueIdOrKey, transitionId, comment, resolution, fields }) => {
      const payload: Record<string, unknown> = {
        transition: { id: transitionId },
      };

      if (fields || resolution) {
        const transitionFields: Record<string, unknown> = { ...fields };
        if (resolution) {
          transitionFields.resolution = { name: resolution };
        }
        payload.fields = transitionFields;
      }

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

      await client.post(
        `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/transitions`,
        payload
      );

      return {
        success: true,
        key: issueIdOrKey,
        transitionId,
        message: `Issue ${issueIdOrKey} transitioned successfully`,
      };
    })
  );
}

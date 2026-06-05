import { AxiosError } from "axios";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ============ Constants ============

export const ACCEPTANCE_FIELD = (process.env.JIRA_ACCEPTANCE_CRITERIA_FIELD || "").trim();

// ============ ADF Utilities ============

export type AdfNode = {
  type?: string;
  text?: string;
  content?: Array<AdfNode>;
};

export function adfToText(node: AdfNode | AdfNode[] | null | undefined): string {
  if (!node) return "";
  if (Array.isArray(node)) {
    return node.map(adfToText).filter(Boolean).join("\n").trim();
  }
  if (typeof node.text === "string") {
    return node.text;
  }
  if (Array.isArray(node.content)) {
    const parts = node.content.map(adfToText).filter(Boolean);
    return parts.join(node.type === "paragraph" ? "\n" : " ").trim();
  }
  return "";
}

export function normalizeFieldText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const maybeAdf = value as AdfNode;
    const text = adfToText(maybeAdf);
    if (text) return text;
  }
  return "";
}

export function textToAdf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    ],
  };
}

// ============ Issue Helpers ============

// Compact representations of the nested objects Jira returns for common
// fields, so requested fields surface as LLM-friendly scalars instead of
// the full verbose REST shapes (avatars, icon URLs, status categories, ...).
function compactNamed(value: any): string | null {
  return value?.name ?? null;
}

function compactUser(value: any): string | null {
  return value?.displayName ?? value?.emailAddress ?? value?.accountId ?? null;
}

function toNameArray(value: any): Array<string> {
  return Array.isArray(value)
    ? value.map((entry) => entry?.name ?? "").filter(Boolean)
    : [];
}

export function pickIssueSummary(issue: any) {
  const fields = issue?.fields || {};

  // Pass through exactly the fields Jira returned (honours the caller's
  // `fields` param). Fields that were not requested/returned are NOT
  // fabricated into the output.
  const out: Record<string, unknown> = { ...fields };

  // Render the description ADF to plain text, only when it was returned.
  if ("description" in fields) {
    out.description = normalizeFieldText(fields.description);
  }

  // Surface the configured acceptance-criteria custom field under a friendly
  // key (and drop the raw custom-field id), only when it was returned.
  if (ACCEPTANCE_FIELD && ACCEPTANCE_FIELD in fields) {
    out.acceptanceCriteria = normalizeFieldText(fields[ACCEPTANCE_FIELD]) || null;
    delete out[ACCEPTANCE_FIELD];
  }

  // Normalize common nested objects into compact values, only when present.
  if ("status" in fields) out.status = compactNamed(fields.status);
  if ("priority" in fields) out.priority = compactNamed(fields.priority);
  if ("issuetype" in fields) out.issuetype = compactNamed(fields.issuetype);
  if ("resolution" in fields) out.resolution = compactNamed(fields.resolution);
  if ("assignee" in fields) out.assignee = compactUser(fields.assignee);
  if ("reporter" in fields) out.reporter = compactUser(fields.reporter);
  if ("creator" in fields) out.creator = compactUser(fields.creator);
  if ("project" in fields) out.project = (fields.project as any)?.key ?? null;
  if ("parent" in fields) out.parent = (fields.parent as any)?.key ?? null;
  if ("components" in fields) out.components = toNameArray(fields.components);
  if ("fixVersions" in fields) out.fixVersions = toNameArray(fields.fixVersions);
  if ("versions" in fields) out.versions = toNameArray(fields.versions);

  // The issue key is identity, not a field — Jira always returns it.
  out.key = issue?.key ?? "";

  return out;
}

export function pickIssueSearchSummary(issue: any) {
  const fields = issue?.fields || {};
  return {
    key: issue?.key ?? "",
    summary: fields.summary ?? "",
    status: fields.status?.name ?? "",
  };
}

// Lean default for summary-shaped tools (jira_get_issue_summary, etc.).
export function defaultIssueFields() {
  const base = ["summary", "description"];
  if (ACCEPTANCE_FIELD) base.push(ACCEPTANCE_FIELD);
  return base;
}

// Broad default for the "Full Details" tools (jira_get_issue,
// jira_search_issues) so a fieldless call returns the fields callers
// actually need instead of just summary + description.
export function defaultDetailFields() {
  const base = [
    "summary",
    "description",
    "status",
    "priority",
    "issuetype",
    "assignee",
    "reporter",
    "labels",
    "components",
    "fixVersions",
    "parent",
    "project",
    "resolution",
    "created",
    "updated",
    "duedate",
  ];
  if (ACCEPTANCE_FIELD) base.push(ACCEPTANCE_FIELD);
  return base;
}

// ============ Error Handling ============

export function errorToMessage(error: unknown) {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data = error.response?.data;
    const detail = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return `Jira API error${status ? ` (${status})` : ""}: ${detail || error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

export function errorToResult(error: unknown) {
  if (error instanceof Error && error.message === "MISSING_AUTH") {
    return {
      error: "unauthorized",
      message: "Jira credentials are missing. Provide credentials explicitly to authenticate.",
    };
  }
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    if (status === 401) {
      return {
        error: "unauthorized",
        message: "Jira credentials are missing or invalid. If using OAuth, the token may have expired.",
      };
    }
    if (status === 403) {
      return {
        error: "forbidden",
        message: "You do not have permission to access this Jira resource.",
      };
    }
    if (status === 404) {
      return {
        error: "not_found",
        message: "The Jira resource does not exist or is not visible.",
      };
    }
    if (status === 429) {
      return {
        error: "rate_limited",
        message: "Jira rate limit exceeded. Please retry later.",
      };
    }
    if (status && status >= 500) {
      return {
        error: "server_error",
        message: "Jira server error. Please retry later.",
      };
    }
    return {
      error: "jira_error",
      message: errorToMessage(error),
    };
  }
  if (error instanceof Error) {
    return {
      error: "unknown",
      message: error.message,
    };
  }
  return {
    error: "unknown",
    message: "Unknown error",
  };
}

export function textResult(value: unknown): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

// ============ Issue Field Builders ============

export function buildIssueFields(params: {
  projectKey?: string;
  issueType?: string;
  summary?: string;
  description?: string;
  assignee?: string | null;
  reporter?: string;
  priority?: string;
  labels?: Array<string>;
  components?: Array<string>;
  fixVersions?: Array<string>;
  affectsVersions?: Array<string>;
  dueDate?: string | null;
  parentKey?: string;
  environment?: string;
  originalEstimate?: string;
  remainingEstimate?: string;
  customFields?: Record<string, unknown>;
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (params.projectKey) {
    fields.project = { key: params.projectKey };
  }

  if (params.issueType) {
    fields.issuetype = /^\d+$/.test(params.issueType)
      ? { id: params.issueType }
      : { name: params.issueType };
  }

  if (params.summary !== undefined) {
    fields.summary = params.summary;
  }

  if (params.description !== undefined) {
    fields.description = params.description ? textToAdf(params.description) : null;
  }

  if (params.assignee !== undefined) {
    fields.assignee = params.assignee === null ? null : { accountId: params.assignee };
  }

  if (params.reporter) {
    fields.reporter = { accountId: params.reporter };
  }

  if (params.priority) {
    fields.priority = /^\d+$/.test(params.priority)
      ? { id: params.priority }
      : { name: params.priority };
  }

  if (params.labels && params.labels.length > 0) {
    fields.labels = params.labels;
  }

  if (params.components && params.components.length > 0) {
    fields.components = params.components.map(c =>
      /^\d+$/.test(c) ? { id: c } : { name: c }
    );
  }

  if (params.fixVersions && params.fixVersions.length > 0) {
    fields.fixVersions = params.fixVersions.map(v =>
      /^\d+$/.test(v) ? { id: v } : { name: v }
    );
  }

  if (params.affectsVersions && params.affectsVersions.length > 0) {
    fields.versions = params.affectsVersions.map(v =>
      /^\d+$/.test(v) ? { id: v } : { name: v }
    );
  }

  if (params.dueDate !== undefined) {
    fields.duedate = params.dueDate;
  }

  if (params.parentKey) {
    fields.parent = { key: params.parentKey };
  }

  if (params.environment) {
    fields.environment = textToAdf(params.environment);
  }

  if (params.originalEstimate || params.remainingEstimate) {
    fields.timetracking = {};
    if (params.originalEstimate) {
      (fields.timetracking as Record<string, string>).originalEstimate = params.originalEstimate;
    }
    if (params.remainingEstimate) {
      (fields.timetracking as Record<string, string>).remainingEstimate = params.remainingEstimate;
    }
  }

  if (params.customFields) {
    for (const [key, value] of Object.entries(params.customFields)) {
      const fieldKey = key.startsWith("customfield_") ? key : `customfield_${key}`;
      if (typeof value === "string" && value.length > 0) {
        fields[fieldKey] = value;
      } else {
        fields[fieldKey] = value;
      }
    }
  }

  return fields;
}

export function buildUpdateOperations(params: {
  labels?: { add?: Array<string>; remove?: Array<string>; set?: Array<string> };
  components?: { add?: Array<string>; remove?: Array<string>; set?: Array<string> };
  fixVersions?: { add?: Array<string>; remove?: Array<string>; set?: Array<string> };
  affectsVersions?: { add?: Array<string>; remove?: Array<string>; set?: Array<string> };
}): Record<string, Array<Record<string, unknown>>> {
  const update: Record<string, Array<Record<string, unknown>>> = {};

  if (params.labels) {
    const labelsArr: Array<Record<string, unknown>> = [];
    if (params.labels.add) {
      params.labels.add.forEach(l => labelsArr.push({ add: l }));
    }
    if (params.labels.remove) {
      params.labels.remove.forEach(l => labelsArr.push({ remove: l }));
    }
    if (params.labels.set) {
      labelsArr.push({ set: params.labels.set });
    }
    update.labels = labelsArr;
  }

  if (params.components) {
    const componentsArr: Array<Record<string, unknown>> = [];
    if (params.components.add) {
      params.components.add.forEach(c =>
        componentsArr.push({ add: /^\d+$/.test(c) ? { id: c } : { name: c } })
      );
    }
    if (params.components.remove) {
      params.components.remove.forEach(c =>
        componentsArr.push({ remove: /^\d+$/.test(c) ? { id: c } : { name: c } })
      );
    }
    if (params.components.set) {
      componentsArr.push({
        set: params.components.set.map(c => (/^\d+$/.test(c) ? { id: c } : { name: c }))
      });
    }
    update.components = componentsArr;
  }

  if (params.fixVersions) {
    const fixVersionsArr: Array<Record<string, unknown>> = [];
    if (params.fixVersions.add) {
      params.fixVersions.add.forEach(v =>
        fixVersionsArr.push({ add: /^\d+$/.test(v) ? { id: v } : { name: v } })
      );
    }
    if (params.fixVersions.remove) {
      params.fixVersions.remove.forEach(v =>
        fixVersionsArr.push({ remove: /^\d+$/.test(v) ? { id: v } : { name: v } })
      );
    }
    if (params.fixVersions.set) {
      fixVersionsArr.push({
        set: params.fixVersions.set.map(v => (/^\d+$/.test(v) ? { id: v } : { name: v }))
      });
    }
    update.fixVersions = fixVersionsArr;
  }

  if (params.affectsVersions) {
    const versionsArr: Array<Record<string, unknown>> = [];
    if (params.affectsVersions.add) {
      params.affectsVersions.add.forEach(v =>
        versionsArr.push({ add: /^\d+$/.test(v) ? { id: v } : { name: v } })
      );
    }
    if (params.affectsVersions.remove) {
      params.affectsVersions.remove.forEach(v =>
        versionsArr.push({ remove: /^\d+$/.test(v) ? { id: v } : { name: v } })
      );
    }
    if (params.affectsVersions.set) {
      versionsArr.push({
        set: params.affectsVersions.set.map(v => (/^\d+$/.test(v) ? { id: v } : { name: v }))
      });
    }
    update.versions = versionsArr;
  }

  return update;
}

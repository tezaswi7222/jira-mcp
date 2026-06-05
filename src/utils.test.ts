import { describe, it, expect } from "vitest";
import {
  adfToText,
  normalizeFieldText,
  textToAdf,
  pickIssueSummary,
  pickIssueSearchSummary,
  defaultIssueFields,
  defaultDetailFields,
  buildIssueFields,
  buildUpdateOperations,
  errorToResult,
  errorToMessage,
  textResult,
} from "./utils.js";
import { normalizeBaseUrl } from "./auth.js";

// ============ ADF Utilities ============

describe("adfToText", () => {
  it("returns empty string for null/undefined", () => {
    expect(adfToText(null)).toBe("");
    expect(adfToText(undefined)).toBe("");
  });

  it("extracts text from simple text node", () => {
    expect(adfToText({ text: "hello" })).toBe("hello");
  });

  it("extracts text from paragraph with content", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    };
    expect(adfToText(adf)).toBe("Hello world");
  });

  it("handles array of nodes", () => {
    const nodes = [
      { text: "first" },
      { text: "second" },
    ];
    expect(adfToText(nodes)).toBe("first\nsecond");
  });

  it("returns empty string for empty content", () => {
    expect(adfToText({ type: "doc", content: [] })).toBe("");
  });
});

describe("normalizeFieldText", () => {
  it("returns strings as-is", () => {
    expect(normalizeFieldText("hello")).toBe("hello");
  });

  it("converts numbers to strings", () => {
    expect(normalizeFieldText(42)).toBe("42");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeFieldText(null)).toBe("");
    expect(normalizeFieldText(undefined)).toBe("");
  });

  it("extracts text from ADF objects", () => {
    const adf = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ text: "test" }] }],
    };
    expect(normalizeFieldText(adf)).toBe("test");
  });
});

describe("textToAdf", () => {
  it("creates valid ADF document", () => {
    const result = textToAdf("Hello");
    expect(result).toEqual({
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
    });
  });
});

// ============ Issue Helpers ============

describe("pickIssueSummary", () => {
  it("extracts key and summary from issue", () => {
    const issue = {
      key: "PROJ-123",
      fields: {
        summary: "Test issue",
        description: null,
      },
    };
    const result = pickIssueSummary(issue) as any;
    expect(result.key).toBe("PROJ-123");
    expect(result.summary).toBe("Test issue");
    expect(result.description).toBe("");
    // No acceptance-criteria field configured/returned -> key omitted, not fabricated.
    expect("acceptanceCriteria" in result).toBe(false);
  });

  it("handles missing fields gracefully", () => {
    const result = pickIssueSummary(null) as any;
    expect(result.key).toBe("");
    // No fields returned -> only the identity key is present.
    expect("summary" in result).toBe(false);
  });

  it("with fields=['labels'] only, returns labels + key and fabricates nothing (issue #2 follow-up)", () => {
    const issue = { key: "PROJ-7", fields: { labels: ["x", "y"] } };
    const result = pickIssueSummary(issue) as any;
    expect(result.labels).toEqual(["x", "y"]);
    expect(result.key).toBe("PROJ-7");
    expect("summary" in result).toBe(false);
    expect("description" in result).toBe(false);
    expect("acceptanceCriteria" in result).toBe(false);
    expect("status" in result).toBe(false);
  });

  it("passes through caller-requested fields (regression: issue #2)", () => {
    const issue = {
      key: "PROJ-123",
      fields: {
        summary: "Test issue",
        labels: ["dod-pending", "q2"],
        status: { name: "Backlog", id: "1", statusCategory: { key: "new" } },
        priority: { name: "High", id: "2" },
        assignee: { displayName: "Ada Lovelace", accountId: "abc" },
      },
    };
    const result = pickIssueSummary(issue) as any;
    expect(result.labels).toEqual(["dod-pending", "q2"]);
    // Nested objects are normalized to compact, LLM-friendly values.
    expect(result.status).toBe("Backlog");
    expect(result.priority).toBe("High");
    expect(result.assignee).toBe("Ada Lovelace");
  });

  it("does not fabricate fields that were not returned", () => {
    const issue = { key: "PROJ-1", fields: { summary: "Only summary" } };
    const result = pickIssueSummary(issue) as any;
    expect("labels" in result).toBe(false);
    expect("status" in result).toBe(false);
  });

  it("normalizes array fields and parent/project keys", () => {
    const issue = {
      key: "PROJ-9",
      fields: {
        summary: "Has refs",
        components: [{ name: "Frontend" }, { name: "API" }],
        fixVersions: [{ name: "1.2.0" }],
        parent: { key: "PROJ-1" },
        project: { key: "PROJ" },
      },
    };
    const result = pickIssueSummary(issue) as any;
    expect(result.components).toEqual(["Frontend", "API"]);
    expect(result.fixVersions).toEqual(["1.2.0"]);
    expect(result.parent).toBe("PROJ-1");
    expect(result.project).toBe("PROJ");
  });
});

describe("pickIssueSearchSummary", () => {
  it("extracts key, summary, status", () => {
    const issue = {
      key: "PROJ-1",
      fields: {
        summary: "Test",
        status: { name: "Open" },
      },
    };
    const result = pickIssueSearchSummary(issue);
    expect(result).toEqual({ key: "PROJ-1", summary: "Test", status: "Open" });
  });
});

describe("defaultIssueFields", () => {
  it("includes summary and description", () => {
    const fields = defaultIssueFields();
    expect(fields).toContain("summary");
    expect(fields).toContain("description");
  });
});

describe("defaultDetailFields", () => {
  it("includes the common fields callers need by default", () => {
    const fields = defaultDetailFields();
    for (const f of ["summary", "description", "status", "priority", "labels", "assignee"]) {
      expect(fields).toContain(f);
    }
  });
});

// ============ Error Handling ============

describe("errorToResult", () => {
  it("handles MISSING_AUTH error", () => {
    const result = errorToResult(new Error("MISSING_AUTH"));
    expect(result.error).toBe("unauthorized");
  });

  it("handles unknown errors", () => {
    const result = errorToResult("some string");
    expect(result.error).toBe("unknown");
  });

  it("handles Error objects", () => {
    const result = errorToResult(new Error("something broke"));
    expect(result.error).toBe("unknown");
    expect(result.message).toBe("something broke");
  });
});

describe("textResult", () => {
  it("wraps string in content array", () => {
    const result = textResult("hello");
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect((result.content[0] as any).text).toBe("hello");
  });

  it("JSON-stringifies objects", () => {
    const result = textResult({ foo: "bar" });
    expect(JSON.parse((result.content[0] as any).text)).toEqual({ foo: "bar" });
  });
});

// ============ Field Builders ============

describe("buildIssueFields", () => {
  it("builds project field", () => {
    const fields = buildIssueFields({ projectKey: "PROJ" });
    expect(fields.project).toEqual({ key: "PROJ" });
  });

  it("handles issue type by name", () => {
    const fields = buildIssueFields({ issueType: "Bug" });
    expect(fields.issuetype).toEqual({ name: "Bug" });
  });

  it("handles issue type by ID", () => {
    const fields = buildIssueFields({ issueType: "10001" });
    expect(fields.issuetype).toEqual({ id: "10001" });
  });

  it("converts description to ADF", () => {
    const fields = buildIssueFields({ description: "test desc" });
    expect((fields.description as any).type).toBe("doc");
  });

  it("handles null assignee (unassign)", () => {
    const fields = buildIssueFields({ assignee: null });
    expect(fields.assignee).toBeNull();
  });

  it("handles custom fields", () => {
    const fields = buildIssueFields({
      customFields: { "customfield_10001": "value", "12345": "other" },
    });
    expect(fields["customfield_10001"]).toBe("value");
    expect(fields["customfield_12345"]).toBe("other");
  });
});

describe("buildUpdateOperations", () => {
  it("builds label add operations", () => {
    const ops = buildUpdateOperations({ labels: { add: ["bug", "urgent"] } });
    expect(ops.labels).toEqual([{ add: "bug" }, { add: "urgent" }]);
  });

  it("builds component operations with name/id detection", () => {
    const ops = buildUpdateOperations({
      components: { add: ["Frontend", "10001"] },
    });
    expect(ops.components).toEqual([
      { add: { name: "Frontend" } },
      { add: { id: "10001" } },
    ]);
  });
});

// ============ Auth Helpers ============

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://example.atlassian.net/")).toBe(
      "https://example.atlassian.net"
    );
  });

  it("preserves path", () => {
    expect(normalizeBaseUrl("https://example.com/jira")).toBe(
      "https://example.com/jira"
    );
  });

  it("throws for invalid URLs", () => {
    expect(() => normalizeBaseUrl("not-a-url")).toThrow();
  });
});

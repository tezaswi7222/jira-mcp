import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock the HTTP + auth seams so we exercise the real handler path ---
const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("axios", () => {
  const instance = {
    get: mockGet,
    interceptors: { 
      request: { use: vi.fn() },
      response: { use: vi.fn() } 
    },
  };
  class AxiosError extends Error {
    response?: any;
  }
  return { 
    default: { create: vi.fn(() => instance) },
    AxiosError
  };
});

vi.mock("../auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth.js")>();
  return {
    ...actual,
    getAuthOrThrow: vi.fn(async () => ({
      type: "basic" as const,
      baseUrl: "https://example.atlassian.net",
      email: "me@example.com",
      apiToken: "token",
    })),
  };
});

import { registerCoreTools } from "./core.js";

// Capture the handlers that registerCoreTools registers.
type Handler = (params: any) => Promise<{ content: Array<{ text: string }> }>;
const handlers = new Map<string, Handler>();
const fakeServer = {
  registerTool: (name: string, _def: unknown, handler: Handler) => {
    handlers.set(name, handler);
  },
} as any;

registerCoreTools(fakeServer);

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

beforeEach(() => {
  mockGet.mockReset();
});

describe("jira_get_issue (integration)", () => {
  it("requests caller-specified fields AND returns them (issue #2)", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        key: "PROJ-123",
        fields: {
          summary: "Test issue",
          labels: ["dod-pending", "q2"],
          status: { name: "Backlog", id: "1" },
          priority: { name: "High" },
          assignee: { displayName: "Ada Lovelace", accountId: "abc" },
        },
      },
    });

    const result = await handlers.get("jira_get_issue")!({
      issueIdOrKey: "PROJ-123",
      fields: ["summary", "labels", "status", "priority", "assignee"],
    });

    // 1. The fields the caller asked for were actually sent to Jira.
    const [url, config] = mockGet.mock.calls[0]!;
    expect(url).toBe("/rest/api/3/issue/PROJ-123");
    expect(config.params.fields).toBe("summary,labels,status,priority,assignee");

    // 2. Those fields now appear in the output (the original bug dropped them).
    const out = parse(result);
    expect(out.key).toBe("PROJ-123");
    expect(out.labels).toEqual(["dod-pending", "q2"]);
    expect(out.status).toBe("Backlog");
    expect(out.priority).toBe("High");
    expect(out.assignee).toBe("Ada Lovelace");
  });

  it("with fields=['labels'] returns labels + key only, no fabricated keys", async () => {
    mockGet.mockResolvedValueOnce({
      data: { key: "PROJ-7", fields: { labels: ["a", "b"] } },
    });

    const result = await handlers.get("jira_get_issue")!({
      issueIdOrKey: "PROJ-7",
      fields: ["labels"],
    });

    expect(mockGet.mock.calls[0]![1].params.fields).toBe("labels");

    const out = parse(result);
    expect(out.labels).toEqual(["a", "b"]);
    expect(out.key).toBe("PROJ-7");
    expect("summary" in out).toBe(false);
    expect("description" in out).toBe(false);
    expect("acceptanceCriteria" in out).toBe(false);
    expect("status" in out).toBe(false);
  });

  it("requests a broad default field set when fields are omitted", async () => {
    mockGet.mockResolvedValueOnce({
      data: { key: "PROJ-1", fields: { summary: "S", labels: [] } },
    });

    await handlers.get("jira_get_issue")!({ issueIdOrKey: "PROJ-1" });

    const requested = (mockGet.mock.calls[0]![1].params.fields as string).split(",");
    expect(requested).toContain("labels");
    expect(requested).toContain("status");
    expect(requested).toContain("assignee");
    expect(requested).toContain("priority");
  });
});

describe("jira_search_issues (integration)", () => {
  it("maps requested fields across every issue in the result", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        total: 2,
        issues: [
          { key: "PROJ-1", fields: { summary: "One", labels: ["a"], status: { name: "Open" } } },
          { key: "PROJ-2", fields: { summary: "Two", labels: ["b"], status: { name: "Done" } } },
        ],
      },
    });

    const result = await handlers.get("jira_search_issues")!({
      jql: "project = PROJ",
      fields: ["summary", "labels", "status"],
    });

    const config = mockGet.mock.calls[0]![1];
    expect(config.params.jql).toBe("project = PROJ");
    expect(config.params.fields).toBe("summary,labels,status");

    const out = parse(result);
    expect(out.total).toBe(2);
    expect(out.issues[0].labels).toEqual(["a"]);
    expect(out.issues[0].status).toBe("Open");
    expect(out.issues[1].labels).toEqual(["b"]);
    expect(out.issues[1].status).toBe("Done");
  });
});

describe("jira_search_issues_summary (integration)", () => {
  it("stays lean — only key/summary/status, ignores extra fields", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        issues: [
          {
            key: "PROJ-1",
            fields: { summary: "One", status: { name: "Open" }, labels: ["x"] },
          },
        ],
      },
    });

    const result = await handlers.get("jira_search_issues_summary")!({ jql: "project = PROJ" });

    // Summary tool must keep requesting only summary + status.
    expect(mockGet.mock.calls[0]![1].params.fields).toBe("summary,status");

    const out = parse(result);
    expect(out).toEqual([{ key: "PROJ-1", summary: "One", status: "Open" }]);
  });
});

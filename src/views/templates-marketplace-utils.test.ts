import { describe, expect, it } from "vitest";
import {
  filterAndSortTemplates,
  type TemplateRecord,
} from "./templates-marketplace-utils";

const promptsFixture: TemplateRecord[] = [
  {
    id: "p-1",
    title: "Product Brainstorm Sprint",
    description: "Rapid ideation for product teams",
    script: "Run a collaborative brainstorm with strategist and skeptic agents.",
    user_id: "user-123",
    group_id: "group-product",
    is_demo: false,
    created_at: "2026-01-10T10:00:00.000Z",
    updated_at: "2026-01-10T10:00:00.000Z",
  },
  {
    id: "p-2",
    title: "Investor Debate Pack",
    description: "A structured model debate for investor updates.",
    script: "Debate the upside and downside for each strategic option.",
    user_id: "user-999",
    group_id: "group-finance",
    is_demo: true,
    created_at: "2026-01-12T10:00:00.000Z",
    updated_at: "2026-01-12T10:00:00.000Z",
  },
];

describe("filterAndSortTemplates", () => {
  it("narrows templates by search query", () => {
    const result = filterAndSortTemplates(promptsFixture, {
      selectedGroup: "all",
      searchQuery: "brainstorm",
      typeFilter: "all",
      sort: "newest",
      userId: "user-123",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("p-1");
  });
});


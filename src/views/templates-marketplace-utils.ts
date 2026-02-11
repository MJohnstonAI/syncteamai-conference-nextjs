import type { Prompt } from "@/hooks/usePrompts";

export type TemplateRecord = Prompt & {
  image_url?: string | null;
  shared_with_count?: number | null;
  last_used_at?: string | null;
};

export type TemplateTypeFilter = "all" | "demo" | "mine" | "shared";
export type TemplateSort = "newest" | "oldest";

type FilterOptions = {
  selectedGroup: string;
  searchQuery: string;
  typeFilter: TemplateTypeFilter;
  sort: TemplateSort;
  userId?: string | null;
};

const getSearchHaystack = (prompt: TemplateRecord) =>
  [prompt.title, prompt.description ?? "", prompt.script].join(" ").toLowerCase();

export const supportsSharedTemplates = (prompts: TemplateRecord[], userId?: string | null) =>
  Boolean(
    userId &&
      prompts.some(
        (prompt) =>
          !prompt.is_demo &&
          Boolean(prompt.user_id) &&
          prompt.user_id !== userId
      )
  );

export const filterAndSortTemplates = (
  prompts: TemplateRecord[],
  options: FilterOptions
) => {
  const { selectedGroup, searchQuery, typeFilter, sort, userId } = options;
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filtered = prompts.filter((prompt) => {
    if (selectedGroup !== "all" && prompt.group_id !== selectedGroup) {
      return false;
    }

    if (normalizedSearch && !getSearchHaystack(prompt).includes(normalizedSearch)) {
      return false;
    }

    if (typeFilter === "demo") {
      return prompt.is_demo;
    }

    if (typeFilter === "mine") {
      return Boolean(userId && prompt.user_id === userId && !prompt.is_demo);
    }

    if (typeFilter === "shared") {
      return Boolean(
        userId &&
          !prompt.is_demo &&
          Boolean(prompt.user_id) &&
          prompt.user_id !== userId
      );
    }

    return true;
  });

  return [...filtered].sort((left, right) => {
    const leftValue = Date.parse(left.created_at);
    const rightValue = Date.parse(right.created_at);
    const fallbackLeft = Number.isFinite(leftValue) ? leftValue : 0;
    const fallbackRight = Number.isFinite(rightValue) ? rightValue : 0;
    return sort === "oldest"
      ? fallbackLeft - fallbackRight
      : fallbackRight - fallbackLeft;
  });
};


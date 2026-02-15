import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestUser } from "@/lib/server/supabase-server";
import { getAgentMeta } from "@/lib/agents";
import type { ThreadResponse } from "@/lib/thread/types";

export const runtime = "nodejs";

const querySchema = z.object({
  conversationId: z.string().uuid(),
  round: z.string().uuid().optional(),
  agent: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  sort: z.enum(["new", "top"]).optional(),
  limit: z.coerce.number().int().min(20).max(400).optional(),
  cursor: z.string().max(512).optional(),
});

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

type MessageRow = {
  id: string;
  conversation_id: string;
  parent_message_id: string | null;
  thread_root_id: string | null;
  round_id: string | null;
  depth: number;
  role: "user" | "assistant" | "system";
  content: string;
  avatar_id: string | null;
  created_at: string;
  score: number;
  is_highlight: boolean;
  sort_key: string;
};

type TopRootRow = {
  id: string;
  score: number;
  created_at: string;
  round_id: string | null;
};

type FacetRow = {
  facet_type: "round" | "agent";
  facet_id: string;
  created_at: string | null;
  message_count: number | string;
};

type TopCursor = {
  score: number;
  createdAt: string;
  id: string;
};

const MESSAGE_SELECT =
  "id, conversation_id, parent_message_id, thread_root_id, round_id, depth, role, content, avatar_id, created_at, score, is_highlight, sort_key";

const coerceCount = (value: number | string | null | undefined): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.trunc(parsed);
};

const decodeTopCursor = (raw: string | undefined): TopCursor | null => {
  if (!raw) return null;

  const [scoreRaw, createdAtRaw, idRaw] = raw.split("|");
  if (!scoreRaw || !createdAtRaw || !idRaw) return null;

  const score = Number(scoreRaw);
  if (!Number.isFinite(score)) return null;

  if (!z.string().datetime({ offset: true }).safeParse(createdAtRaw).success) {
    return null;
  }

  if (!z.string().uuid().safeParse(idRaw).success) {
    return null;
  }

  return { score, createdAt: createdAtRaw, id: idRaw };
};

const encodeTopCursor = (row: TopRootRow): string =>
  `${row.score}|${row.created_at}|${row.id}`;

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRequestUser(request);
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      conversationId: url.searchParams.get("conversationId"),
      round: url.searchParams.get("round") ?? undefined,
      agent: url.searchParams.get("agent") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });
    const pageLimit = parsed.limit ?? 160;

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, title, script, created_at")
      .eq("id", parsed.conversationId)
      .maybeSingle();

    if (conversationError) {
      throw new Error(conversationError.message);
    }

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const isTopSort = parsed.sort === "top";
    let orderedRows: MessageRow[] = [];
    let hasMore = false;
    let nextCursor: string | null = null;

    if (isTopSort) {
      const topCursor = decodeTopCursor(parsed.cursor);
      if (parsed.cursor && !topCursor) {
        return NextResponse.json({ error: "Invalid top cursor." }, { status: 400 });
      }

      let topRootsQuery = supabase
        .from("messages")
        .select("id, score, created_at, round_id")
        .eq("conversation_id", parsed.conversationId)
        .eq("role", "user")
        .is("parent_message_id", null);

      if (parsed.round) {
        topRootsQuery = topRootsQuery.eq("round_id", parsed.round);
      }

      if (topCursor) {
        topRootsQuery = topRootsQuery.or(
          [
            `score.lt.${topCursor.score}`,
            `and(score.eq.${topCursor.score},created_at.lt.${topCursor.createdAt})`,
            `and(score.eq.${topCursor.score},created_at.eq.${topCursor.createdAt},id.lt.${topCursor.id})`,
          ].join(",")
        );
      }

      const { data: topRootRows, error: topRootError } = await topRootsQuery
        .order("score", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageLimit + 1);

      if (topRootError) {
        throw new Error(topRootError.message);
      }

      const rankedRoots = (topRootRows ?? []) as TopRootRow[];
      hasMore = rankedRoots.length > pageLimit;
      const pageRoots = hasMore ? rankedRoots.slice(0, pageLimit) : rankedRoots;
      nextCursor =
        hasMore && pageRoots.length > 0
          ? encodeTopCursor(pageRoots[pageRoots.length - 1])
          : null;

      const pageRootIds = pageRoots.map((row) => row.id);
      if (pageRootIds.length > 0) {
        let topRowsQuery = supabase
          .from("messages")
          .select(MESSAGE_SELECT)
          .eq("conversation_id", parsed.conversationId)
          .in("thread_root_id", pageRootIds);

        if (parsed.round) {
          topRowsQuery = topRowsQuery.eq("round_id", parsed.round);
        }

        if (parsed.agent && parsed.agent !== "all") {
          topRowsQuery = topRowsQuery.or(`avatar_id.eq.${parsed.agent},role.eq.user`);
        }

        const { data: topRows, error: topRowsError } = await topRowsQuery
          .order("sort_key", { ascending: true })
          .order("created_at", { ascending: true });

        if (topRowsError) {
          throw new Error(topRowsError.message);
        }

        const buckets = new Map<string, MessageRow[]>();
        for (const row of (topRows ?? []) as MessageRow[]) {
          const key = row.thread_root_id ?? row.id;
          const existing = buckets.get(key) ?? [];
          existing.push(row);
          buckets.set(key, existing);
        }

        orderedRows = pageRoots.flatMap((root) => buckets.get(root.id) ?? []);
      }
    } else {
      let threadQuery = supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("conversation_id", parsed.conversationId);

      if (parsed.round) {
        threadQuery = threadQuery.eq("round_id", parsed.round);
      }

      if (parsed.agent && parsed.agent !== "all") {
        threadQuery = threadQuery.or(`avatar_id.eq.${parsed.agent},role.eq.user`);
      }

      if (parsed.cursor) {
        threadQuery = threadQuery.gt("sort_key", parsed.cursor);
      }

      const { data: rows, error: rowsError } = await threadQuery
        .order("sort_key", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(pageLimit + 1);
      if (rowsError) {
        throw new Error(rowsError.message);
      }

      const baseRows = (rows ?? []) as MessageRow[];
      hasMore = baseRows.length > pageLimit;
      const pageRows = hasMore ? baseRows.slice(0, pageLimit) : baseRows;
      nextCursor =
        hasMore && pageRows.length > 0
          ? pageRows[pageRows.length - 1].sort_key
          : null;
      orderedRows = pageRows;
    }

    const { data: rawFacetRows, error: facetsError } = await supabase.rpc(
      "get_thread_facets",
      { p_conversation_id: parsed.conversationId }
    );

    if (facetsError) {
      throw new Error(facetsError.message);
    }

    const facetRows = (rawFacetRows ?? []) as FacetRow[];
    const orderedRounds = facetRows
      .filter((row) => row.facet_type === "round" && Boolean(row.facet_id))
      .map((row) => ({
        id: row.facet_id,
        createdAt: row.created_at ?? conversation.created_at,
        count: coerceCount(row.message_count),
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((row, index) => ({
        id: row.id,
        label: `Round ${index + 1}`,
        createdAt: row.createdAt,
        count: row.count,
      }));

    const agents = facetRows
      .filter((row) => row.facet_type === "agent" && Boolean(row.facet_id))
      .map((row) => ({
        id: row.facet_id,
        count: coerceCount(row.message_count),
      }))
      .sort((a, b) => b.count - a.count)
      .map((row) => ({
        id: row.id,
        name: getAgentMeta(row.id)?.name ?? row.id,
        count: row.count,
      }));

    const nodes = orderedRows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      parentMessageId: row.parent_message_id,
      threadRootId: row.thread_root_id,
      roundId: row.round_id,
      depth: row.depth ?? 0,
      role: row.role,
      content: row.content,
      avatarId: row.avatar_id,
      createdAt: row.created_at,
      score: row.score ?? 0,
      isHighlight: Boolean(row.is_highlight),
    }));

    const payload: ThreadResponse = {
      rootPost: {
        id: `root:${conversation.id}`,
        conversationId: conversation.id,
        title: conversation.title,
        topic: conversation.script,
        createdAt: conversation.created_at,
      },
      nodes,
      rounds: orderedRounds,
      agents,
      page: {
        limit: pageLimit,
        hasMore,
        nextCursor,
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid query params." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to load thread." }, { status: 500 });
  }
}

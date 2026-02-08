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

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRequestUser(request);
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      conversationId: url.searchParams.get("conversationId"),
      round: url.searchParams.get("round") ?? undefined,
      agent: url.searchParams.get("agent") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
    });

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

    let threadQuery = supabase
      .from("messages")
      .select(
        "id, conversation_id, parent_message_id, thread_root_id, round_id, depth, role, content, avatar_id, created_at, score, is_highlight, sort_key"
      )
      .eq("conversation_id", parsed.conversationId);

    if (parsed.round) {
      threadQuery = threadQuery.eq("round_id", parsed.round);
    }

    if (parsed.agent && parsed.agent !== "all") {
      threadQuery = threadQuery.or(`avatar_id.eq.${parsed.agent},role.eq.user`);
    }

    threadQuery = threadQuery
      .order("sort_key", { ascending: true })
      .order("created_at", { ascending: true });

    const { data: rows, error: rowsError } = await threadQuery;
    if (rowsError) {
      throw new Error(rowsError.message);
    }

    const { data: facetRows, error: facetsError } = await supabase
      .from("messages")
      .select("id, role, avatar_id, round_id, created_at")
      .eq("conversation_id", parsed.conversationId)
      .order("created_at", { ascending: true });

    if (facetsError) {
      throw new Error(facetsError.message);
    }

    const roundCountMap = new Map<string, number>();
    const roundCreatedMap = new Map<string, string>();
    const agentCountMap = new Map<string, number>();

    for (const row of facetRows ?? []) {
      if (row.round_id) {
        roundCountMap.set(row.round_id, (roundCountMap.get(row.round_id) ?? 0) + 1);
      }
      if (row.role === "user") {
        roundCreatedMap.set(row.id, row.created_at);
      }
      if (row.avatar_id) {
        agentCountMap.set(row.avatar_id, (agentCountMap.get(row.avatar_id) ?? 0) + 1);
      }
    }

    const orderedRounds = Array.from(roundCreatedMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, createdAt], index) => ({
        id,
        label: `Round ${index + 1}`,
        createdAt,
        count: roundCountMap.get(id) ?? 0,
      }));

    const agents = Array.from(agentCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({
        id,
        name: getAgentMeta(id)?.name ?? id,
        count,
      }));

    const orderedRows = (() => {
      const baseRows = (rows ?? []) as MessageRow[];
      if (parsed.sort !== "top") return baseRows;

      const buckets = new Map<string, MessageRow[]>();
      for (const row of baseRows) {
        const key = row.thread_root_id ?? row.id;
        const existing = buckets.get(key) ?? [];
        existing.push(row);
        buckets.set(key, existing);
      }

      const rankedRoots = Array.from(buckets.entries())
        .map(([key, bucket]) => {
          const rootRow = bucket.find((item) => item.id === key) ?? bucket[0];
          const fallbackScore = Math.max(...bucket.map((item) => item.score ?? 0));
          return {
            key,
            score: rootRow?.score ?? fallbackScore,
            createdAt: rootRow?.created_at ?? bucket[0]?.created_at ?? "",
          };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.createdAt.localeCompare(a.createdAt);
        });

      return rankedRoots.flatMap((root) => buckets.get(root.key) ?? []);
    })();

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

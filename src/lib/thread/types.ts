export type ThreadSort = "new" | "top";

export type ThreadNode = {
  id: string;
  conversationId: string;
  parentMessageId: string | null;
  threadRootId: string | null;
  roundId: string | null;
  depth: number;
  role: "user" | "assistant" | "system";
  content: string;
  avatarId: string | null;
  createdAt: string;
  score: number;
  isHighlight: boolean;
};

export type ThreadRound = {
  id: string;
  label: string;
  createdAt: string;
  count: number;
};

export type ThreadAgent = {
  id: string;
  name: string;
  count: number;
};

export type RootPost = {
  id: string;
  conversationId: string;
  title: string;
  topic: string | null;
  createdAt: string;
};

export type ThreadResponse = {
  rootPost: RootPost;
  nodes: ThreadNode[];
  rounds: ThreadRound[];
  agents: ThreadAgent[];
};

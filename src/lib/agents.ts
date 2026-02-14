export type AgentMeta = {
  id: string;
  name: string;
  roleLabel: string;
  image: string;
  color: string;
};

export const STANDARD_AGENT_AVATAR = "/images/avatars/standard.png";

export const AGENT_META: Record<string, AgentMeta> = {
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    roleLabel: "Strategy",
    image: "/images/avatars/chatgpt.png",
    color: "#10A37F",
  },
  claude: {
    id: "claude",
    name: "Claude",
    roleLabel: "Creative",
    image: "/images/avatars/claude.png",
    color: "#CC785C",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    roleLabel: "Analyst",
    image: "/images/avatars/gemini.png",
    color: "#4285F4",
  },
  grok: {
    id: "grok",
    name: "Grok",
    roleLabel: "Technical",
    image: "/images/avatars/grok.png",
    color: "#1F2937",
  },
  llama: {
    id: "llama",
    name: "Llama",
    roleLabel: "Research",
    image: "/images/avatars/llama.png",
    color: "#0064E0",
  },
  mistral: {
    id: "mistral",
    name: "Mistral",
    roleLabel: "Systems",
    image: "/images/avatars/mistral.png",
    color: "#7C3AED",
  },
  qwen: {
    id: "qwen",
    name: "Qwen",
    roleLabel: "Operations",
    image: "/images/avatars/qwen.png",
    color: "#FF6A00",
  },
  phi: {
    id: "phi",
    name: "Phi",
    roleLabel: "Planning",
    image: "/images/avatars/phi.png",
    color: "#2563EB",
  },
  gemma: {
    id: "gemma",
    name: "Gemma",
    roleLabel: "QA",
    image: "/images/avatars/gemma.png",
    color: "#0891B2",
  },
};

export const getAgentMeta = (agentId: string | null | undefined): AgentMeta | null => {
  if (!agentId) return null;
  return AGENT_META[agentId] ?? null;
};

const MODEL_FAMILY_ALIASES: Array<{ pattern: RegExp; family: string }> = [
  { pattern: /\b(chatgpt|gpt|openai|o1|o3)\b/i, family: "chatgpt" },
  { pattern: /\b(claude|anthropic)\b/i, family: "claude" },
  { pattern: /\b(gemini|google)\b/i, family: "gemini" },
  { pattern: /\b(grok|xai)\b/i, family: "grok" },
  { pattern: /\b(llama|meta)\b/i, family: "llama" },
  { pattern: /\b(mistral|mistralai|pixtral)\b/i, family: "mistral" },
  { pattern: /\b(qwen|alibaba)\b/i, family: "qwen" },
  { pattern: /\b(phi|microsoft)\b/i, family: "phi" },
  { pattern: /\b(gemma)\b/i, family: "gemma" },
];

const firstTextToken = (value: string): string => {
  const candidate = value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate) return "";

  const token = candidate
    .split(" ")
    .find((part) => /[a-z]/.test(part) && !/^\d/.test(part));

  return token ?? "";
};

export const resolveModelAvatarImage = ({
  modelId,
  displayName,
}: {
  modelId?: string | null;
  displayName?: string | null;
}): string => {
  const sources = [displayName ?? "", modelId ?? ""].filter(Boolean);

  for (const source of sources) {
    for (const alias of MODEL_FAMILY_ALIASES) {
      if (alias.pattern.test(source)) {
        return `/images/avatars/${alias.family}.png`;
      }
    }
  }

  for (const source of sources) {
    const modelPart = source.includes("/") ? source.split("/")[1] ?? source : source;
    const token = firstTextToken(modelPart);
    if (token) {
      return `/images/avatars/${token}.png`;
    }
  }

  return STANDARD_AGENT_AVATAR;
};

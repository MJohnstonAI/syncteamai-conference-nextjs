export type AgentMeta = {
  id: string;
  name: string;
  roleLabel: string;
  image: string;
  color: string;
};

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

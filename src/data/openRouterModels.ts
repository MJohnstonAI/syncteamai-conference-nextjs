export interface OpenRouterModel {
  id: string;
  name: string;
  provider: string;
  tier: 'free' | 'premium' | 'pro';
  contextWindow: number;
  pricing?: {
    input: number;
    output: number;
  };
  description?: string;
  capabilities?: string[];
}

export const OPENROUTER_MODELS: OpenRouterModel[] = [
  // OpenAI
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    tier: 'premium',
    contextWindow: 128000,
    pricing: { input: 2.5, output: 10 },
    description: 'Flagship multimodal model with vision and advanced reasoning',
    capabilities: ['vision', 'json-mode', 'function-calling']
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: 'free',
    contextWindow: 128000,
    pricing: { input: 0.15, output: 0.6 },
    description: 'Faster, more affordable version of GPT-4o'
  },
  {
    id: 'openai/o1',
    name: 'o1',
    provider: 'openai',
    tier: 'pro',
    contextWindow: 200000,
    pricing: { input: 15, output: 60 },
    description: 'Extended reasoning model for complex problem-solving'
  },
  {
    id: 'openai/o1-mini',
    name: 'o1 Mini',
    provider: 'openai',
    tier: 'premium',
    contextWindow: 128000,
    pricing: { input: 3, output: 12 },
    description: 'Compact reasoning model'
  },
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    tier: 'premium',
    contextWindow: 128000,
    pricing: { input: 10, output: 30 },
    description: 'Previous generation flagship model'
  },

  // Anthropic
  {
    id: 'anthropic/claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    tier: 'pro',
    contextWindow: 200000,
    pricing: { input: 15, output: 75 },
    description: 'Most capable Claude model for complex tasks',
    capabilities: ['vision', 'extended-thinking']
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    tier: 'premium',
    contextWindow: 200000,
    pricing: { input: 3, output: 15 },
    description: 'Balanced performance and speed'
  },
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    tier: 'premium',
    contextWindow: 200000,
    pricing: { input: 3, output: 15 }
  },
  {
    id: 'anthropic/claude-haiku-3.5',
    name: 'Claude Haiku 3.5',
    provider: 'anthropic',
    tier: 'free',
    contextWindow: 200000,
    pricing: { input: 0.8, output: 4 },
    description: 'Fastest Claude model for quick responses'
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    tier: 'premium',
    contextWindow: 200000,
    pricing: { input: 3, output: 15 },
    description: 'Extended thinking capabilities'
  },

  // Google
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    tier: 'premium',
    contextWindow: 2097152,
    pricing: { input: 1.25, output: 5 },
    description: 'Massive context window for document analysis',
    capabilities: ['vision', 'ultra-long-context']
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    tier: 'free',
    contextWindow: 1048576,
    pricing: { input: 0.075, output: 0.3 },
    description: 'Fast and cost-effective'
  },
  {
    id: 'google/gemini-exp-1206',
    name: 'Gemini Experimental',
    provider: 'google',
    tier: 'pro',
    contextWindow: 2097152,
    description: 'Cutting-edge experimental model'
  },
  {
    id: 'google/gemma-2-27b-it',
    name: 'Gemma 2 27B',
    provider: 'google',
    tier: 'free',
    contextWindow: 8192,
    pricing: { input: 0.27, output: 0.27 },
    description: 'Open-source model from Google'
  },

  // xAI
  {
    id: 'xai/grok-2-latest',
    name: 'Grok 2',
    provider: 'xai',
    tier: 'premium',
    contextWindow: 131072,
    pricing: { input: 2, output: 10 },
    description: 'Latest Grok model with real-time knowledge'
  },
  {
    id: 'xai/grok-2-vision',
    name: 'Grok 2 Vision',
    provider: 'xai',
    tier: 'premium',
    contextWindow: 131072,
    pricing: { input: 2, output: 10 },
    capabilities: ['vision']
  },

  // Meta
  {
    id: 'meta/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'meta',
    tier: 'free',
    contextWindow: 128000,
    pricing: { input: 0.35, output: 0.4 },
    description: 'Latest Llama model, open-source'
  },
  {
    id: 'meta/llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B',
    provider: 'meta',
    tier: 'premium',
    contextWindow: 131072,
    pricing: { input: 2.7, output: 2.7 },
    description: 'Largest Llama model'
  },
  {
    id: 'meta/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B',
    provider: 'meta',
    tier: 'free',
    contextWindow: 131072,
    pricing: { input: 0.055, output: 0.055 },
    description: 'Compact, fast Llama model'
  },

  // Mistral
  {
    id: 'mistralai/mistral-large-2',
    name: 'Mistral Large 2',
    provider: 'mistralai',
    tier: 'premium',
    contextWindow: 131072,
    pricing: { input: 2, output: 6 },
    description: 'Flagship Mistral model'
  },
  {
    id: 'mistralai/mistral-small-2',
    name: 'Mistral Small 2',
    provider: 'mistralai',
    tier: 'free',
    contextWindow: 131072,
    pricing: { input: 0.2, output: 0.6 },
    description: 'Compact Mistral model'
  },
  {
    id: 'mistralai/pixtral-large',
    name: 'Pixtral Large',
    provider: 'mistralai',
    tier: 'premium',
    contextWindow: 131072,
    pricing: { input: 2, output: 6 },
    capabilities: ['vision']
  },

  // Alibaba (Qwen)
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B',
    provider: 'qwen',
    tier: 'free',
    contextWindow: 131072,
    pricing: { input: 0.35, output: 0.4 },
    description: "Alibaba's flagship model"
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder',
    provider: 'qwen',
    tier: 'free',
    contextWindow: 131072,
    pricing: { input: 0.14, output: 0.14 },
    description: 'Specialized for code generation'
  },

  // Microsoft
  {
    id: 'microsoft/phi-4',
    name: 'Phi-4',
    provider: 'microsoft',
    tier: 'free',
    contextWindow: 16384,
    pricing: { input: 0, output: 0 },
    description: 'Free small language model from Microsoft'
  },

  // DeepSeek
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    tier: 'premium',
    contextWindow: 65536,
    pricing: { input: 0.55, output: 2.19 },
    description: 'Advanced reasoning model'
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    tier: 'free',
    contextWindow: 65536,
    pricing: { input: 0.14, output: 0.28 }
  }
];

// Default avatar smart mappings
export const SMART_DEFAULTS: Record<string, string> = {
  chatgpt: 'openai/gpt-4o',
  claude: 'anthropic/claude-opus-4',
  gemini: 'google/gemini-2.5-pro',
  grok: 'xai/grok-2-latest',
  llama: 'meta/llama-3.3-70b-instruct',
  mistral: 'mistralai/mistral-large-2',
  qwen: 'qwen/qwen-2.5-72b-instruct',
  phi: 'microsoft/phi-4',
  gemma: 'google/gemma-2-27b-it',
};

export const DEFAULT_AVATAR_ORDER: string[] = [
  'chatgpt',
  'claude',
  'gemini',
  'grok',
  'llama',
  'mistral',
  'qwen',
  'phi',
  'gemma',
];

export function getProviderLogo(provider: string): string {
  // Simple label; replace with icons/logos later if desired
  return provider.toUpperCase();
}

export function getModelById(id: string): OpenRouterModel | undefined {
  return OPENROUTER_MODELS.find((m) => m.id === id);
}

export function getModelsByProvider(): Record<string, OpenRouterModel[]> {
  const grouped: Record<string, OpenRouterModel[]> = {};
  for (const model of OPENROUTER_MODELS) {
    if (!grouped[model.provider]) grouped[model.provider] = [];
    grouped[model.provider].push(model);
  }
  return grouped;
}


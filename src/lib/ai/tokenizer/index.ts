// Simple token estimation (approximation)
// This is a heuristic-based estimator that doesn't require network calls
// More accurate than word count, less accurate than actual tokenization

const AVG_CHARS_PER_TOKEN = 4; // GPT/LLaMA average is ~4 chars per token

export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // Count characters
  const chars = text.length;
  
  // Adjust for whitespace (tokens are typically words + punctuation)
  const words = text.split(/\s+/).length;
  
  // Use a weighted average: favor character count but adjust for word boundaries
  const charBasedEstimate = chars / AVG_CHARS_PER_TOKEN;
  const wordBasedEstimate = words * 1.3; // Average word is ~1.3 tokens
  
  // Weighted average (70% char-based, 30% word-based)
  return Math.ceil(charBasedEstimate * 0.7 + wordBasedEstimate * 0.3);
}

export function estimateTokensForMessages(
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string
): number {
  let total = 0;
  
  // System prompt
  if (systemPrompt) {
    total += estimateTokens(systemPrompt);
    total += 4; // Overhead for system message formatting
  }
  
  // Messages
  for (const msg of messages) {
    total += estimateTokens(msg.content);
    total += 4; // Overhead for role + message formatting
  }
  
  return total;
}

// Model-specific max context lengths
export const MAX_CONTEXT: Record<string, number> = {
  'llama': 4096,
  'qwen': 4096,
  'gemini': 32768,
  'claude': 200000,
  'chatgpt': 128000,
  'grok': 131072,
};

export function getMaxContext(avatarId: string): number {
  return MAX_CONTEXT[avatarId] || 4096;
}

export function checkContextOverflow(
  messages: Array<{ role: string; content: string }>,
  avatarId: string,
  systemPrompt?: string,
  safetyMargin: number = 0.9 // Use 90% of max context as threshold
): { overflow: boolean; estimatedTokens: number; maxTokens: number } {
  const estimatedTokens = estimateTokensForMessages(messages, systemPrompt);
  const maxTokens = getMaxContext(avatarId);
  const threshold = Math.floor(maxTokens * safetyMargin);
  
  return {
    overflow: estimatedTokens > threshold,
    estimatedTokens,
    maxTokens,
  };
}

// Summarize script to fit within token budget
export function summarizeScript(
  script: string,
  targetTokens: number
): string {
  const currentTokens = estimateTokens(script);
  
  if (currentTokens <= targetTokens) {
    return script;
  }
  
  // Calculate compression ratio
  const ratio = targetTokens / currentTokens;
  
  // Split into sentences
  const sentences = script.split(/[.!?]+/).filter(s => s.trim());
  
  // Keep first and last sentences (context anchors)
  if (sentences.length <= 2) {
    return script.slice(0, Math.floor(script.length * ratio));
  }
  
  const keepCount = Math.max(2, Math.floor(sentences.length * ratio));
  const kept: string[] = [];
  
  // Always keep first sentence
  kept.push(sentences[0]);
  
  // Sample middle sentences
  const middleStart = 1;
  const middleEnd = sentences.length - 1;
  const middleCount = keepCount - 2;
  
  if (middleCount > 0) {
    const step = (middleEnd - middleStart) / middleCount;
    for (let i = 0; i < middleCount; i++) {
      const idx = middleStart + Math.floor(i * step);
      kept.push(sentences[idx]);
    }
  }
  
  // Always keep last sentence
  kept.push(sentences[sentences.length - 1]);
  
  return kept.join('. ') + '.';
}

// Split script into phases
export function splitScriptIntoPhases(
  script: string,
  maxTokensPerPhase: number
): string[] {
  const totalTokens = estimateTokens(script);
  
  if (totalTokens <= maxTokensPerPhase) {
    return [script];
  }
  
  // Split by paragraphs first
  const paragraphs = script.split(/\n\n+/).filter(p => p.trim());
  
  const phases: string[] = [];
  let currentPhase: string[] = [];
  let currentTokens = 0;
  
  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    
    if (currentTokens + paraTokens > maxTokensPerPhase && currentPhase.length > 0) {
      // Start new phase
      phases.push(currentPhase.join('\n\n'));
      currentPhase = [para];
      currentTokens = paraTokens;
    } else {
      currentPhase.push(para);
      currentTokens += paraTokens;
    }
  }
  
  // Add remaining
  if (currentPhase.length > 0) {
    phases.push(currentPhase.join('\n\n'));
  }
  
  return phases;
}

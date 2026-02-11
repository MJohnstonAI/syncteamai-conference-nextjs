import type { ConferenceAgentRole, ConferencePhase } from "@/lib/conference/phases";

export type ContributionType =
  | "add_evidence"
  | "challenge_assumption"
  | "connect_ideas"
  | "refine_decision";

export type DecisionBoard = {
  claim: string;
  forCase: string;
  againstCase: string;
  confidence: string;
  nextAction: string;
  sourceMessageId?: string;
};

const UUID_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const resolveContributionType = ({
  phase,
  agentRole,
}: {
  phase: ConferencePhase;
  agentRole: ConferenceAgentRole;
}): ContributionType => {
  if (agentRole === "contrarian") return "challenge_assumption";
  if (agentRole === "synthesizer") return "refine_decision";
  if (phase === "challenge") return "challenge_assumption";
  if (phase === "synthesize") return "refine_decision";
  return "add_evidence";
};

export const extractMessageReferences = (content: string): string[] => {
  return Array.from(new Set(content.match(UUID_REGEX) ?? []));
};

const withContributionLine = (content: string, type: ContributionType) => {
  if (/^\s*Contribution\s*:/im.test(content)) return content;
  return `Contribution: ${type}\n${content}`.trim();
};

const withReferencesLine = (content: string, references: string[]) => {
  if (/^\s*References\s*:/im.test(content)) return content;
  return `References: ${references.join(", ")}\n${content}`.trim();
};

const withDecisionBoardBlock = (content: string) => {
  if (/^\s*Decision\s*Board\s*:/im.test(content)) return content;
  return [
    content.trim(),
    "",
    "Decision Board:",
    "Claim: Pending synthesis",
    "For: Pending synthesis",
    "Against: Pending synthesis",
    "Confidence: Medium",
    "Next Action: Review this round and decide the next prompt.",
  ].join("\n");
};

const stripMetadataPreamble = (content: string) =>
  content
    .replace(/^\s*Contribution\s*:.*$/gim, "")
    .replace(/^\s*References\s*:.*$/gim, "")
    .trim();

export const isPureRepetition = ({
  candidate,
  priorAssistantMessages,
}: {
  candidate: string;
  priorAssistantMessages: string[];
}) => {
  const normalizedCandidate = normalizeText(stripMetadataPreamble(candidate));
  if (normalizedCandidate.length < 80) return false;

  return priorAssistantMessages.some((previous) => {
    const normalizedPrevious = normalizeText(stripMetadataPreamble(previous));
    if (!normalizedPrevious) return false;
    if (normalizedCandidate === normalizedPrevious) return true;

    const shorter =
      normalizedCandidate.length <= normalizedPrevious.length
        ? normalizedCandidate
        : normalizedPrevious;
    const longer =
      normalizedCandidate.length > normalizedPrevious.length
        ? normalizedCandidate
        : normalizedPrevious;

    if (shorter.length < 90) return false;
    return longer.includes(shorter.slice(0, Math.min(shorter.length, 180)));
  });
};

export const normalizeAgentOutput = ({
  content,
  phase,
  agentRole,
  allowedReferenceIds,
  fallbackReferenceId,
}: {
  content: string;
  phase: ConferencePhase;
  agentRole: ConferenceAgentRole;
  allowedReferenceIds: string[];
  fallbackReferenceId: string;
}) => {
  const contributionType = resolveContributionType({ phase, agentRole });
  const existingReferences = extractMessageReferences(content);

  const references = existingReferences.length
    ? existingReferences
    : allowedReferenceIds.length
    ? [allowedReferenceIds[0]]
    : [fallbackReferenceId];

  let normalized = content.trim();
  normalized = withContributionLine(normalized, contributionType);
  normalized = withReferencesLine(normalized, references);
  if (agentRole === "synthesizer" || phase === "synthesize") {
    normalized = withDecisionBoardBlock(normalized);
  }

  return {
    content: normalized,
    references,
    contributionType,
  };
};

const getLineValue = (content: string, label: string) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? "";
};

export const parseDecisionBoardFromMessage = (
  content: string
): Omit<DecisionBoard, "sourceMessageId"> | null => {
  if (!/^\s*Decision\s*Board\s*:/im.test(content)) return null;

  const claim = getLineValue(content, "Claim");
  const forCase = getLineValue(content, "For");
  const againstCase = getLineValue(content, "Against");
  const confidence = getLineValue(content, "Confidence");
  const nextAction = getLineValue(content, "Next Action");

  if (!claim && !forCase && !againstCase && !confidence && !nextAction) {
    return null;
  }

  return {
    claim: claim || "Pending synthesis",
    forCase: forCase || "Pending synthesis",
    againstCase: againstCase || "Pending synthesis",
    confidence: confidence || "Medium",
    nextAction: nextAction || "Review this round and set the next step.",
  };
};

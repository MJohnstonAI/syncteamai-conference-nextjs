export type ConferencePhase = "diverge" | "challenge" | "synthesize";
export type ConferenceAgentRole = "default" | "contrarian" | "synthesizer";

export type ConferencePhaseMeta = {
  key: ConferencePhase;
  label: string;
  shortDescription: string;
};

const PHASE_META: Record<ConferencePhase, ConferencePhaseMeta> = {
  diverge: {
    key: "diverge",
    label: "Diverge",
    shortDescription: "Expand perspectives and surface distinct framings.",
  },
  challenge: {
    key: "challenge",
    label: "Challenge",
    shortDescription: "Stress-test assumptions, evidence, and edge cases.",
  },
  synthesize: {
    key: "synthesize",
    label: "Synthesize",
    shortDescription: "Converge on decisions, trade-offs, and next actions.",
  },
};

export const getConferencePhaseMeta = (phase: ConferencePhase): ConferencePhaseMeta =>
  PHASE_META[phase];

export const getConferencePhaseForRoundNumber = (roundNumber: number): ConferencePhase => {
  if (roundNumber <= 2) return "diverge";
  if (roundNumber <= 4) return "challenge";
  return "synthesize";
};

export const buildConferencePhaseSystemPrompt = ({
  phase,
  roundNumber,
  agentName,
  agentRole = "default",
  citationMessageIds = [],
  fallbackReferenceId,
}: {
  phase: ConferencePhase;
  roundNumber: number;
  agentName: string;
  agentRole?: ConferenceAgentRole;
  citationMessageIds?: string[];
  fallbackReferenceId?: string;
}) => {
  const header = `Conference phase: ${getConferencePhaseMeta(phase).label} (Round ${roundNumber})`;

  const phaseInstruction =
    phase === "diverge"
      ? "Add a perspective not yet covered. Do not summarize the full thread."
      : phase === "challenge"
      ? "Challenge assumptions and test failure modes with concrete counterpoints."
      : "Synthesize toward a decision with clear trade-offs and next steps.";

  const roleInstruction =
    agentRole === "contrarian"
      ? "Role mode: Contrarian. Challenge assumptions, surface edge cases, and present the strongest counter-position."
      : agentRole === "synthesizer"
      ? "Role mode: Synthesizer. Integrate points of agreement/disagreement and produce a Decision Board update."
      : "Role mode: Contributor. Add useful substance without repeating prior points.";

  const referencePool = Array.from(
    new Set(
      [...citationMessageIds, fallbackReferenceId].filter((value): value is string => Boolean(value))
    )
  );
  const referenceInstruction =
    referencePool.length > 0
      ? `References requirement: include a 'References:' line with at least one message id from this list: ${referencePool.join(", ")}.`
      : "References requirement: include a 'References:' line with at least one prior message id.";

  const decisionBoardInstruction =
    agentRole === "synthesizer" || phase === "synthesize"
      ? "Include a 'Decision Board' block with fields: Claim, For, Against, Confidence, Next Action."
      : "Do not include a Decision Board block unless you are synthesizing.";

  return [
    header,
    `You are ${agentName}.`,
    phaseInstruction,
    roleInstruction,
    "Contribution rule: add value by adding evidence, challenging an assumption, connecting ideas, or refining a decision.",
    referenceInstruction,
    decisionBoardInstruction,
    "Keep your response concise, high-signal, and actionable.",
  ].join("\n");
};

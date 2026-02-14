import type {
  BudgetLevel,
  CompanySize,
  StakesLevel,
  TimelineLevel,
} from "@/lib/configuration/types";

const startCase = (value: string) =>
  value
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");

export const formatProblemType = (value: string): string => {
  if (!value) return "General Strategy";
  return startCase(value);
};

export const formatCompanySize = (value: CompanySize): string => {
  if (value === "mid-market") return "Mid-market";
  if (value === "unspecified") return "Not specified";
  return startCase(value);
};

export const formatStakesLevel = (value: StakesLevel): string => {
  if (value === "unspecified") return "Not specified";
  return startCase(value);
};

export const formatTimeline = (value: TimelineLevel): string => {
  if (value === "near-term") return "Near-term";
  if (value === "long-term") return "Long-term";
  if (value === "unspecified") return "Not specified";
  return startCase(value);
};

export const formatBudget = (value: BudgetLevel): string => {
  if (value === "unspecified") return "Not specified";
  return startCase(value);
};

export const formatStrategy = (value: string): string => {
  if (!value) return "Balanced Roundtable";
  return startCase(value);
};


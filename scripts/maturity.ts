export const MATURITY_LEVELS = ["everyone", "kids", "teens", "adults"] as const;
export type MaturityLevel = (typeof MATURITY_LEVELS)[number];

export const MATURITY_PREFERENCES = ["kids_only", "everyone", "teens", "adults"] as const;
export type MaturityPreference = (typeof MATURITY_PREFERENCES)[number];

export const MATURITY_LEVEL_LABELS: Record<MaturityLevel, string> = {
  everyone: "Everyone",
  kids: "Kids",
  teens: "Teens",
  adults: "Adults / 18+",
};

export const MATURITY_PREFERENCE_LABELS: Record<MaturityPreference, string> = {
  kids_only: "Kids only",
  everyone: "Everyone",
  teens: "Teens and under",
  adults: "Adults / 18+",
};

export function normalizeMaturityLevel(value: unknown): MaturityLevel {
  return MATURITY_LEVELS.includes(value as MaturityLevel) ? (value as MaturityLevel) : "everyone";
}

export function normalizeMaturityPreference(value: unknown): MaturityPreference {
  return MATURITY_PREFERENCES.includes(value as MaturityPreference) ? (value as MaturityPreference) : "adults";
}

export function allowedMaturityLevels(preference: unknown): MaturityLevel[] {
  switch (normalizeMaturityPreference(preference)) {
    case "kids_only":
      return ["kids"];
    case "everyone":
      return ["everyone", "kids"];
    case "teens":
      return ["everyone", "kids", "teens"];
    case "adults":
    default:
      return ["everyone", "kids", "teens", "adults"];
  }
}

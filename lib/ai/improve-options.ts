// Client-safe "Improve" option list (spec section 32). No server-only
// imports here so Client Components can use these labels directly.

export type ImproveOption =
  | "more_professional"
  | "more_conversational"
  | "more_engaging"
  | "shorter"
  | "longer"
  | "more_educational"
  | "more_promotional";

export const IMPROVE_OPTIONS: Array<{ value: ImproveOption; label: string }> = [
  { value: "more_professional", label: "More professional" },
  { value: "more_conversational", label: "More conversational" },
  { value: "more_engaging", label: "More engaging" },
  { value: "shorter", label: "Shorter" },
  { value: "longer", label: "Longer" },
  { value: "more_educational", label: "More educational" },
  { value: "more_promotional", label: "More promotional" },
];

/** Fixed session tokens the seed creates and the specs present as cookies. */
export const SESSION_TOKENS = {
  Ann: "e2e-session-ann",
  Bob: "e2e-session-bob",
  Cal: "e2e-session-cal",
  Dee: "e2e-session-dee",
  /** VIEWER in "Roles house". */
  Eve: "e2e-session-eve",
  /** Belongs to no household at all. */
  Fay: "e2e-session-fay",
  /** Removed from "Roles house"; still has an account. */
  Gus: "e2e-session-gus",
} as const;

export type Person = keyof typeof SESSION_TOKENS;

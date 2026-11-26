// ponytail: stands in for the optional Privy peer `@solana-program/memo` (only used by Privy's Ledger SIWS memo flow).
// Install the real package (and drop the alias in next.config.ts) if Ledger login is needed.
export const getAddMemoInstruction = (): never => { throw new Error("Ledger sign-in not supported here"); };

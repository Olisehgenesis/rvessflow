const testnet = (process.env.RVESS_NETWORK || process.env.NEXT_PUBLIC_RVESS_NETWORK) === "sepolia";

/** Unix time when the scheduled group upgrade can be finished. */
const readyAt = testnet ? 1793253697 : 1793254361;

export const groupUpgradeLine =
  "A group upgrade is coming soon. It is scheduled for Thursday, 29 October. After it is finished, a new group can pay each turn. Groups already running keep streaming.";

export function plainGroupWaits(): string | null {
  if (Math.floor(Date.now() / 1000) >= readyAt) return null;
  return "Paid each turn is an upgrade coming soon, on Thursday, 29 October. Until then, start the group as a streaming pot.";
}

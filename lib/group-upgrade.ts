export type GroupPlainStatus = { live: boolean; readyAt: number };

export function groupUpgradeLine(status: GroupPlainStatus): string | null {
  if (status.live) return null;
  if (status.readyAt > Math.floor(Date.now() / 1000)) {
    return `A group upgrade is scheduled for ${when(status.readyAt)}. After the owner wallets finish it, a new group can pay each turn. Groups already running keep streaming.`;
  }
  if (status.readyAt > 0) {
    return "The wait for the group upgrade is over. The owner wallets still need to finish it before a new group can pay each turn. Groups already running keep streaming.";
  }
  return "This network's group contract streams. Paid each turn is not on this deployment yet.";
}

export function plainGroupWaits(status: GroupPlainStatus): string | null {
  if (status.live) return null;
  if (status.readyAt > Math.floor(Date.now() / 1000)) {
    return `Paid each turn waits until ${when(status.readyAt)}, then the owner wallets finish the upgrade. Until then, start the group as a streaming pot.`;
  }
  if (status.readyAt > 0) {
    return "Paid each turn is ready on the calendar. The owner wallets still need to finish the upgrade. Until then, start the group as a streaming pot.";
  }
  return "Paid each turn is not on this network yet. Start the group as a streaming pot.";
}

export function plainTurnHint(status: GroupPlainStatus): string {
  const how = "Paid each turn sends the contribution to the person whose turn it is. A streaming pot pays that person every second.";
  if (status.live) return how;
  const wait = plainGroupWaits(status);
  return wait ? `${how} ${wait}` : how;
}

function when(readyAt: number) {
  return new Date(readyAt * 1000).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

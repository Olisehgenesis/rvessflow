export type ListedConnector = {
  id: string;
  name: string;
  rdns?: string;
  icon?: string;
  source: "announced" | "injected" | "walletconnect" | "coinbase";
};

export function walletKey(name: string, rdns?: string) {
  const fromName = name.toLowerCase().replace(/wallet/g, "").replace(/[^a-z0-9]/g, "");
  const fromRdns = (rdns ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return fromName || fromRdns;
}

function better(current: ListedConnector, next: ListedConnector) {
  if (!current.icon && next.icon) return true;
  if (!current.rdns && next.rdns) return true;
  if (current.source === "injected" && next.source === "announced") return true;
  return false;
}

/** Drops generic injected when EIP-6963 wallets exist, then keeps one row per name/rdns, preferring an icon. */
export function dedupeConnectors(connectors: ListedConnector[]): ListedConnector[] {
  const announced = connectors.filter((item) => item.source === "announced");
  const injected = announced.length ? [] : connectors.filter((item) => item.source === "injected");
  const extras = connectors.filter((item) => item.source === "walletconnect" || item.source === "coinbase");
  const picked: ListedConnector[] = [];
  for (const item of [...announced, ...injected]) {
    const key = walletKey(item.name, item.rdns);
    const index = picked.findIndex((row) => walletKey(row.name, row.rdns) === key);
    if (index < 0) {
      picked.push(item);
      continue;
    }
    if (better(picked[index], item)) picked[index] = item;
  }
  for (const item of extras) {
    const key = walletKey(item.name, item.rdns);
    const index = picked.findIndex((row) => walletKey(row.name, row.rdns) === key);
    if (index < 0) {
      picked.push(item);
      continue;
    }
    if (better(picked[index], item)) picked[index] = item;
  }
  return picked;
}

export function splitWalletSections(connectors: ListedConnector[], recentId?: string | null) {
  const recent = recentId
    ? connectors.filter((item) => item.id === recentId || item.rdns === recentId || `rvess:${item.rdns ?? ""}` === recentId).slice(0, 1)
    : [];
  const recentKey = recent[0] ? walletKey(recent[0].name, recent[0].rdns) : "";
  const installed = connectors.filter((item) => item.source === "announced" && walletKey(item.name, item.rdns) !== recentKey);
  const other = connectors.filter((item) => item.source === "walletconnect" || item.source === "coinbase");
  return { recent, installed, other };
}

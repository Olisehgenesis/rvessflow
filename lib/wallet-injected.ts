type Eip1193 = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

type LegacyProvider = Eip1193 & {
  providers?: LegacyProvider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
};

export type AnnouncedWallet = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193;
};

let pending: Eip1193 | null = null;
let lastInjected: Eip1193 | null = null;
const injectedHint = "rvess-injected";

export function clearInjectedConnection() {
  pending = null;
}

export function peekInjectedConnection() {
  return pending;
}

export function takeInjectedConnection() {
  const picked = pending;
  pending = null;
  if (picked) lastInjected = picked;
  return picked;
}

function accountsOf(provider: Eip1193): Promise<string[]> {
  return provider.request({ method: "eth_accounts" }).then((value) => (Array.isArray(value) ? value.map(String) : []));
}

function matchesAccount(accounts: string[], address: string) {
  const want = address.toLowerCase();
  return accounts.some((item) => item.toLowerCase() === want);
}

function saveInjectedHint(rdns: string, address: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(injectedHint, JSON.stringify({ rdns, address: address.toLowerCase() }));
}

export function recentInjectedHint(): { rdns?: string; address?: string } | null {
  if (typeof window === "undefined") return null;
  const hint = window.sessionStorage.getItem(injectedHint);
  if (!hint) return null;
  try {
    return JSON.parse(hint) as { rdns?: string; address?: string };
  } catch {
    return null;
  }
}

/** Reuses an already-authorized browser wallet so signing does not open WalletConnect again. */
export async function restoreInjected(address: string): Promise<Eip1193 | null> {
  if (lastInjected && matchesAccount(await accountsOf(lastInjected).catch(() => []), address)) return lastInjected;
  const wallets = await discoverInjectedWallets(200);
  const saved = recentInjectedHint();
  const preferred = saved?.rdns ? wallets.filter((wallet) => wallet.info.rdns === saved.rdns || `rvess:${wallet.info.rdns}` === saved.rdns) : wallets;
  for (const wallet of [...preferred, ...wallets]) {
    const accounts = await accountsOf(wallet.provider).catch(() => []);
    if (!matchesAccount(accounts, address)) continue;
    lastInjected = wallet.provider;
    saveInjectedHint(wallet.info.rdns, address);
    return wallet.provider;
  }
  return null;
}

const installed = new Map<string, Eip1193>();

export type InstalledWallet = { id: string; name: string; icon?: string; rdns?: string };

/** Browser wallets announced on this page. The deployer connects to one of these directly. */
export function installedWallets(waitMs = 200): Promise<InstalledWallet[]> {
  return discoverInjectedWallets(waitMs).then((wallets) => {
    installed.clear();
    return wallets.map((wallet) => {
      const id = wallet.info.rdns || wallet.info.uuid;
      installed.set(id, wallet.provider);
      return { id, name: wallet.info.name, icon: wallet.info.icon || undefined, rdns: wallet.info.rdns };
    });
  });
}

/** Asks that installed wallet for the account it will sign with. */
export async function connectInstalled(id: string): Promise<Eip1193> {
  const provider = installed.get(id);
  if (!provider) throw new Error("That wallet is not available in this browser.");
  return requestAccount(provider, id);
}

export async function connectAnnounced(wallet: AnnouncedWallet): Promise<Eip1193> {
  const id = wallet.info.rdns || wallet.info.uuid;
  installed.set(id, wallet.provider);
  return requestAccount(wallet.provider, id);
}

async function requestAccount(provider: Eip1193, id: string): Promise<Eip1193> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("The wallet did not return an account.");
  pending = provider;
  lastInjected = provider;
  saveInjectedHint(id, address);
  return provider;
}

function announcedKey(name: string, rdns: string) {
  const fromRdns = rdns.toLowerCase().replace(/[^a-z0-9]/g, "");
  const fromName = name.toLowerCase().replace(/wallet/g, "").replace(/[^a-z0-9]/g, "");
  return fromRdns || fromName;
}

export function listAnnouncedWallets(waitMs = 200): Promise<AnnouncedWallet[]> {
  return discoverInjectedWallets(waitMs).then((wallets) => {
    const unique = new Map<string, AnnouncedWallet>();
    for (const wallet of wallets) {
      const key = announcedKey(wallet.info.name, wallet.info.rdns);
      const current = unique.get(key);
      if (!current || (!current.info.icon && wallet.info.icon)) unique.set(key, wallet);
    }
    return [...unique.values()];
  });
}

function discoverInjectedWallets(waitMs = 50): Promise<AnnouncedWallet[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  return new Promise((resolve) => {
    const found = new Map<string, AnnouncedWallet>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<AnnouncedWallet>).detail;
      if (!detail?.info?.uuid || !detail.provider || found.has(detail.info.uuid)) return;
      found.set(detail.info.uuid, detail);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      const announced = [...found.values()];
      resolve(announced.length ? announced : legacyWallets());
    }, waitMs);
  });
}

function legacyWallets(): AnnouncedWallet[] {
  const ethereum = (window as Window & { ethereum?: LegacyProvider }).ethereum;
  if (!ethereum) return [];
  const list = ethereum.providers?.length ? ethereum.providers : [ethereum];
  const seen = new Set<string>();
  const wallets: AnnouncedWallet[] = [];
  for (const provider of list) {
    const name = legacyName(provider);
    if (seen.has(name)) continue;
    seen.add(name);
    const rdns = name.toLowerCase().replace(/[^a-z0-9]+/g, ".");
    wallets.push({ info: { uuid: rdns, name, icon: "", rdns }, provider });
  }
  return wallets;
}

function legacyName(provider: LegacyProvider) {
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isRabby) return "Rabby";
  if (provider.isBraveWallet) return "Brave Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return "Installed wallet";
}

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

type AnnouncedWallet = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193;
};

type InjectedConnector = {
  id: string;
  type: string;
  provider?: Eip1193;
};

let pending: Eip1193 | null = null;
let closeModal: (() => void) | null = null;
let wrapped = false;
let originalOpen: ((options?: unknown) => Promise<unknown>) | null = null;

export function clearInjectedConnection() {
  pending = null;
}

export function peekInjectedConnection() {
  return pending;
}

export function takeInjectedConnection() {
  const picked = pending;
  pending = null;
  return picked;
}

type WalletModal = {
  close: () => void;
  open?: ((options?: unknown) => Promise<unknown>) & { rvess?: boolean };
  subscribeState?: (callback: (state: { open?: boolean }) => void) => () => void;
};

/** Lists the browser's installed wallets inside the WalletConnect modal and connects the one that is chosen. */
export async function showInjectedWallets(modal: WalletModal | null | undefined) {
  if (modal?.close) closeModal = () => modal.close();
  const wallets = await discoverInjectedWallets(200);
  const { ConnectionController, ConnectorController, OptionsController, RouterController } = await import("@reown/appkit-controllers");
  OptionsController.setEIP6963Enabled(true);
  OptionsController.setAllWallets("SHOW");
  for (const wallet of wallets) {
    ConnectorController.addConnector({
      id: `rvess:${wallet.info.rdns || wallet.info.uuid}`,
      type: "ANNOUNCED",
      name: wallet.info.name,
      imageUrl: wallet.info.icon || undefined,
      info: wallet.info,
      provider: wallet.provider as never,
      chain: "eip155",
    });
  }
  wrapConnect(ConnectionController, RouterController);
  showWalletList(modal);
}

function wrapConnect(
  ConnectionController: {
    _getClient: () => { connectExternal?: (options: InjectedConnector) => Promise<{ address?: string } | undefined> } | undefined;
  },
  RouterController: {
    push: (view: string, data?: { connector?: InjectedConnector }) => void;
  },
) {
  if (wrapped) return;
  wrapped = true;
  const client = ConnectionController._getClient();
  const original = client?.connectExternal?.bind(client);
  if (client) {
    client.connectExternal = async (options) => {
      const address = await connectIfInstalled(options);
      if (address) return { address };
      if (!original) throw new Error("This wallet could not be opened.");
      return original(options);
    };
  }
  const push = RouterController.push.bind(RouterController);
  RouterController.push = (view, data) => {
    if (view === "ConnectingExternal" && data?.connector && (data.connector.type === "ANNOUNCED" || data.connector.type === "INJECTED" || data.connector.id.startsWith("rvess:"))) {
      void connectIfInstalled(data.connector).catch(() => undefined);
      return;
    }
    push(view, data);
  };
}

async function connectIfInstalled(options: InjectedConnector) {
  const injected = options.provider;
  const installed = options.type === "ANNOUNCED" || options.type === "INJECTED" || options.id.startsWith("rvess:");
  if (!installed || !injected || typeof injected.request !== "function") return "";
  const accounts = await injected.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("The wallet did not return an account.");
  pending = injected;
  closeModal?.();
  return address;
}

function showWalletList(modal: WalletModal | null | undefined) {
  const mount = () => {
    const basic = queryDeep(document.querySelector("w3m-modal"), "W3M-CONNECTING-WC-BASIC-VIEW");
    if (basic?.shadowRoot) mountInstalledList(basic);
  };
  modal?.subscribeState?.((state) => {
    if (state.open) {
      mount();
      window.setTimeout(mount, 50);
      window.setTimeout(mount, 200);
    }
  });
  if (modal?.open && !originalOpen) originalOpen = modal.open.bind(modal);
  if (modal && originalOpen) {
    const open = async (options?: unknown) => {
      await originalOpen?.(options);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        mount();
        if (queryDeep(document.querySelector("w3m-modal"), "W3M-CONNECTOR-LIST")) return;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
    };
    modal.open = Object.assign(open, { rvess: true });
  }
  mount();
}

function mountInstalledList(basic: HTMLElement) {
  const root = basic.shadowRoot;
  if (!root || root.querySelector("w3m-connector-list")) return;
  const list = document.createElement("w3m-connector-list");
  const column = root.querySelector("wui-flex");
  (column ?? root).insertBefore(list, (column ?? root).firstChild);
}

function queryDeep(root: ParentNode | null, tag: string): HTMLElement | null {
  if (!root) return null;
  if (root instanceof HTMLElement && root.tagName === tag) return root;
  if (root instanceof Element && root.shadowRoot) {
    const nested = queryDeep(root.shadowRoot, tag);
    if (nested) return nested;
  }
  for (const el of root.querySelectorAll("*")) {
    if (el.tagName === tag) return el as HTMLElement;
    const nested = el.shadowRoot ? queryDeep(el.shadowRoot, tag) : null;
    if (nested) return nested;
  }
  return null;
}

const installed = new Map<string, Eip1193>();

export type InstalledWallet = { id: string; name: string };

/** Browser wallets announced on this page. The deployer connects to one of these directly. */
export function installedWallets(waitMs = 200): Promise<InstalledWallet[]> {
  return discoverInjectedWallets(waitMs).then((wallets) => {
    installed.clear();
    return wallets.map((wallet) => {
      const id = wallet.info.rdns || wallet.info.uuid;
      installed.set(id, wallet.provider);
      return { id, name: wallet.info.name };
    });
  });
}

/** Asks that installed wallet for the account it will sign with. */
export async function connectInstalled(id: string): Promise<Eip1193> {
  const provider = installed.get(id);
  if (!provider) throw new Error("That wallet is not available in this browser.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("The wallet did not return an account.");
  return provider;
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

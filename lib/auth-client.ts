"use client";

import { isAddress } from "viem";
import { openSession } from "@/lib/actions";
import { savePasskey, type SavedPasskey } from "@/lib/passkey-vault";

const testnet = process.env.NEXT_PUBLIC_RVESS_NETWORK === "sepolia";
const rpc = testnet
  ? process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://sepolia.base.org"
  : process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";

export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "fb48461bfb6043c40729e05706109f1a";

const baseWalletId = "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa";
const walletSourceKey = "rvess-wallet-source";

type EthereumProvider = Awaited<ReturnType<(typeof import("@walletconnect/ethereum-provider"))["default"]["init"]>>;
type WalletConnection = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  connect?: () => Promise<unknown>;
  connected?: boolean;
  accounts?: readonly string[];
};
type WalletSource = "base" | "wallet";

let providerPromise: Promise<EthereumProvider> | null = null;
let basePromise: Promise<WalletConnection> | null = null;
let baseReady: WalletConnection | null = null;
let chosen: WalletConnection | null = null;
let passkeyLibs: PasskeyLibs | null = null;

type PasskeyLibs = {
  createPublicClient: typeof import("viem").createPublicClient;
  http: typeof import("viem").http;
  chains: typeof import("viem/chains");
  accountAbstraction: typeof import("viem/account-abstraction");
  toKernelSmartAccount: typeof import("permissionless/accounts").toKernelSmartAccount;
};

function rememberSource(source: WalletSource) {
  try {
    localStorage.setItem(walletSourceKey, source);
  } catch {
    // A private browser can block storage. The connection still works until the page reloads.
  }
}

function rememberedSource(): WalletSource | null {
  try {
    const value = localStorage.getItem(walletSourceKey);
    return value === "base" || value === "wallet" ? value : null;
  } catch {
    return null;
  }
}

function injectedProvider(): WalletConnection | null {
  const ethereum = (window as Window & { ethereum?: WalletConnection & { providers?: WalletConnection[]; isCoinbaseWallet?: boolean } }).ethereum;
  if (!ethereum) return null;
  const list = ethereum.providers ?? [ethereum];
  return list.find((provider) => "isCoinbaseWallet" in provider && provider.isCoinbaseWallet) ?? ethereum;
}

function walletConnectProvider(): Promise<WalletConnection> {
  providerPromise ??= (async () => {
    const { base, baseSepolia } = await import("viem/chains");
    const chain = testnet ? baseSepolia : base;
    const { default: EthereumProvider } = await import("@walletconnect/ethereum-provider");
    return EthereumProvider.init({
      projectId: walletConnectProjectId,
      chains: [chain.id],
      showQrModal: true,
      metadata: {
        name: "RvessFlow",
        description: "Your money, in motion.",
        url: window.location.origin,
        icons: [`${window.location.origin}/icon-512.png`],
      },
      rpcMap: { [chain.id]: rpc },
      qrModalOptions: {
        themeMode: "light",
        enableExplorer: true,
        enableMobileFullScreen: true,
        explorerRecommendedWalletIds: [baseWalletId],
        mobileWallets: [
          {
            id: "rvess-base",
            name: "Base",
            links: { native: "cbwallet://wc", universal: "https://go.cb-w.com/wc" },
          },
        ],
      },
    });
  })();
  return providerPromise as Promise<WalletConnection>;
}

function baseAccountProvider(): Promise<WalletConnection> {
  if (baseReady) return Promise.resolve(baseReady);
  if (!basePromise) {
    basePromise = (async () => {
      const { createBaseAccountSDK } = await import("@base-org/account/browser");
      const { base, baseSepolia } = await import("viem/chains");
      const chain = testnet ? baseSepolia : base;
      const sdk = createBaseAccountSDK({
        appName: "RvessFlow",
        appLogoUrl: `${window.location.origin}/icon-512.png`,
        appChainIds: [chain.id],
      });
      const provider = sdk.getProvider();
      const connection = {
        request: (args: { method: string; params?: unknown }) => provider.request({ method: args.method, params: Array.isArray(args.params) || (args.params !== null && typeof args.params === "object") ? args.params : undefined }),
      };
      baseReady = connection;
      return connection;
    })();
  }
  return basePromise;
}

function loadPasskeyLibs(): Promise<PasskeyLibs> {
  if (passkeyLibs) return Promise.resolve(passkeyLibs);
  return Promise.all([
    import("viem"),
    import("viem/chains"),
    import("viem/account-abstraction"),
    import("permissionless/accounts"),
  ]).then(([viem, chains, accountAbstraction, accounts]) => {
    passkeyLibs = {
      createPublicClient: viem.createPublicClient,
      http: viem.http,
      chains,
      accountAbstraction,
      toKernelSmartAccount: accounts.toKernelSmartAccount,
    };
    return passkeyLibs;
  });
}

/** Loads the passkey and Coinbase sign-in code before the click, so the prompt can open immediately. */
export function prepareSignIn(): Promise<void> {
  return Promise.all([loadPasskeyLibs(), baseAccountProvider()]).then(() => undefined);
}

export function walletProvider(): Promise<WalletConnection> {
  if (chosen) return Promise.resolve(chosen);
  if (rememberedSource() === "base") {
    return baseAccountProvider().then((provider) => {
      chosen = provider;
      return provider;
    });
  }
  return walletConnectProvider().then((provider) => {
    chosen = provider;
    return provider;
  });
}

export function createPasskeyWallet(label: string): Promise<{ address: string; label: string }> {
  const name = label.trim().slice(0, 32) || "Passkey";
  const ready = passkeyLibs;
  if (!ready) return Promise.reject(new Error("Passkey setup is still loading. Try again in a moment."));
  const credentialPromise = ready.accountAbstraction.createWebAuthnCredential({
    name,
    rp: { name: "RvessFlow", id: window.location.hostname },
  });
  return credentialPromise.then(async (credential) => {
    const owner = ready.accountAbstraction.toWebAuthnAccount({
      credential,
      rpId: window.location.hostname,
    });
    const account = await ready.toKernelSmartAccount({
      client: ready.createPublicClient({ chain: testnet ? ready.chains.baseSepolia : ready.chains.base, transport: ready.http(rpc) }),
      owners: [owner],
      version: "0.3.1",
      entryPoint: { address: ready.accountAbstraction.entryPoint07Address, version: "0.7" },
    });
    await savePasskey({
      id: credential.id,
      publicKey: credential.publicKey,
      address: account.address,
      label: name,
    });
    return { address: account.address, label: name };
  });
}

function bytesFromId(id: string): ArrayBuffer {
  const padded = id.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (id.length % 4)) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

/** Starts the passkey prompt. Call this directly from the click, before any await. */
export function requestPasskey(ids: string[]): Promise<string> {
  if (typeof window.PublicKeyCredential === "undefined") throw new Error("This browser cannot use a passkey.");
  const challenge = new ArrayBuffer(32);
  crypto.getRandomValues(new Uint8Array(challenge));
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: window.location.hostname,
    timeout: 60_000,
    userVerification: "required",
  };
  if (ids.length > 0) publicKey.allowCredentials = ids.map((id) => ({ type: "public-key", id: bytesFromId(id) }));
  return Promise.resolve(navigator.credentials.get({ publicKey })).then((credential) => {
    if (!credential || credential.type !== "public-key") throw new Error("The passkey prompt closed before an account was chosen.");
    return credential.id;
  });
}

export async function finishPasskey(saved: SavedPasskey[], id: string) {
  const match = saved.find((item) => item.id === id);
  if (!match) {
    throw new Error(
      saved.length === 0
        ? "That passkey is on this device, but this browser does not have the account saved with it. Use the browser where you created it, or Connect Base if it is a Coinbase passkey."
        : "That passkey does not match an account saved in this browser.",
    );
  }
  await openSession(match.address, "passkey", match.label);
}

async function accountFrom(provider: WalletConnection): Promise<string> {
  const listed = provider.accounts?.[0];
  if (listed && isAddress(listed)) return listed;
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
  if (!isAddress(address)) throw new Error("The wallet did not return an account.");
  return address;
}

function rememberConnection(provider: WalletConnection, source: WalletSource, address: string) {
  chosen = provider;
  rememberSource(source);
  return address;
}

/** Starts the Coinbase prompt. Call this directly from the click, before any await. */
export function requestBaseAccount(): Promise<string> {
  const ready = baseReady;
  if (ready) return accountFrom(ready).then((address) => rememberConnection(ready, "base", address));
  return baseAccountProvider().then((provider) => accountFrom(provider).then((address) => rememberConnection(provider, "base", address)));
}

/** Starts the wallet prompt. Call this directly from the click, before any await. */
export function requestWalletAccount(): Promise<string> {
  const injected = injectedProvider();
  if (injected) {
    return accountFrom(injected).then((address) => rememberConnection(injected, "wallet", address));
  }
  return connectWalletConnect();
}

async function connectWalletConnect(): Promise<string> {
  if (!walletConnectProjectId) throw new Error("WalletConnect is not configured.");
  const provider = await walletConnectProvider();
  if (!provider.connected) await provider.connect?.();
  const address = provider.accounts?.[0];
  if (!address || !isAddress(address)) throw new Error("The wallet did not return an account.");
  return rememberConnection(provider, "wallet", address);
}

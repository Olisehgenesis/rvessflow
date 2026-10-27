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
let chosen: WalletConnection | null = null;

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
      return {
        request: (args) => provider.request({ method: args.method, params: Array.isArray(args.params) || (args.params !== null && typeof args.params === "object") ? args.params : undefined }),
      };
    })();
  }
  return basePromise;
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

export async function createPasskeyWallet(label: string): Promise<{ address: string; label: string }> {
  const name = label.trim().slice(0, 32) || "Passkey";
  const [{ createPublicClient, http }, chains, accountAbstraction, { toKernelSmartAccount }] = await Promise.all([
    import("viem"),
    import("viem/chains"),
    import("viem/account-abstraction"),
    import("permissionless/accounts"),
  ]);
  const credential = await accountAbstraction.createWebAuthnCredential({
    name,
    rp: { name: "RvessFlow", id: window.location.hostname },
  });
  const owner = accountAbstraction.toWebAuthnAccount({
    credential,
    rpId: window.location.hostname,
  });
  const account = await toKernelSmartAccount({
    client: createPublicClient({ chain: testnet ? chains.baseSepolia : chains.base, transport: http(rpc) }),
    owners: [owner],
    version: "0.3.1",
    entryPoint: { address: accountAbstraction.entryPoint07Address, version: "0.7" },
  });
  await savePasskey({
    id: credential.id,
    publicKey: credential.publicKey,
    address: account.address,
    label: name,
  });
  return { address: account.address, label: name };
}

export async function unlockPasskey(saved: SavedPasskey) {
  const accountAbstraction = await import("viem/account-abstraction");
  const owner = accountAbstraction.toWebAuthnAccount({
    credential: { id: saved.id, publicKey: saved.publicKey },
    rpId: window.location.hostname,
  });
  await owner.signMessage({ message: "Sign in to RvessFlow" });
  await openSession(saved.address, "passkey", saved.label);
}

async function accountFrom(provider: WalletConnection): Promise<string> {
  const listed = provider.accounts?.[0];
  if (listed && isAddress(listed)) return listed;
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
  if (!isAddress(address)) throw new Error("The wallet did not return an account.");
  return address;
}

export async function connectBase(label = "") {
  const provider = await baseAccountProvider();
  const address = await accountFrom(provider);
  chosen = provider;
  rememberSource("base");
  await openSession(address, "wallet", label);
}

export async function connectWallet(label = "") {
  const injected = injectedProvider();
  if (injected) {
    const address = await accountFrom(injected);
    chosen = injected;
    rememberSource("wallet");
    await openSession(address, "wallet", label);
    return;
  }
  if (!walletConnectProjectId) throw new Error("WalletConnect is not configured.");
  const provider = await walletConnectProvider();
  if (!provider.connected) await provider.connect?.();
  const address = provider.accounts?.[0];
  if (!address || !isAddress(address)) throw new Error("The wallet did not return an account.");
  chosen = provider;
  rememberSource("wallet");
  await openSession(address, "wallet", label);
}

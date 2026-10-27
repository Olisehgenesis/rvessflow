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

type EthereumProvider = Awaited<ReturnType<(typeof import("@walletconnect/ethereum-provider"))["default"]["init"]>>;
type WalletConnection = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  connect?: () => Promise<unknown>;
  connected?: boolean;
  accounts?: readonly string[];
};

let providerPromise: Promise<EthereumProvider> | null = null;
let chosen: WalletConnection | null = null;

function injectedProvider(): WalletConnection | null {
  const ethereum = (window as Window & { ethereum?: WalletConnection & { providers?: WalletConnection[]; isCoinbaseWallet?: boolean } }).ethereum;
  if (!ethereum) return null;
  const list = ethereum.providers ?? [ethereum];
  return list.find((provider) => "isCoinbaseWallet" in provider && provider.isCoinbaseWallet) ?? ethereum;
}

export function walletProvider(): Promise<WalletConnection> {
  if (chosen) return Promise.resolve(chosen);
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

export async function connectWallet(label = "") {
  const injected = injectedProvider();
  if (injected) {
    chosen = injected;
    await openSession(await accountFrom(injected), "wallet", label);
    return;
  }
  if (!walletConnectProjectId) throw new Error("WalletConnect is not configured.");
  const provider = await walletProvider();
  chosen = provider;
  if (!provider.connected) await provider.connect?.();
  const address = provider.accounts?.[0];
  if (!address || !isAddress(address)) throw new Error("The wallet did not return an account.");
  await openSession(address, "wallet", label);
}

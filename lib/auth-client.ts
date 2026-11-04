"use client";

import { isAddress, toHex } from "viem";
import { openSession } from "@/lib/actions";
import { passkeySignedByHex, publicKeyHex, recoverSigningKey } from "@/lib/passkey-match";
import { recoverPasskey } from "@/lib/passkey-recover";
import type { PasskeyProof } from "@/lib/passkey-proof";
import { samePasskeyId } from "@/lib/passkey-proof";
import { readPasskeys, savePasskey, type SavedPasskey } from "@/lib/passkey-vault";
import { appChain, appRpc, walletNetwork } from "@/lib/network";
import { clearInjectedConnection, restoreInjected } from "@/lib/wallet-injected";
import { pickWallet } from "@/lib/wallet-picker";

export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "fb48461bfb6043c40729e05706109f1a";

type EthereumProvider = Awaited<ReturnType<(typeof import("@walletconnect/ethereum-provider"))["default"]["init"]>>;
type WalletConnection = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  connect?: () => Promise<unknown>;
  connected?: boolean;
  accounts?: readonly string[];
  session?: unknown;
};

let providerPromise: Promise<EthereumProvider> | null = null;
let chosen: WalletConnection | null = null;
let passkeyLibs: PasskeyLibs | null = null;

type PasskeyLibs = {
  createPublicClient: typeof import("viem").createPublicClient;
  http: typeof import("viem").http;
  chains: typeof import("viem/chains");
  accountAbstraction: typeof import("viem/account-abstraction");
  toKernelSmartAccount: typeof import("permissionless/accounts").toKernelSmartAccount;
};

function walletConnectProvider(): Promise<WalletConnection> {
  providerPromise ??= (async () => {
    const chain = appChain();
    const { default: EthereumProvider } = await import("@walletconnect/ethereum-provider");
    return EthereumProvider.init({
      projectId: walletConnectProjectId,
      chains: [chain.id],
      showQrModal: false,
      metadata: {
        name: "Rvess",
        description: "Money moving, on your terms.",
        url: window.location.origin,
        icons: [`${window.location.origin}/icon-512.png`],
      },
      rpcMap: { [chain.id]: appRpc() },
    });
  })();
  return providerPromise as Promise<WalletConnection>;
}

export async function hasWalletConnectSession() {
  const provider = await walletConnectProvider();
  return Boolean(provider.session);
}

export async function pairWalletConnect(onUri: (uri: string) => void, signal?: AbortSignal): Promise<WalletConnection> {
  const provider = (await walletConnectProvider()) as EthereumProvider;
  if (provider.session) return provider as WalletConnection;
  const show = (uri: string) => onUri(uri);
  provider.on("display_uri", show);
  const abort = () => {
    void provider.disconnect().catch(() => undefined);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await provider.connect();
    return provider as WalletConnection;
  } finally {
    signal?.removeEventListener("abort", abort);
    provider.removeListener("display_uri", show);
  }
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

/** Loads the passkey code and the WalletConnect provider before the click, so the prompt can open immediately. */
export function prepareSignIn(): Promise<void> {
  return Promise.all([loadPasskeyLibs(), walletConnectProvider()]).then(() => undefined);
}

/** The WalletConnect provider. External wallets are reached only through it. */
export function walletProvider(): Promise<WalletConnection> {
  if (chosen) return Promise.resolve(chosen);
  return walletConnectProvider().then((provider) => {
    chosen = provider;
    return provider;
  });
}

function sessionAccounts(provider: WalletConnection): string[] {
  const session = provider.session as { namespaces?: Record<string, { accounts?: string[] }> } | undefined;
  if (!session?.namespaces) return [];
  return Object.values(session.namespaces).flatMap((item) =>
    (item.accounts ?? []).map((id) => {
      const parts = id.split(":");
      return parts[2] || parts[parts.length - 1] || "";
    }),
  );
}

async function accountsOf(provider: WalletConnection): Promise<string[]> {
  if (provider.accounts?.length) return [...provider.accounts];
  const fromSession = sessionAccounts(provider).filter(Boolean);
  if (fromSession.length) return fromSession;
  const listed = await provider.request({ method: "eth_accounts" }).catch(() => []);
  return Array.isArray(listed) ? listed.map(String) : [];
}

async function matchesWallet(provider: WalletConnection, address: string): Promise<boolean> {
  const want = address.toLowerCase();
  return (await accountsOf(provider)).some((item) => item.toLowerCase() === want);
}

/**
 * Signs with the wallet already on this account. Does not open WalletConnect
 * when a session or an authorized injected wallet is still there.
 */
export async function readyWallet(address: string): Promise<WalletConnection> {
  if (chosen && (await matchesWallet(chosen, address))) return chosen;
  const injected = await restoreInjected(address);
  if (injected && (await matchesWallet(injected, address))) {
    rememberConnection(injected, address);
    return injected;
  }
  const provider = await walletConnectProvider();
  if (provider.session && (await matchesWallet(provider, address))) {
    rememberConnection(provider, address);
    return provider;
  }
  throw new Error("Reconnect the wallet for this account.");
}

export function createPasskeyWallet(label: string): Promise<{ address: string; label: string }> {
  const name = label.trim().slice(0, 32) || "Passkey";
  const ready = passkeyLibs;
  if (!ready) return Promise.reject(new Error("Passkey setup is still loading. Try again in a moment."));
  const credentialPromise = ready.accountAbstraction.createWebAuthnCredential({
    name,
    rp: { name: "Rvess", id: window.location.hostname },
  });
  return credentialPromise.then(async (credential) => {
    const owner = ready.accountAbstraction.toWebAuthnAccount({
      credential,
      rpId: window.location.hostname,
    });
    const account = await ready.toKernelSmartAccount({
      client: ready.createPublicClient({ chain: appChain(), transport: ready.http(appRpc()) }),
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
export function requestPasskey(ids: string[]): Promise<PasskeyProof> {
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
    const passkey = credential as PublicKeyCredential;
    const response = passkey.response as AuthenticatorAssertionResponse;
    return {
      id: passkey.id,
      authenticatorData: toHex(new Uint8Array(response.authenticatorData)),
      clientDataJSON: new TextDecoder().decode(response.clientDataJSON),
      signature: toHex(new Uint8Array(response.signature)),
    };
  });
}

async function accountFromKey(id: string, publicKey: SavedPasskey["publicKey"], label: string): Promise<SavedPasskey> {
  const ready = passkeyLibs ?? (await loadPasskeyLibs());
  const owner = ready.accountAbstraction.toWebAuthnAccount({
    credential: { id, publicKey },
    rpId: window.location.hostname,
  });
  const account = await ready.toKernelSmartAccount({
    client: ready.createPublicClient({
      chain: appChain(),
      transport: ready.http(appRpc()),
    }),
    owners: [owner],
    version: "0.3.1",
    entryPoint: { address: ready.accountAbstraction.entryPoint07Address, version: "0.7" },
  });
  return { id, publicKey, address: account.address, label };
}

export async function finishPasskey(saved: SavedPasskey[], proof: PasskeyProof) {
  const fresh = await readPasskeys().catch(() => [] as SavedPasskey[]);
  const known = [...fresh, ...saved];
  const rpId = window.location.hostname;
  const byId = known.find((item) => samePasskeyId(item.id, proof.id));
  let record = byId ?? null;
  if (!record) {
    const key = recoverSigningKey(proof, rpId);
    if (key) {
      const publicKey = publicKeyHex(key.x, key.y);
      const named = known.find((item) => item.publicKey.toLowerCase() === publicKey.toLowerCase());
      record = await accountFromKey(proof.id, publicKey, named?.label || "Passkey");
    }
  }
  if (!record) {
    const restored = await recoverPasskey(proof);
    if (restored && (passkeySignedByHex(restored.publicKey, proof, rpId) || samePasskeyId(restored.id, proof.id))) record = restored;
  }
  if (!record) {
    throw new Error("This passkey is on this device, but the account could not be opened. Try again, or connect the wallet through WalletConnect.");
  }
  await savePasskey(record);
  await openSession(record.address, "passkey", record.label);
}

async function accountFrom(provider: WalletConnection): Promise<string> {
  const listed = provider.accounts?.[0];
  if (listed && isAddress(listed)) return listed;
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
  if (!isAddress(address)) throw new Error("The wallet did not return an account.");
  return address;
}

function rememberConnection(provider: WalletConnection, address: string) {
  chosen = provider;
  return address;
}

const baseNetwork = walletNetwork();

function rejected(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && Number(error.code) === 4001;
}

/** Asks the wallet chosen in WalletConnect to switch to Base or add it. */
async function joinBase(provider: WalletConnection) {
  const current = await provider.request({ method: "eth_chainId" }).catch(() => null);
  if (typeof current === "string" && current.toLowerCase() === baseNetwork.chainId) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: baseNetwork.chainId }] });
    return;
  } catch (error) {
    if (rejected(error)) throw error;
  }
  try {
    await provider.request({ method: "wallet_addEthereumChain", params: [baseNetwork] });
  } catch (error) {
    if (rejected(error)) throw error;
  }
}

/** Opens WalletConnect. Every external wallet, including Base, is chosen there. */
export function requestWalletAccount(): Promise<string> {
  return connectWalletConnect("base");
}

/** Opens WalletConnect for a Celo signature. Does not switch the wallet onto Base first. */
export function requestCeloWalletAccount(): Promise<string> {
  return connectWalletConnect("celo");
}

async function connectWalletConnect(network: "base" | "celo"): Promise<string> {
  if (!walletConnectProjectId) throw new Error("WalletConnect is not configured.");
  clearInjectedConnection();
  const picked = await pickWallet(network);
  const active: WalletConnection = picked.kind === "injected" ? picked.provider : await walletConnectProvider();
  if (network === "base") await joinBase(active);
  const address = active.accounts?.[0];
  if (address && isAddress(address)) return rememberConnection(active, address);
  return rememberConnection(active, await accountFrom(active));
}

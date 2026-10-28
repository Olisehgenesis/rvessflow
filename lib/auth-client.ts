"use client";

import { isAddress, toHex } from "viem";
import { openSession } from "@/lib/actions";
import { passkeySignedByHex, publicKeyHex, recoverSigningKey } from "@/lib/passkey-match";
import { recoverPasskey } from "@/lib/passkey-recover";
import type { PasskeyProof } from "@/lib/passkey-proof";
import { samePasskeyId } from "@/lib/passkey-proof";
import { readPasskeys, savePasskey, type SavedPasskey } from "@/lib/passkey-vault";
import { appChain, appNetwork, appRpc, walletNetwork } from "@/lib/network";
import { clearInjectedConnection, peekInjectedConnection, showInjectedWallets, takeInjectedConnection } from "@/lib/wallet-injected";

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
    const baseWallets = appNetwork() === "celo"
      ? {}
      : {
          explorerRecommendedWalletIds: [baseWalletId],
          mobileWallets: [
            {
              id: "rvess-base",
              name: "Base",
              links: { native: "cbwallet://wc", universal: "https://go.cb-w.com/wc" },
            },
          ],
          desktopWallets: [
            {
              id: "rvess-base",
              name: "Base",
              links: { native: "cbwallet://wc", universal: "https://go.cb-w.com/wc" },
            },
          ],
        };
    return EthereumProvider.init({
      projectId: walletConnectProjectId,
      chains: [chain.id],
      showQrModal: true,
      metadata: {
        name: "Rvess",
        description: "Your money, in motion.",
        url: window.location.origin,
        icons: [`${window.location.origin}/icon-512.png`],
      },
      rpcMap: { [chain.id]: appRpc() },
      qrModalOptions: {
        themeMode: "light",
        enableExplorer: true,
        enableMobileFullScreen: true,
        ...baseWallets,
      },
    });
  })();
  return providerPromise as Promise<WalletConnection>;
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
  return connectWalletConnect();
}

async function connectWalletConnect(): Promise<string> {
  if (!walletConnectProjectId) throw new Error("WalletConnect is not configured.");
  const provider = await walletConnectProvider();
  clearInjectedConnection();
  const modal = (provider as { modal?: { close: () => void } }).modal;
  await showInjectedWallets(modal);
  try {
    if (!provider.connected) await provider.connect?.();
  } catch (error) {
    if (!peekInjectedConnection()) throw error;
  }
  const active: WalletConnection = takeInjectedConnection() ?? provider;
  await joinBase(active);
  const address = active.accounts?.[0];
  if (address && isAddress(address)) return rememberConnection(active, address);
  return rememberConnection(active, await accountFrom(active));
}

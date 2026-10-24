"use client";

import { isAddress } from "viem";
import { openSession } from "@/lib/actions";
import { savePasskey, type SavedPasskey } from "@/lib/passkey-vault";

const rpc = "https://sepolia.base.org";

export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "fb48461bfb6043c40729e05706109f1a";

export async function createPasskeyWallet(label: string): Promise<{ address: string; label: string }> {
  const name = label.trim().slice(0, 32) || "Passkey";
  const [{ createPublicClient, http }, { baseSepolia }, accountAbstraction, { toKernelSmartAccount }] = await Promise.all([
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
    client: createPublicClient({ chain: baseSepolia, transport: http(rpc) }),
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

export async function connectWallet(label = "") {
  if (!walletConnectProjectId) throw new Error("WalletConnect is not configured.");
  const { baseSepolia } = await import("viem/chains");
  const { default: EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const provider = await EthereumProvider.init({
    projectId: walletConnectProjectId,
    chains: [baseSepolia.id],
    showQrModal: true,
    metadata: {
      name: "RvessFlow",
      description: "Your money, in motion.",
      url: window.location.origin,
      icons: [`${window.location.origin}/mark.svg`],
    },
    rpcMap: { [baseSepolia.id]: rpc },
  });
  await provider.connect();
  const address = provider.accounts[0];
  if (!address || !isAddress(address)) throw new Error("The wallet did not return an account.");
  await openSession(address, "wallet", label);
}

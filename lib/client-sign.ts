"use client";

import { createPublicClient, http, type Address, type Hash, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { walletProvider } from "@/lib/auth-client";
import type { PreparedCall, SignPayload } from "@/lib/intent";
import { readPasskeys } from "@/lib/passkey-vault";

const testnet = process.env.NEXT_PUBLIC_RVESS_NETWORK === "sepolia";
const rpc = testnet
  ? process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://sepolia.base.org"
  : process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";

const client = createPublicClient({ chain: testnet ? baseSepolia : base, transport: http(rpc) });

async function wait(hash: Hash) {
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("The transaction reverted.");
}

function txValue(value: string | undefined): Hex | undefined {
  if (!value || value === "0") return undefined;
  return `0x${BigInt(value).toString(16)}`;
}

async function onAppChain(provider: Awaited<ReturnType<typeof walletProvider>>) {
  const chainId = testnet ? "0x14a34" : "0x2105";
  const current = await provider.request({ method: "eth_chainId" });
  if (typeof current === "string" && current.toLowerCase() === chainId) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        testnet
          ? {
              chainId,
              chainName: "Base Sepolia",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
            }
          : {
              chainId,
              chainName: "Base",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://mainnet.base.org"],
              blockExplorerUrls: ["https://basescan.org"],
            },
      ],
    });
  }
}

async function sendWallet(calls: PreparedCall[], from: Address, onHash?: (hash: Hash) => void) {
  const provider = await walletProvider();
  if (!provider.connected) await provider.connect();
  await onAppChain(provider);
  const account = provider.accounts[0];
  if (!account || account.toLowerCase() !== from.toLowerCase()) {
    throw new Error("Reconnect the wallet for this account.");
  }
  let last: Hash | undefined;
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    const value = txValue(call.value);
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [{ from, to: call.to, data: call.data, ...(value ? { value } : {}) }],
    })) as Hash;
    last = hash;
    if (index === calls.length - 1) onHash?.(hash);
    await wait(hash);
  }
  return last;
}

async function sendPasskey(calls: PreparedCall[], from: Address, onHash?: (hash: Hash) => void) {
  const bundler = process.env.NEXT_PUBLIC_BUNDLER_URL;
  if (!bundler) {
    throw new Error("Passkey payments need a bundler. Set NEXT_PUBLIC_BUNDLER_URL to a Base bundler that accepts user operations.");
  }
  const saved = (await readPasskeys()).find((item) => item.address.toLowerCase() === from.toLowerCase());
  if (!saved) throw new Error("This browser does not have the passkey for this account. Sign in again on this device.");
  const [{ createPublicClient: createClient, http: transport }, accountAbstraction, { toKernelSmartAccount }, { createSmartAccountClient }] =
    await Promise.all([
      import("viem"),
      import("viem/account-abstraction"),
      import("permissionless/accounts"),
      import("permissionless"),
    ]);
  const owner = accountAbstraction.toWebAuthnAccount({
    credential: { id: saved.id, publicKey: saved.publicKey },
    rpId: window.location.hostname,
  });
  const publicClient = createClient({ chain: base, transport: transport(rpc) });
  const account = await toKernelSmartAccount({
    client: publicClient,
    owners: [owner],
    version: "0.3.1",
    entryPoint: { address: accountAbstraction.entryPoint07Address, version: "0.7" },
  });
  if (account.address.toLowerCase() !== from.toLowerCase()) {
    throw new Error("This passkey does not match the signed-in account.");
  }
  const smart = createSmartAccountClient({
    account,
    chain: base,
    bundlerTransport: transport(bundler),
    client: publicClient,
  });
  const hash = await smart.sendTransaction({
    calls: calls.map((call) => ({
      to: call.to,
      data: call.data,
      value: BigInt(call.value || "0"),
    })),
  });
  onHash?.(hash);
  await wait(hash);
  return hash;
}

export async function depositReceipt(hash: Hash): Promise<{ status: "pending" | "success" | "reverted"; timestamp?: number }> {
  try {
    const receipt = await client.getTransactionReceipt({ hash });
    if (receipt.status !== "success") return { status: "reverted" };
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    return { status: "success", timestamp: Number(block.timestamp) };
  } catch {
    return { status: "pending" };
  }
}

export async function sendCalls(sign: Pick<SignPayload, "calls" | "method" | "address">, options?: { onHash?: (hash: Hash) => void }) {
  if (!sign.calls.length) return;
  if (sign.method === "passkey") return sendPasskey(sign.calls, sign.address, options?.onHash);
  return sendWallet(sign.calls, sign.address, options?.onHash);
}

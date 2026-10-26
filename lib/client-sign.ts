"use client";

import { createPublicClient, http, type Address, type Hash, type Hex } from "viem";
import { base } from "viem/chains";
import { walletProvider } from "@/lib/auth-client";
import type { PreparedCall, SignPayload } from "@/lib/intent";
import { readPasskeys } from "@/lib/passkey-vault";

const rpc = process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";

const client = createPublicClient({ chain: base, transport: http(rpc) });

async function wait(hash: Hash) {
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("The transaction reverted.");
}

function txValue(value: string | undefined): Hex | undefined {
  if (!value || value === "0") return undefined;
  return `0x${BigInt(value).toString(16)}`;
}

async function sendWallet(calls: PreparedCall[], from: Address) {
  const provider = await walletProvider();
  if (!provider.connected) await provider.connect();
  const account = provider.accounts[0];
  if (!account || account.toLowerCase() !== from.toLowerCase()) {
    throw new Error("Reconnect the wallet for this account.");
  }
  for (const call of calls) {
    const value = txValue(call.value);
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [{ from, to: call.to, data: call.data, ...(value ? { value } : {}) }],
    })) as Hash;
    await wait(hash);
  }
}

async function sendPasskey(calls: PreparedCall[], from: Address) {
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
  await wait(hash);
}

export async function sendCalls(sign: Pick<SignPayload, "calls" | "method" | "address">) {
  if (!sign.calls.length) return;
  if (sign.method === "passkey") {
    await sendPasskey(sign.calls, sign.address);
    return;
  }
  await sendWallet(sign.calls, sign.address);
}

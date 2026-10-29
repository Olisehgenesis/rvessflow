"use client";

import { createPublicClient, encodePacked, erc20Abi, http, maxUint256, parseErc6492Signature, type Address, type Hash, type Hex, type PublicClient } from "viem";
import { base as baseChain, celo as celoChain } from "viem/chains";
import { walletProvider } from "@/lib/auth-client";
import { appChain, appNetwork, appRpc, walletNetwork } from "@/lib/network";
import type { PreparedCall, SignPayload } from "@/lib/intent";
import { readPasskeys } from "@/lib/passkey-vault";
import { estimationSkipped, passkeyPaysWith, usdcCanPayFee, userOpCost } from "@/lib/passkey-fee";
import { celoFeeTx, pickCeloFee } from "@/lib/celo-fee";
import { batchId, batchOutcome, batchUnsupported, walletSendCallsParam } from "@/lib/wallet-batch";

const network = appNetwork();
const chain = appChain();
const rpc = appRpc();
const bundlerUrl = process.env.NEXT_PUBLIC_BUNDLER_URL || `https://public.pimlico.io/v2/${chain.id}/rpc`;
const circlePaymaster = (network === "sepolia" ? "0x31BE08D380A21fc740883c0BC434FcFc88740b58" : "0x6C973eBe80dCD8660841D4356bf15c32460271C9") as Address;
const circleUsdc = (network === "sepolia" ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e" : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as Address;
const permitAmount = 10_000_000n;
const permitAbi = [
  ...erc20Abi,
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

const client = createPublicClient({ chain, transport: http(rpc) });

async function waitForBatch(provider: Awaited<ReturnType<typeof walletProvider>>, id: string): Promise<Hash> {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const outcome = batchOutcome(await provider.request({ method: "wallet_getCallsStatus", params: [id] }));
    if (outcome.error) throw new Error(outcome.error);
    if (outcome.hash) return outcome.hash;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("The wallet accepted the transaction, but it has not confirmed yet. Refresh in a moment.");
}

async function wait(hash: Hash, reader: Pick<PublicClient, "waitForTransactionReceipt"> = client) {
  const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("The transaction reverted.");
}

function settlement(chainId?: number) {
  if (chainId === 42220 && chain.id !== 42220) {
    const rpcUrl = process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org";
    return {
      id: 42220,
      reader: createPublicClient({ chain: celoChain, transport: http(rpcUrl) }),
      params: {
        chainId: "0xa4ec",
        chainName: "Celo",
        nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
        rpcUrls: [rpcUrl],
        blockExplorerUrls: ["https://celoscan.io"],
      },
    };
  }
  if (chainId === 8453 && chain.id !== 8453) {
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";
    return {
      id: 8453,
      reader: createPublicClient({ chain: baseChain, transport: http(rpcUrl) }),
      params: {
        chainId: "0x2105",
        chainName: "Base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [rpcUrl],
        blockExplorerUrls: ["https://basescan.org"],
      },
    };
  }
  return { id: chain.id, reader: client, params: walletNetwork() };
}

function txValue(value: string | undefined): Hex | undefined {
  if (!value || value === "0") return undefined;
  return `0x${BigInt(value).toString(16)}`;
}

async function onChain(
  provider: Awaited<ReturnType<typeof walletProvider>>,
  target: { chainId: string; chainName: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: string[]; blockExplorerUrls: string[] },
) {
  const current = await provider.request({ method: "eth_chainId" });
  if (typeof current === "string" && current.toLowerCase() === target.chainId.toLowerCase()) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target.chainId }] });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
    if (code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [target] });
  }
}

async function sendWallet(calls: PreparedCall[], from: Address, where: ReturnType<typeof settlement>, onHash?: (hash: Hash) => void) {
  const provider = await walletProvider();
  if (!provider.connected && provider.connect) await provider.connect();
  await onChain(provider, where.params);
  const listed = provider.accounts?.[0];
  const accounts = listed ? null : ((await provider.request({ method: "eth_accounts" })) as string[] | undefined);
  const found = listed || accounts?.[0] || "";
  if (!found || found.toLowerCase() !== from.toLowerCase()) {
    throw new Error("Reconnect the wallet for this account.");
  }
  const fee = where.id === 42220 ? await pickCeloFee(where.reader, from) : null;
  const feeFields = celoFeeTx(fee?.feeCurrency);
  if (calls.length > 1 && !fee) {
    let id: string | null = null;
    try {
      id = batchId(
        await provider.request({
          method: "wallet_sendCalls",
          params: [walletSendCallsParam(from, where.id, calls)],
        }),
      );
    } catch (error) {
      if (!batchUnsupported(error)) throw error;
    }
    if (id) {
      const hash = await waitForBatch(provider, id);
      onHash?.(hash);
      await wait(hash, where.reader);
      return hash;
    }
  }
  let last: Hash | undefined;
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    const value = txValue(call.value);
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [{ from, to: call.to, data: call.data, ...(value ? { value } : {}), ...feeFields }],
    })) as Hash;
    last = hash;
    if (index === calls.length - 1) onHash?.(hash);
    await wait(hash, where.reader);
  }
  return last;
}

async function sendPasskey(calls: PreparedCall[], from: Address, onHash?: (hash: Hash) => void) {
  const saved = (await readPasskeys()).find((item) => item.address.toLowerCase() === from.toLowerCase());
  if (!saved) throw new Error("This browser does not have the passkey for this account. Sign in again on this device.");
  const [{ createPublicClient: createClient, http: transport }, accountAbstraction, { toKernelSmartAccount }, { createSmartAccountClient }, { getUserOperationGasPrice }] =
    await Promise.all([
      import("viem"),
      import("viem/account-abstraction"),
      import("permissionless/accounts"),
      import("permissionless"),
      import("permissionless/actions/pimlico"),
    ]);
  const owner = accountAbstraction.toWebAuthnAccount({
    credential: { id: saved.id, publicKey: saved.publicKey },
    rpId: window.location.hostname,
  });
  const publicClient = createClient({ chain, transport: transport(rpc) });
  const account = await toKernelSmartAccount({
    client: publicClient,
    owners: [owner],
    version: "0.3.1",
    entryPoint: { address: accountAbstraction.entryPoint07Address, version: "0.7" },
  });
  if (account.address.toLowerCase() !== from.toLowerCase()) {
    throw new Error("This passkey does not match the signed-in account.");
  }
  const pimlico = createClient({ chain, transport: transport(bundlerUrl) });
  const batched = calls.map((call) => ({
    to: call.to,
    data: call.data,
    value: BigInt(call.value || "0"),
  }));
  const userOperation = {
    estimateFeesPerGas: async () => (await getUserOperationGasPrice(pimlico)).fast,
  };
  const smart = createSmartAccountClient({
    account,
    chain,
    bundlerTransport: transport(bundlerUrl),
    client: publicClient,
    userOperation,
  });
  const [ethBalance, usdcBalance] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    network === "celo"
      ? Promise.resolve(0n)
      : publicClient.readContract({ address: circleUsdc, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
  ]);
  if (network === "celo") {
    if (ethBalance === 0n) throw new Error("This account needs CELO for the network fee.");
    const hash = await smart.sendTransaction({ calls: batched });
    onHash?.(hash);
    await wait(hash);
    return hash;
  }
  let ethCost: bigint | null = null;
  if (!usdcCanPayFee(usdcBalance) && ethBalance > 0n) {
    try {
      ethCost = userOpCost(await smart.prepareUserOperation({ calls: batched }));
    } catch (error) {
      if (!estimationSkipped(error)) throw error;
    }
  }
  if (passkeyPaysWith({ ethBalance, ethCost, usdcBalance }) === "eth") {
    const hash = await smart.sendTransaction({ calls: batched });
    onHash?.(hash);
    await wait(hash);
    return hash;
  }
  let signed: { paymaster: Address; paymasterData: Hex; paymasterVerificationGasLimit: bigint; paymasterPostOpGasLimit: bigint } | null = null;
  const paymaster = {
    getPaymasterStubData: async () => ({ ...(await circlePermit()), isFinal: true as const }),
    getPaymasterData: async () => circlePermit(),
  };
  async function circlePermit() {
    if (signed) return signed;
    const [name, version, nonce] = await Promise.all([
      publicClient.readContract({ address: circleUsdc, abi: permitAbi, functionName: "name" }),
      publicClient.readContract({ address: circleUsdc, abi: permitAbi, functionName: "version" }),
      publicClient.readContract({ address: circleUsdc, abi: permitAbi, functionName: "nonces", args: [account.address] }),
    ]);
    const permit = {
      domain: { name, version, chainId: chain.id, verifyingContract: circleUsdc },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: { owner: account.address, spender: circlePaymaster, value: permitAmount, nonce, deadline: maxUint256 },
    } as const;
    const wrapped = await account.signTypedData(permit);
    const code = await publicClient.getCode({ address: account.address });
    if (code && code !== "0x") {
      const valid = await publicClient.verifyTypedData({ ...permit, address: account.address, signature: wrapped });
      if (!valid) throw new Error("The passkey could not approve USDC for the network fee.");
    }
    signed = {
      paymaster: circlePaymaster,
      paymasterData: encodePacked(["uint8", "address", "uint256", "bytes"], [0, circleUsdc, permitAmount, parseErc6492Signature(wrapped).signature]),
      paymasterVerificationGasLimit: 300_000n,
      paymasterPostOpGasLimit: 35_000n,
    };
    return signed;
  }
  const sponsored = createSmartAccountClient({
    account,
    chain,
    bundlerTransport: transport(bundlerUrl),
    client: publicClient,
    paymaster,
    userOperation,
  });
  const hash = await sponsored.sendTransaction({ calls: batched });
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

export async function sendCalls(sign: Pick<SignPayload, "calls" | "method" | "address" | "chainId">, options?: { onHash?: (hash: Hash) => void }) {
  if (!sign.calls.length) return;
  const where = settlement(sign.chainId);
  if (sign.method === "passkey") {
    if (where.id !== chain.id) throw new Error(`This passkey signs on ${chain.name}. Connect a wallet to send on ${where.params.chainName}.`);
    return sendPasskey(sign.calls, sign.address, options?.onHash);
  }
  return sendWallet(sign.calls, sign.address, where, options?.onHash);
}

"use client";

import { createPublicClient, encodePacked, erc20Abi, http, maxUint256, parseErc6492Signature, type Address, type Hash, type Hex, type PublicClient } from "viem";
import { base as baseChain, celo as celoChain } from "viem/chains";
import { walletProvider } from "@/lib/auth-client";
import { appChain, appNetwork, appRpc, celoRpcUrls, celoTransport, walletNetwork } from "@/lib/network";
import type { PreparedCall, SignPayload } from "@/lib/intent";
import { readPasskeys } from "@/lib/passkey-vault";
import { estimationSkipped, passkeyPaysWith, usdcCanPayFee, userOpCost } from "@/lib/passkey-fee";
import { celoFeeTx, celoFeeCurrencies, celoGasSkimCall, pickCeloFee, pickCeloFeeCovering, tokenAmountForCeloGas, withSkimGas } from "@/lib/celo-fee";
import { batchId, batchOutcome, batchUnsupported, walletSendCallsParam } from "@/lib/wallet-batch";
import { isCreateVaultOnly, vaultAlreadyExists } from "@/lib/vault-create";

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
    const urls = celoRpcUrls();
    return {
      id: 42220,
      reader: createPublicClient({ chain: celoChain, transport: celoTransport() }),
      params: {
        chainId: "0xa4ec",
        chainName: "Celo",
        nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
        rpcUrls: urls,
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

function destinationChain(id: number) {
  if (id === 42220) return celoChain;
  if (id === 8453) return baseChain;
  return chain;
}

function bundlerFor(id: number) {
  if (id === 42220) return `${window.location.origin}/api/bundler/celo`;
  if (id === chain.id) return bundlerUrl;
  return `https://public.pimlico.io/v2/${id}/rpc`;
}

async function hexGasPrice(reader: Pick<PublicClient, "request">, token?: Address) {
  if (token) {
    for (const url of celoRpcUrls()) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [token] }),
        });
        const json = (await response.json()) as { result?: string };
        if (json.result) return BigInt(json.result);
      } catch {
        /* try Forno */
      }
    }
  }
  const hex = await reader.request({ method: "eth_gasPrice" });
  return BigInt(hex as string);
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
  const celoBalance = where.id === 42220 ? await where.reader.getBalance({ address: from }) : 0n;
  const fee = where.id === 42220 && celoBalance === 0n ? await pickCeloFee(where.reader, from) : null;
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

async function sendPasskey(calls: PreparedCall[], from: Address, where: ReturnType<typeof settlement>, onHash?: (hash: Hash) => void) {
  const saved = (await readPasskeys()).find((item) => item.address.toLowerCase() === from.toLowerCase());
  if (!saved) throw new Error("This browser does not have the passkey for this account. Sign in again on this device.");
  const [{ createPublicClient: createClient, http: transport }, accountAbstraction, { toKernelSmartAccount }, { createSmartAccountClient }, { getUserOperationGasPrice }, { createPimlicoClient }] =
    await Promise.all([
      import("viem"),
      import("viem/account-abstraction"),
      import("permissionless/accounts"),
      import("permissionless"),
      import("permissionless/actions/pimlico"),
      import("permissionless/clients/pimlico"),
    ]);
  const owner = accountAbstraction.toWebAuthnAccount({
    credential: { id: saved.id, publicKey: saved.publicKey },
    rpId: window.location.hostname,
  });
  const viemChain = destinationChain(where.id);
  const rpcUrl = where.id === chain.id ? rpc : where.params.rpcUrls[0];
  const bundler = bundlerFor(where.id);
  const publicClient = createClient({
    chain: viemChain,
    transport: where.id === 42220 ? celoTransport() : transport(rpcUrl),
  });
  const account = await toKernelSmartAccount({
    client: publicClient,
    owners: [owner],
    version: "0.3.1",
    entryPoint: { address: accountAbstraction.entryPoint07Address, version: "0.7" },
  });
  if (account.address.toLowerCase() !== from.toLowerCase()) {
    throw new Error("This passkey does not match the signed-in account.");
  }
  const pimlico = createClient({ chain: viemChain, transport: transport(bundler) });
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
    chain: viemChain,
    bundlerTransport: transport(bundler),
    client: publicClient,
    userOperation,
  });
  const [ethBalance, usdcBalance] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    where.id === 42220
      ? Promise.resolve(0n)
      : publicClient.readContract({ address: circleUsdc, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
  ]);
  if (where.id === 42220) {
    if (ethBalance === 0n || ethBalance < 10n ** 17n) {
      try {
        const { topCeloIfNeeded } = await import("@/lib/actions");
        await topCeloIfNeeded();
        ethBalance = await publicClient.getBalance({ address: account.address });
      } catch {
        // The faucet is optional. The passkey can still pay with CELO or a dollar token.
      }
    }
    if (ethBalance > 0n) {
      try {
        const celoCost = userOpCost(await smart.prepareUserOperation({ calls: batched }));
        if (celoCost > 0n && ethBalance >= celoCost) {
          const hash = await smart.sendTransaction({ calls: batched });
          onHash?.(hash);
          await wait(hash, where.reader);
          return hash;
        }
      } catch (error) {
        if (!estimationSkipped(error)) throw error;
      }
    }
    const pimlicoPaymaster = createPimlicoClient({
      chain: viemChain,
      transport: transport(bundler),
      entryPoint: { address: accountAbstraction.entryPoint07Address, version: "0.7" },
    });
    const sponsored = createSmartAccountClient({
      account,
      chain: viemChain,
      bundlerTransport: transport(bundler),
      client: publicClient,
      paymaster: pimlicoPaymaster,
      userOperation: {
        estimateFeesPerGas: async () => (await pimlicoPaymaster.getUserOperationGasPrice()).fast,
      },
    });
    const quoted = await sponsored.prepareUserOperation({ calls: batched });
    const dueWei = withSkimGas(userOpCost(quoted), quoted.maxFeePerGas ?? 0n);
    const nativePrice = await hexGasPrice(where.reader);
    const amounts = await Promise.all(
      celoFeeCurrencies.map((row) =>
        where.reader.readContract({ address: row.token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }).catch(() => 0n),
      ),
    );
    const needed = await Promise.all(
      celoFeeCurrencies.map(async (row) => {
        const tokenPrice = await hexGasPrice(where.reader, row.feeCurrency);
        return tokenAmountForCeloGas({ costWei: dueWei, nativePrice, tokenPrice, decimals: row.decimals });
      }),
    );
    const pick = pickCeloFeeCovering(amounts, needed);
    const due = pick ? needed[celoFeeCurrencies.findIndex((row) => row.label === pick.label)] ?? 0n : 0n;
    if (!pick || due === 0n) {
      throw new Error("This passkey needs CELO, or USDT, USDC, or USDm at this address for the Celo network fee.");
    }
    const hash = await sponsored.sendTransaction({ calls: [celoGasSkimCall(pick.token, due), ...batched] });
    onHash?.(hash);
    await wait(hash, where.reader);
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
    await wait(hash, where.reader);
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
    chain: viemChain,
    bundlerTransport: transport(bundler),
    client: publicClient,
    paymaster,
    userOperation,
  });
  const hash = await sponsored.sendTransaction({ calls: batched });
  onHash?.(hash);
  await wait(hash, where.reader);
  return hash;
}

async function receiptOn(
  reader: {
    getTransactionReceipt: (args: { hash: Hash }) => Promise<{ status: "success" | "reverted"; blockNumber: bigint }>;
    getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint | number }>;
  },
  hash: Hash,
) {
  try {
    const receipt = await reader.getTransactionReceipt({ hash });
    if (receipt.status !== "success") return { status: "reverted" as const };
    const block = await reader.getBlock({ blockNumber: receipt.blockNumber });
    return { status: "success" as const, timestamp: Number(block.timestamp) };
  } catch {
    return { status: "pending" as const };
  }
}

export async function depositReceipt(hash: Hash): Promise<{ status: "pending" | "success" | "reverted"; timestamp?: number }> {
  const first = await receiptOn(client, hash);
  if (first.status !== "pending" || chain.id === 42220) return first;
  return receiptOn(settlement(42220).reader, hash);
}

export async function sendCalls(sign: Pick<SignPayload, "calls" | "method" | "address" | "chainId">, options?: { onHash?: (hash: Hash) => void }) {
  if (!sign.calls.length) return;
  const where = settlement(sign.chainId);
  try {
    if (sign.method === "passkey") return await sendPasskey(sign.calls, sign.address, where, options?.onHash);
    return await sendWallet(sign.calls, sign.address, where, options?.onHash);
  } catch (error) {
    if (isCreateVaultOnly(sign.calls) && vaultAlreadyExists(error)) return;
    throw error;
  }
}

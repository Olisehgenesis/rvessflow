"use client";

import { createPublicClient, encodeFunctionData, getAddress, stringToHex, zeroAddress, type Address, type Hex } from "viem";
import { celo } from "viem/chains";
import { requestWalletAccount, walletProvider } from "@/lib/auth-client";
import { readPasskeys } from "@/lib/passkey-vault";
import { celoRpcUrls, celoTransport } from "@/lib/network";
import { CELO_IDENTITY, fvIdentifierMessage, fvLink, identityAbi } from "@/lib/good-fv";
import { topVerifiedCelo } from "@/lib/actions";

async function signPasskey(from: Address, message: string): Promise<Hex> {
  const saved = (await readPasskeys()).find((item) => item.address.toLowerCase() === from.toLowerCase());
  if (!saved) throw new Error("This browser does not have the passkey for this account. Sign in again on this device.");
  const [{ createPublicClient }, accountAbstraction, { toKernelSmartAccount }, { celo }] = await Promise.all([
    import("viem"),
    import("viem/account-abstraction"),
    import("permissionless/accounts"),
    import("viem/chains"),
  ]);
  const owner = accountAbstraction.toWebAuthnAccount({
    credential: { id: saved.id, publicKey: saved.publicKey },
    rpId: window.location.hostname,
  });
  const publicClient = createPublicClient({ chain: celo, transport: celoTransport() });
  const account = await toKernelSmartAccount({
    client: publicClient,
    owners: [owner],
    version: "0.3.1",
    entryPoint: { address: accountAbstraction.entryPoint07Address, version: "0.7" },
  });
  if (account.address.toLowerCase() !== from.toLowerCase()) {
    throw new Error("This passkey does not match the signed-in account.");
  }
  return account.signMessage({ message });
}

async function signWallet(from: Address, message: string): Promise<Hex> {
  const provider = await walletProvider();
  const signature = (await provider.request({
    method: "personal_sign",
    params: [stringToHex(message), from],
  })) as Hex;
  if (!signature) throw new Error("The wallet did not return a signature.");
  return signature;
}

export async function faceCheckHref(input: { address: Address; method: "passkey" | "wallet" | "tester" }) {
  if (input.method === "tester") {
    throw new Error("A test account cannot complete face verification. Use a passkey or a connected wallet.");
  }
  const message = fvIdentifierMessage(input.address);
  const signature = input.method === "passkey" ? await signPasskey(input.address, message) : await signWallet(input.address, message);
  return fvLink({
    account: input.address,
    nonce: Math.floor(Date.now() / 1000).toString(),
    signature,
    callback: `${window.location.origin}/settings`,
    popup: true,
  });
}

async function onCelo(provider: Awaited<ReturnType<typeof walletProvider>>) {
  const urls = celoRpcUrls();
  const chainId = "0xa4ec";
  const current = await provider.request({ method: "eth_chainId" }).catch(() => null);
  if (typeof current === "string" && current.toLowerCase() === chainId) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: "Celo",
          nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
          rpcUrls: urls,
          blockExplorerUrls: ["https://celoscan.io"],
        },
      ],
    });
  }
}

/** The original verified wallet signs connectAccount(this Rvess account). */
export async function attachThisAccount(thisAccount: Address) {
  const from = getAddress(await requestWalletAccount());
  if (from.toLowerCase() === thisAccount.toLowerCase()) {
    throw new Error("That is this account. Connect the other wallet that already has the tick.");
  }
  const provider = await walletProvider();
  await onCelo(provider);
  const publicClient = createPublicClient({ chain: celo, transport: celoTransport() });
  const root = await publicClient.readContract({
    address: CELO_IDENTITY,
    abi: identityAbi,
    functionName: "getWhitelistedRoot",
    args: [from],
  });
  if (root === zeroAddress) throw new Error("That wallet is not verified with GoodDollar.");
  if (root.toLowerCase() !== from.toLowerCase()) {
    throw new Error("Connect the original verified wallet. A linked wallet cannot attach this one.");
  }
  await topVerifiedCelo(from);
  const data = encodeFunctionData({ abi: identityAbi, functionName: "connectAccount", args: [thisAccount] });
  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: CELO_IDENTITY, data }],
  })) as Hex;
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("The wallet did not attach this account.");
}

"use client";

import { createPublicClient, encodeFunctionData, getAddress, hashMessage, parseAbi, stringToHex, zeroAddress, type Address, type Hex } from "viem";
import { celo } from "viem/chains";
import { requestCeloWalletAccount, walletProvider } from "@/lib/auth-client";
import { readPasskeys } from "@/lib/passkey-vault";
import { celoRpcUrls, celoTransport } from "@/lib/network";
import { CELO_IDENTITY, fvIdentifierMessage, fvLink, identityAbi } from "@/lib/good-fv";
import { topVerifiedCelo } from "@/lib/actions";

type PreparedPasskey = {
  address: Address;
  sign: (message: string) => Promise<Hex>;
};

let prepared: PreparedPasskey | null = null;
let preparing: Promise<PreparedPasskey> | null = null;
let preparingFor: Address | null = null;

/** Load the Celo Kernel signer before the tap. Android closes WebAuthn if we import code after the click. */
export function prepareFaceCheck(address: Address) {
  const account = getAddress(address);
  if (prepared?.address.toLowerCase() === account.toLowerCase()) return Promise.resolve();
  if (preparing && preparingFor === account) return preparing.then(() => undefined);
  preparingFor = account;
  preparing = buildPasskeySigner(account)
    .then((ready) => {
      prepared = ready;
      return ready;
    })
    .catch((error) => {
      preparing = null;
      preparingFor = null;
      throw error;
    });
  return preparing.then(() => undefined);
}

async function buildPasskeySigner(account: Address): Promise<PreparedPasskey> {
  const saved = (await readPasskeys()).find((item) => item.address.toLowerCase() === account.toLowerCase());
  if (!saved) throw new Error("This phone does not have the passkey for this account. Sign in again here.");
  const [{ createPublicClient }, accountAbstraction, { toKernelSmartAccount }] = await Promise.all([
    import("viem"),
    import("viem/account-abstraction"),
    import("permissionless/accounts"),
  ]);
  const owner = accountAbstraction.toWebAuthnAccount({
    credential: { id: saved.id, publicKey: saved.publicKey },
    rpId: window.location.hostname,
  });
  const publicClient = createPublicClient({ chain: celo, transport: celoTransport() });
  const kernel = await toKernelSmartAccount({
    client: publicClient,
    owners: [owner],
    version: "0.3.1",
    entryPoint: { address: accountAbstraction.entryPoint07Address, version: "0.7" },
  });
  if (kernel.address.toLowerCase() !== account.toLowerCase()) {
    throw new Error("This passkey does not match the signed-in account.");
  }
  await kernel.getAddress();
  return {
    address: account,
    sign: (message) => kernel.signMessage({ message }),
  };
}

function signPasskey(from: Address, message: string): Promise<Hex> {
  if (!prepared || prepared.address.toLowerCase() !== from.toLowerCase()) {
    return Promise.reject(new Error("This phone is still preparing the passkey. Wait a second and tap New face check again."));
  }
  return prepared.sign(message).catch((error: unknown) => {
    throw webAuthnError(error);
  });
}

function webAuthnError(error: unknown) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/timed out or was not allowed|NotAllowedError|Failed to request credential|AbortError/i.test(text)) {
    return new Error("This phone closed the passkey prompt. Use Chrome, stay on www.rvess.xyz, tap New face check once, and unlock immediately.");
  }
  return error instanceof Error ? error : new Error(text);
}

const erc1271Abi = parseAbi(["function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"]);
const ERC1271_MAGIC = "0x1626ba7e";

/** GoodServer calls this on Celo before GoodID starts. Do not open the iframe unless it passes. */
async function assertCeloFvSig(account: Address, message: string, signature: Hex) {
  const publicClient = createPublicClient({ chain: celo, transport: celoTransport() });
  const code = await publicClient.getCode({ address: account });
  if (!code || code === "0x") return;
  const magic = await publicClient.readContract({
    address: account,
    abi: erc1271Abi,
    functionName: "isValidSignature",
    args: [hashMessage(message), signature],
  });
  if (magic.toLowerCase().slice(0, 10) !== ERC1271_MAGIC) {
    throw new Error("Celo did not accept this face-check signature. Close Account fully, open it again, and sign the text that includes this account in the middle of the sentence.");
  }
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

export function faceCheckHref(input: { address: Address; method: "passkey" | "wallet" | "tester" }) {
  if (input.method === "tester") {
    return Promise.reject(new Error("A test account cannot complete face verification. Use a passkey or a connected wallet."));
  }
  const account = getAddress(input.address);
  const message = fvIdentifierMessage(account);
  const signed = input.method === "passkey" ? signPasskey(account, message) : signWallet(account, message);
  return signed.then(async (signature) => {
    if (input.method === "passkey") await assertCeloFvSig(account, message, signature);
    return fvLink({
      account,
      nonce: Math.floor(Date.now() / 1000).toString(),
      signature,
      callback: `${window.location.origin}/api/fv-callback`,
      popup: true,
    });
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
  const from = getAddress(await requestCeloWalletAccount());
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

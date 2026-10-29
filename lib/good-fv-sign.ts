"use client";

import { stringToHex, type Address, type Hex } from "viem";
import { walletProvider } from "@/lib/auth-client";
import { readPasskeys } from "@/lib/passkey-vault";
import { celoTransport } from "@/lib/network";
import { fvIdentifierMessage, fvLink } from "@/lib/good-fv";

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

export async function openFaceCheck(input: { address: Address; method: "passkey" | "wallet" | "tester" }) {
  if (input.method === "tester") {
    throw new Error("A test account cannot complete face verification. Use a passkey or a connected wallet.");
  }
  const message = fvIdentifierMessage(input.address);
  const signature = input.method === "passkey" ? await signPasskey(input.address, message) : await signWallet(input.address, message);
  const popup = window.matchMedia("(min-width: 1024px)").matches;
  const href = fvLink({
    account: input.address,
    nonce: Math.floor(Date.now() / 1000).toString(),
    signature,
    callback: `${window.location.origin}/settings`,
    popup,
  });
  if (popup) {
    const win = window.open(href, "faceVerification", "width=600,height=760,scrollbars=yes,resizable=yes");
    if (!win) window.location.assign(href);
    return;
  }
  window.location.assign(href);
}

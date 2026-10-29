import { appNetwork } from "@/lib/network";

export const groupNets = ["celo", "base"] as const;
export type GroupNet = (typeof groupNets)[number];

export function isGroupNet(value: string): value is GroupNet {
  return (groupNets as readonly string[]).includes(value);
}

/** Celo / Base labels from token rows, form fields, or group ids. */
export function netFromLabel(value?: string): GroupNet {
  if (value && /celo/i.test(value)) return "celo";
  if (value && /base/i.test(value)) return "base";
  if (value && isGroupNet(value)) return value;
  return "celo";
}

/** The chain this app build writes savings to. Base Sepolia counts as Base. */
export function appGroupNet(): GroupNet {
  return appNetwork() === "celo" ? "celo" : "base";
}

export function groupNetLabel(net: GroupNet): string {
  return net === "celo" ? "Celo" : appNetwork() === "sepolia" ? "Base Sepolia" : "Base";
}

export function groupKey(net: GroupNet, id: bigint | string): string {
  const value = typeof id === "bigint" ? id.toString() : id;
  return net === appGroupNet() ? value : `${net}:${value}`;
}

export function parseGroupKey(key: string): { net: GroupNet; id: bigint } {
  const split = key.indexOf(":");
  if (split > 0) {
    const net = key.slice(0, split);
    if (isGroupNet(net)) return { net, id: BigInt(key.slice(split + 1)) };
  }
  return { net: appGroupNet(), id: BigInt(key) };
}

export const recommendedGroupNet: GroupNet = "celo";

export const groupChainFacts: Record<
  GroupNet,
  { title: string; recommend: boolean; fee: string; turn: string; token: string; passkey: string }
> = {
  celo: {
    title: "Celo",
    recommend: true,
    fee: "A connected wallet pays the Celo fee in CELO when it has some. If it has none, it pays in USDT, then USDC, then USDm.",
    turn: "Paid each turn is already live. A new group can send the contribution as a transfer.",
    token: "The pot is cUSDx. Members need that token on Celo, at this same address.",
    passkey: "A passkey that holds CELO pays the bundler itself. If it has none, the app sponsors the fee and takes USDT, then USDC, then USDm, including the transfer.",
  },
  base: {
    title: "Base",
    recommend: false,
    fee: "A passkey in this app can pay the network fee in USDC. A connected wallet needs ETH unless it uses its own paymaster.",
    turn: "Streaming is live. Paid each turn waits until the owner wallets finish the scheduled upgrade.",
    token: "The pot is USDCx. Members need that token on Base, at this same address.",
    passkey: "Passkeys are the usual way to sign on Base here. USDC covers the fee when it is in the account.",
  },
};

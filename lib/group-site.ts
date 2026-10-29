import "server-only";

import { createPublicClient, encodeFunctionData, http, parseAbi, type Address } from "viem";
import { base, celo } from "viem/chains";
import { appGroupNet, type GroupNet } from "@/lib/group-network";
import { appChain, appNetwork, appRpc } from "@/lib/network";

const groupsProbe = parseAbi(["function groups(uint256) view returns (uint256)", "function upgradeReadyAt() view returns (uint64)"]);
const groupsOfAbi = parseAbi(["function groupsOf(address) view returns (uint256[])"]);

const celoGroups = "0xe98361A2D733783b20371ed6b03e93c7be7A3285" as Address;
const celoToken = "0x3AcB9A08697b6Db4cD977e8Ab42b6f24722e6D6e" as Address;
const baseGroups = "0x13008059FAd0348Fb8848A0737F9E826C82199fa" as Address;
const baseToken = "0xD04383398dD2426297da660F9CCA3d439AF9ce1b" as Address;
const sepoliaGroups = "0x70f5CF80052E8a8E0e5e252d33cd15F059956E3D" as Address;
const sepoliaToken = "0x1650581F573eAd727B92073B5Ef8B4f5B94D1648" as Address;

const appClient = createPublicClient({ chain: appChain(), transport: http(appRpc()) });
type GroupReader = typeof appClient;

export type GroupSite = {
  net: GroupNet;
  chainId: number;
  groups: Address;
  token: Address;
  client: GroupReader;
  name: string;
};

const celoClient = createPublicClient({
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org"),
});
const baseClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
});

export function groupSite(net: GroupNet): GroupSite {
  if (net === appGroupNet()) {
    const network = appNetwork();
    return {
      net,
      chainId: network === "celo" ? 42220 : network === "sepolia" ? 84532 : 8453,
      groups: network === "celo" ? celoGroups : network === "sepolia" ? sepoliaGroups : baseGroups,
      token: network === "celo" ? celoToken : network === "sepolia" ? sepoliaToken : baseToken,
      client: appClient as GroupReader,
      name: network === "sepolia" ? "Base Sepolia" : net === "celo" ? "Celo" : "Base",
    };
  }
  if (net === "celo") {
    return { net, chainId: 42220, groups: celoGroups, token: celoToken, client: celoClient as GroupReader, name: "Celo" };
  }
  return { net, chainId: 8453, groups: baseGroups, token: baseToken, client: baseClient as GroupReader, name: "Base" };
}

export async function groupPlainOn(net: GroupNet): Promise<{ live: boolean; readyAt: number }> {
  const site = groupSite(net);
  const [call, readyAt] = await Promise.all([
    site.client.call({
      to: site.groups,
      data: encodeFunctionData({ abi: groupsProbe, functionName: "groups", args: [0n] }),
    }),
    site.client.readContract({ address: site.groups, abi: groupsProbe, functionName: "upgradeReadyAt" }).catch(() => 0n),
  ]);
  const words = Math.floor(((call.data ?? "0x").length - 2) / 64);
  return { live: words >= 21, readyAt: Number(readyAt) };
}

export function otherGroupNet(): GroupNet {
  return appGroupNet() === "celo" ? "base" : "celo";
}

export async function groupsOfOn(net: GroupNet, owner: Address): Promise<bigint[]> {
  const site = groupSite(net);
  const ids = await site.client.readContract({ address: site.groups, abi: groupsOfAbi, functionName: "groupsOf", args: [owner] });
  return [...ids];
}

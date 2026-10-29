import "server-only";

import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { base, celo } from "viem/chains";
import { appGroupNet, type GroupNet } from "@/lib/group-network";
import { appChain, appNetwork, appRpc, celoTransport } from "@/lib/network";

const appClient = createPublicClient({ chain: appChain(), transport: http(appRpc()) });
export type VaultReader = Pick<PublicClient, "readContract" | "multicall" | "getBalance" | "call" | "waitForTransactionReceipt">;

const celoClient = createPublicClient({
  chain: celo,
  transport: celoTransport(),
});
const baseClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
});

export type VaultSite = {
  net: GroupNet;
  chainId: number;
  name: string;
  factory: Address;
  locks: Address;
  allowlist: Address;
  fusdcx: Address;
  ethx: Address;
  cfa: Address;
  usdc: Address;
  usdt: Address;
  /** Token Superfluid wraps into fusdcx. Celo cUSDx wraps Mento USDm. */
  wrap: Address;
  client: VaultReader;
};

const celoLive: Omit<VaultSite, "client"> = {
  net: "celo",
  chainId: 42220,
  name: "Celo",
  factory: "0xeC9f5717593f66BA703e9bdB871B24014642F3cB",
  locks: "0x1a48b3d9f38ea0B905F4731c5D3bdA081078b5ef",
  allowlist: "0x3627815B99D045A40a189000FBf7dAE729cEF9eB",
  fusdcx: "0x3AcB9A08697b6Db4cD977e8Ab42b6f24722e6D6e",
  ethx: "0x671425Ae1f272Bc6F79beC3ed5C4b00e9c628240",
  cfa: "0xcfA132E353cB4E398080B9700609bb008eceB125",
  usdc: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  usdt: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  wrap: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
};

const baseLive: Omit<VaultSite, "client"> = {
  net: "base",
  chainId: 8453,
  name: "Base",
  factory: "0xc21B7Bd68F8235b7DB2827334d2039fD8B3C118d",
  locks: "0x68B0667E098A62b3e3F437DBeb0aEdB746cD4c41",
  allowlist: "0x34e748f13c294ED3b8Cdd1dd65C45b58981dBe8b",
  fusdcx: "0xD04383398dD2426297da660F9CCA3d439AF9ce1b",
  ethx: "0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93",
  cfa: "0xcfA132E353cB4E398080B9700609bb008eceB125",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  wrap: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

const sepoliaLive: Omit<VaultSite, "client"> = {
  net: "base",
  chainId: 84532,
  name: "Base Sepolia",
  factory: "0x18E484ca13A7e63511343EB474C13e04C0929354",
  locks: "0x99F4f175e117a16D554AEAbee4a2a5b754c2540E",
  allowlist: "0xed115A3Ac77036fD7f4ec4B597d655B486d7AB6D",
  fusdcx: "0x1650581F573eAd727B92073B5Ef8B4f5B94D1648",
  ethx: "0x143ea239159155B408e71CDbE836e8CFD6766732",
  cfa: "0xcfA132E353cB4E398080B9700609bb008eceB125",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  wrap: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export function vaultSite(net: GroupNet = appGroupNet()): VaultSite {
  if (net === appGroupNet()) {
    const network = appNetwork();
    const live = network === "celo" ? celoLive : network === "sepolia" ? sepoliaLive : baseLive;
    return { ...live, client: appClient as VaultReader };
  }
  if (net === "celo") return { ...celoLive, client: celoClient as VaultReader };
  return { ...baseLive, client: baseClient as VaultReader };
}

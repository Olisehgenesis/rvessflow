import "server-only";

import { createPublicClient, formatUnits, http, type Address } from "viem";
import { base, celo } from "viem/chains";
import { baseMarket } from "@/lib/base-market";
import { formatAmount } from "@/lib/pay-math";
import { celoTransport } from "@/lib/network";
import { addresses, chain, erc20, networkName, publicClient, stableLabel } from "@/lib/protocol";
import { pickCeloFee } from "@/lib/celo-fee";
import { type MoveChoice, type SendAsset, type SendChoice, sendDecimals, spendableEth, spendableUsdc, usdcFeeReserve } from "@/lib/send-math";

export type { SendChoice };

const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const baseUsdt = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as Address;
const baseUsdm = "0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C" as Address;
const baseUsdcx = "0xD04383398dD2426297da660F9CCA3d439AF9ce1b" as Address;
const baseEthx = "0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93" as Address;
const celoUsdc = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as Address;
const celoUsdt = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as Address;
const celoUsdm = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as Address;
const celoMountain = "0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C" as Address;
const celoCusdx = "0x3AcB9A08697b6Db4cD977e8Ab42b6f24722e6D6e" as Address;
const celoCelox = "0x671425Ae1f272Bc6F79beC3ed5C4b00e9c628240" as Address;

type SendRoute = {
  chainId: number;
  token: Address | null;
  label: string;
  network: string;
  fee: "native" | "none";
};

const baseReader = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
});
const celoReader = createPublicClient({
  chain: celo,
  transport: celoTransport(),
});

function reader(chainId: number) {
  if (chainId === chain.id) return publicClient;
  if (chainId === 42220) return celoReader;
  return baseReader;
}

/** Where a send asset actually lives. The unprefixed assets are the app network. */
export function sendRoute(asset: SendAsset): SendRoute {
  if (asset === "eth") return { chainId: chain.id, token: null, label: chain.nativeCurrency.symbol, network: networkName, fee: "native" };
  if (asset === "usdc") return { chainId: chain.id, token: baseMarket.usdc, label: "USDC", network: networkName, fee: "none" };
  if (asset === "usdt") return { chainId: chain.id, token: baseMarket.usdt, label: "USDT", network: networkName, fee: "none" };
  if (asset === "usdcx") return { chainId: chain.id, token: addresses.fusdcx, label: stableLabel, network: networkName, fee: "none" };
  if (asset === "ethx") return { chainId: chain.id, token: addresses.ethx, label: chain.id === 42220 ? "CELOx" : "ETHx", network: networkName, fee: "none" };
  if (asset === "base-usdm") return { chainId: 8453, token: baseUsdm, label: "USDM", network: "Base", fee: "none" };
  if (asset === "base-eth") return { chainId: 8453, token: null, label: "ETH", network: "Base", fee: "native" };
  if (asset === "base-usdc") return { chainId: 8453, token: baseUsdc, label: "USDC", network: "Base", fee: "none" };
  if (asset === "base-usdt") return { chainId: 8453, token: baseUsdt, label: "USDT", network: "Base", fee: "none" };
  if (asset === "base-usdcx") return { chainId: 8453, token: baseUsdcx, label: "USDCx", network: "Base", fee: "none" };
  if (asset === "base-ethx") return { chainId: 8453, token: baseEthx, label: "ETHx", network: "Base", fee: "none" };
  if (asset === "celo") return { chainId: 42220, token: null, label: "CELO", network: "Celo", fee: "native" };
  if (asset === "celo-usdc") return { chainId: 42220, token: celoUsdc, label: "USDC", network: "Celo", fee: "none" };
  if (asset === "celo-usdt") return { chainId: 42220, token: celoUsdt, label: "USDT", network: "Celo", fee: "none" };
  if (asset === "celo-usdm") return { chainId: 42220, token: celoUsdm, label: "USDm", network: "Celo", fee: "none" };
  if (asset === "celo-mountain") return { chainId: 42220, token: celoMountain, label: "USDM", network: "Celo", fee: "none" };
  if (asset === "celo-cusdx") return { chainId: 42220, token: celoCusdx, label: "cUSDx", network: "Celo", fee: "none" };
  return { chainId: 42220, token: celoCelox, label: "CELOx", network: "Celo", fee: "none" };
}

export function sendToken(asset: SendAsset): Address | null {
  return sendRoute(asset).token;
}

export function sendLabel(asset: SendAsset): string {
  return sendRoute(asset).label;
}

export async function walletBalance(owner: Address, asset: SendAsset): Promise<bigint> {
  const route = sendRoute(asset);
  const client = reader(route.chainId);
  if (!route.token) return client.getBalance({ address: owner });
  const code = await client.getCode({ address: route.token });
  if (!code || code === "0x") return 0n;
  return client.readContract({ address: route.token, abi: erc20, functionName: "balanceOf", args: [owner] });
}

function plain(amount: bigint, decimals: number): string {
  const raw = formatUnits(amount, decimals);
  if (!raw.includes(".")) return raw;
  return raw.replace(/0+$/, "").replace(/\.$/, "");
}

export async function loadMoveOut(owner: Address): Promise<MoveChoice[]> {
  const [eth, usdc] = await Promise.all([walletBalance(owner, "eth"), walletBalance(owner, "usdc")]);
  const native = sendLabel("eth");
  const usdcPays = chain.id !== 42220 && usdc > usdcFeeReserve;
  const ethMax = usdcPays ? eth : spendableEth(eth);
  const usdcMax = usdcPays ? spendableUsdc(usdc, false) : usdc;
  const rows: MoveChoice[] = [];
  if (eth > 0n) {
    rows.push({
      asset: "eth",
      label: native,
      balance: formatAmount(eth, 18, 6),
      max: plain(ethMax, 18),
      maxWei: ethMax.toString(),
      decimals: 18,
      note: usdcPays
        ? `The network fee is paid in USDC, so this can send the full ${native} balance.`
        : `The slider stops a little under the full ${native} balance, so the network fee can still be paid.`,
    });
  }
  if (usdc > 0n) {
    rows.push({
      asset: "usdc",
      label: "USDC",
      balance: formatAmount(usdc, 6, 2),
      max: plain(usdcMax, 6),
      maxWei: usdcMax.toString(),
      decimals: 6,
      note: usdcPays ? "A little USDC stays in the account. Circle takes the network fee from it." : "",
    });
  }
  return rows;
}

function listedAssets(): SendAsset[] {
  const assets: SendAsset[] = ["eth", "usdc", "usdt", "usdcx", "ethx", "base-usdm", "celo-usdm", "celo-mountain"];
  if (chain.id !== 8453) assets.push("base-eth", "base-usdc", "base-usdt", "base-usdcx", "base-ethx");
  if (chain.id !== 42220) assets.push("celo", "celo-usdc", "celo-usdt", "celo-cusdx", "celo-celox");
  return assets;
}

export async function loadSendChoices(owner: Address): Promise<SendChoice[]> {
  const assets = listedAssets();
  const [amounts, celoFee] = await Promise.all([
    Promise.all(assets.map((asset) => walletBalance(owner, asset))),
    pickCeloFee(celoReader, owner),
  ]);
  return assets
    .map((asset, index) => {
      const route = sendRoute(asset);
      const balance = amounts[index] ?? 0n;
      const feeToken = Boolean(route.chainId === 42220 && celoFee && route.token && route.token.toLowerCase() === celoFee.token.toLowerCase());
      let spendable = balance;
      if (feeToken && celoFee) spendable = balance > celoFee.min ? balance - celoFee.min : 0n;
      else if (route.chainId === 42220 && celoFee && route.fee === "native") spendable = balance;
      else if (route.fee === "native") spendable = spendableEth(balance);
      const digits = route.fee === "native" || asset === "ethx" || asset === "base-ethx" || asset === "celo-celox" ? 6 : 2;
      return {
        asset,
        label: route.label,
        network: route.network,
        balance: formatAmount(balance, sendDecimals(asset), digits),
        max: plain(spendable, sendDecimals(asset)),
        reserve: feeToken || (route.fee === "native" && !celoFee),
        value: balance,
        chainId: route.chainId,
      };
    })
    .sort((left, right) => (right.value > left.value ? 1 : right.value < left.value ? -1 : left.label.localeCompare(right.label)))
    .map(({ chainId: _chainId, value: _value, ...choice }) => choice);
}

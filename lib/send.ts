import "server-only";

import { formatUnits, type Address } from "viem";
import { baseMarket } from "@/lib/base-market";
import { formatAmount } from "@/lib/pay-math";
import { addresses, erc20, publicClient, stableLabel } from "@/lib/protocol";
import { type MoveChoice, type SendAsset, type SendChoice, sendDecimals, spendableEth, spendableUsdc, usdcFeeReserve } from "@/lib/send-math";

export type { SendChoice };

export function sendToken(asset: SendAsset): Address | null {
  if (asset === "eth") return null;
  if (asset === "usdc") return baseMarket.usdc;
  if (asset === "usdt") return baseMarket.usdt;
  if (asset === "usdcx") return addresses.fusdcx;
  return addresses.ethx;
}

export function sendLabel(asset: SendAsset): string {
  if (asset === "usdcx") return stableLabel;
  if (asset === "eth") return "ETH";
  if (asset === "ethx") return "ETHx";
  if (asset === "usdt") return "USDT";
  return "USDC";
}

export async function walletBalance(owner: Address, asset: SendAsset): Promise<bigint> {
  if (asset === "eth") return publicClient.getBalance({ address: owner });
  const token = sendToken(asset);
  if (!token) return 0n;
  const code = await publicClient.getCode({ address: token });
  if (!code || code === "0x") return 0n;
  return publicClient.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [owner] });
}

function plain(amount: bigint, decimals: number): string {
  const raw = formatUnits(amount, decimals);
  if (!raw.includes(".")) return raw;
  return raw.replace(/0+$/, "").replace(/\.$/, "");
}

export async function loadMoveOut(owner: Address): Promise<MoveChoice[]> {
  const [eth, usdc] = await Promise.all([walletBalance(owner, "eth"), walletBalance(owner, "usdc")]);
  const usdcPays = usdc > usdcFeeReserve;
  const ethMax = usdcPays ? eth : spendableEth(eth);
  const usdcMax = usdcPays ? spendableUsdc(usdc, false) : usdc;
  const rows: MoveChoice[] = [];
  if (eth > 0n) {
    rows.push({
      asset: "eth",
      label: "ETH",
      balance: formatAmount(eth, 18, 6),
      max: plain(ethMax, 18),
      maxWei: ethMax.toString(),
      decimals: 18,
      note: usdcPays
        ? "The network fee is paid in USDC, so this can send the full ETH balance."
        : "The slider stops a little under the full ETH balance, so the network fee can still be paid.",
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

export async function loadSendChoices(owner: Address): Promise<SendChoice[]> {
  const [eth, usdc, usdt, wrapped, ethx] = await Promise.all([
    walletBalance(owner, "eth"),
    walletBalance(owner, "usdc"),
    walletBalance(owner, "usdt"),
    walletBalance(owner, "usdcx"),
    walletBalance(owner, "ethx"),
  ]);
  const rows: { asset: SendAsset; label: string; amount: bigint }[] = [
    { asset: "eth", label: "ETH", amount: spendableEth(eth) },
    { asset: "usdc", label: "USDC", amount: usdc },
    { asset: "usdt", label: "USDT", amount: usdt },
    { asset: "usdcx", label: stableLabel, amount: wrapped },
    { asset: "ethx", label: "ETHx", amount: ethx },
  ];
  return rows
    .filter((row) => row.amount > 0n)
    .map((row) => {
      const digits = row.asset === "eth" || row.asset === "ethx" ? 6 : 2;
      return {
        asset: row.asset,
        label: row.label,
        balance: formatAmount(row.amount, sendDecimals(row.asset), digits),
        max: plain(row.amount, sendDecimals(row.asset)),
      };
    });
}

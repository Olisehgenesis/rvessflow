import "server-only";

import type { Address } from "viem";
import { baseMarket } from "@/lib/base-market";
import { maxUsdInput } from "@/lib/deposit-math";
import { formatAmount, formatUsd8, type PayAsset } from "@/lib/pay-math";
import { loadPrices } from "@/lib/prices";
import { erc20, publicClient, type Portfolio } from "@/lib/protocol";
import type { Quote } from "@/lib/quote";

export type HoldingRow = {
  key: string;
  label: string;
  amount: string;
  usd: string;
  local?: string;
};

export type PayChoice = {
  pay: PayAsset;
  label: string;
  balance: string;
  usd: string;
  maxUsd: string;
};

export type HoldingsView = {
  rows: HoldingRow[];
  totalUsd: string;
  totalLocal?: string;
  localUnit?: string;
  available: string;
  streaming: string;
  locked: string;
  idleUsd: string;
  choices: PayChoice[];
};

function valueOf(amount: bigint, scale: number, price8: bigint): bigint {
  return (amount * price8) / 10n ** BigInt(scale);
}

function localText(usd8: bigint, quote: Quote, usdcUsd8: bigint): string | undefined {
  if (quote.code === "usd" || quote.code === "fusdcx" || !(quote.perToken > 0) || usdcUsd8 <= 0n) return undefined;
  const dollars = Number(usd8) / 1e8;
  const usdc = Number(usdcUsd8) / 1e8;
  if (!(usdc > 0)) return undefined;
  const local = (dollars * quote.perToken) / usdc;
  if (!Number.isFinite(local)) return undefined;
  return local.toLocaleString("en-US", {
    minimumFractionDigits: quote.digits > 0 ? Math.min(quote.digits, 2) : 0,
    maximumFractionDigits: quote.digits,
  });
}

function money(usd8: bigint): string {
  return formatUsd8(usd8);
}

export async function loadHoldings(owner: Address, portfolio: Portfolio, quote: Quote): Promise<HoldingsView> {
  const [prices, usdc, usdt, eth, ethx] = await Promise.all([
    loadPrices(),
    publicClient.readContract({ address: baseMarket.usdc, abi: erc20, functionName: "balanceOf", args: [owner] }),
    publicClient.readContract({ address: baseMarket.usdt, abi: erc20, functionName: "balanceOf", args: [owner] }),
    publicClient.getBalance({ address: owner }),
    publicClient.readContract({ address: baseMarket.ethx, abi: erc20, functionName: "balanceOf", args: [owner] }),
  ]);
  const usdSuper =
    BigInt(portfolio.wallet) + BigInt(portfolio.idle) + BigInt(portfolio.held) + BigInt(portfolio.streaming) + BigInt(portfolio.locked);
  let wrappedEth = ethx;
  for (const lock of portfolio.locks) {
    if (!lock.settled && lock.token.toLowerCase() === baseMarket.ethx.toLowerCase()) wrappedEth += BigInt(lock.principal);
  }
  const priced = [
    { key: "usdc", label: "USDC", amount: formatAmount(usdc, 6, 2), value: valueOf(usdc, 6, prices.usdcUsd8) },
    { key: "usdt", label: "USDT", amount: formatAmount(usdt, 6, 2), value: valueOf(usdt, 6, prices.usdtUsd8) },
    { key: "eth", label: "ETH", amount: formatAmount(eth, 18, 6), value: valueOf(eth, 18, prices.ethUsd8) },
    {
      key: "usd",
      label: "USD",
      amount: formatAmount(usdSuper / 10n ** 12n, 6, 2),
      value: valueOf(usdSuper, 18, prices.usdcUsd8),
    },
  ];
  if (wrappedEth > 0n) {
    priced.push({
      key: "ethx",
      label: "ETHx",
      amount: formatAmount(wrappedEth, 18, 6),
      value: valueOf(wrappedEth, 18, prices.ethUsd8),
    });
  }
  const total = priced.reduce((sum, row) => sum + row.value, 0n);
  const availableSuper = BigInt(portfolio.wallet) + BigInt(portfolio.idle) + BigInt(portfolio.held);
  const streamingSuper = BigInt(portfolio.streaming);
  const lockedSuper = BigInt(portfolio.locked);
  const idleValue = valueOf(BigInt(portfolio.idle), 18, prices.usdcUsd8);
  const localUnit = quote.code === "usd" || quote.code === "fusdcx" ? undefined : quote.unit;
  return {
    rows: priced.map((row) => ({
      key: row.key,
      label: row.label,
      amount: row.amount,
      usd: money(row.value),
      local: localText(row.value, quote, prices.usdcUsd8),
    })),
    totalUsd: money(total),
    totalLocal: localText(total, quote, prices.usdcUsd8),
    localUnit,
    available: money(valueOf(availableSuper, 18, prices.usdcUsd8)),
    streaming: money(valueOf(streamingSuper, 18, prices.usdcUsd8)),
    locked: money(valueOf(lockedSuper, 18, prices.usdcUsd8)),
    idleUsd: money(idleValue),
    choices: [
      { pay: "usdc", label: "USDC", balance: formatAmount(usdc, 6, 2), usd: money(valueOf(usdc, 6, prices.usdcUsd8)), maxUsd: maxUsdInput(valueOf(usdc, 6, prices.usdcUsd8)) },
      { pay: "usdt", label: "USDT", balance: formatAmount(usdt, 6, 2), usd: money(valueOf(usdt, 6, prices.usdtUsd8)), maxUsd: maxUsdInput(valueOf(usdt, 6, prices.usdtUsd8)) },
      { pay: "eth", label: "ETH", balance: formatAmount(eth, 18, 6), usd: money(valueOf(eth, 18, prices.ethUsd8)), maxUsd: maxUsdInput(valueOf(eth, 18, prices.ethUsd8)) },
    ],
  };
}

export async function loadPayChoices(owner: Address): Promise<PayChoice[]> {
  const [prices, usdc, usdt, eth] = await Promise.all([
    loadPrices(),
    publicClient.readContract({ address: baseMarket.usdc, abi: erc20, functionName: "balanceOf", args: [owner] }),
    publicClient.readContract({ address: baseMarket.usdt, abi: erc20, functionName: "balanceOf", args: [owner] }),
    publicClient.getBalance({ address: owner }),
  ]);
  return [
    { pay: "usdc", label: "USDC", balance: formatAmount(usdc, 6, 2), usd: money(valueOf(usdc, 6, prices.usdcUsd8)), maxUsd: maxUsdInput(valueOf(usdc, 6, prices.usdcUsd8)) },
    { pay: "usdt", label: "USDT", balance: formatAmount(usdt, 6, 2), usd: money(valueOf(usdt, 6, prices.usdtUsd8)), maxUsd: maxUsdInput(valueOf(usdt, 6, prices.usdtUsd8)) },
    { pay: "eth", label: "ETH", balance: formatAmount(eth, 18, 6), usd: money(valueOf(eth, 18, prices.ethUsd8)), maxUsd: maxUsdInput(valueOf(eth, 18, prices.ethUsd8)) },
  ];
}

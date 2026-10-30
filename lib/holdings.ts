import "server-only";

import { createPublicClient, http, zeroAddress, type Address, type Hex } from "viem";
import { base, celo } from "viem/chains";
import { maxUsdInput } from "@/lib/deposit-math";
import { balanceColumns, holdingCaption } from "@/lib/home-math";
import { formatAmount, formatUsd8, type PayAsset } from "@/lib/pay-math";
import { coinMap, loadPrices } from "@/lib/prices";
import { celoTransport } from "@/lib/network";
import { addresses, chain, erc20, factoryAbi, lockAbi, networkName, publicClient, stableLabel, vaultAbi, type Portfolio } from "@/lib/protocol";
import { vaultSite } from "@/lib/vault-site";
import type { GroupNet } from "@/lib/group-network";
import { cashTokens, finderTokens, GOOD_DOLLAR, type FinderToken } from "@/lib/stables";
import type { Quote } from "@/lib/quote";
import type { HoldingRow } from "@/lib/holding-row";
import type { GdxTradeBalances } from "@/lib/token-face";

export type { HoldingRow };

export type PayChoice = {
  pay: PayAsset;
  label: string;
  balance: string;
  usd: string;
  maxUsd: string;
  network?: string;
  id?: string;
};

export type HoldingsView = {
  rows: HoldingRow[];
  totalUsd: string;
  totalLocal?: string;
  localUnit?: string;
  /** USD value with 8 decimals, before display rounding. */
  totalUsd8: string;
  availableUsd8: string;
  streamingUsd8: string;
  lockedUsd8: string;
  usdcUsd8: string;
  available: string;
  streaming: string;
  locked: string;
  idleUsd: string;
  choices: PayChoice[];
  /** Celo G$ as its own line. Not mixed into USD. */
  goodDollar: HoldingRow;
  gdxTrade: GdxTradeBalances;
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

async function hasCode(token: Address): Promise<boolean> {
  const code = await publicClient.getCode({ address: token });
  return Boolean(code && code !== "0x");
}

type BalanceRead = { status: "success"; result: bigint } | { status: "failure" };

function readAmount(reads: readonly BalanceRead[], index: number): bigint {
  const row = reads[index];
  return row?.status === "success" ? row.result : 0n;
}

const baseUsdcx = "0xD04383398dD2426297da660F9CCA3d439AF9ce1b" as Address;
const baseEthx = "0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93" as Address;
const baseFactory = "0xc21B7Bd68F8235b7DB2827334d2039fD8B3C118d" as Address;
const baseLocks = "0x68B0667E098A62b3e3F437DBeb0aEdB746cD4c41" as Address;
const celoCusdx = "0x3AcB9A08697b6Db4cD977e8Ab42b6f24722e6D6e" as Address;
const celoCelox = "0x671425Ae1f272Bc6F79beC3ed5C4b00e9c628240" as Address;
const celoFactory = "0x0060f57E447e5E2D310b61cAD372Ae83959aF3B7" as Address;
const celoLocks = "0x0A55056218036f3396b00115e44569eb7D33e951" as Address;

const baseReader = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
});
const celoReader = createPublicClient({
  chain: celo,
  transport: celoTransport(),
});

function readTokenBalances(chainId: number, owner: Address, tokens: { address: Address }[]) {
  const contracts = tokens.map((token) => ({ address: token.address, abi: erc20, functionName: "balanceOf" as const, args: [owner] as const }));
  const request = { contracts, allowFailure: true as const };
  if (chainId === chain.id) return publicClient.multicall(request);
  if (chainId === 42220) return celoReader.multicall(request);
  return baseReader.multicall(request);
}

/** USDC, USDT, and the native super token on this app's chain, in one multicall. */
async function walletBalances(owner: Address): Promise<{ reads: BalanceRead[]; eth: bigint; ethx: bigint }> {
  const cash = cashTokens(chain.id);
  const contracts = [
    { address: cash.usdc.address, abi: erc20, functionName: "balanceOf" as const, args: [owner] as const },
    { address: cash.usdt.address, abi: erc20, functionName: "balanceOf" as const, args: [owner] as const },
    { address: addresses.ethx, abi: erc20, functionName: "balanceOf" as const, args: [owner] as const },
  ];
  const [reads, eth] = await Promise.all([
    publicClient.multicall({ contracts, allowFailure: true }),
    publicClient.getBalance({ address: owner }),
  ]);
  return { reads, eth, ethx: readAmount(reads, 2) };
}

/** Base and Celo dollar tokens together. One multicall per chain, in parallel. */
async function listedBalances(owner: Address): Promise<{ token: FinderToken; amount: bigint }[]> {
  const grouped = new Map<number, FinderToken[]>();
  for (const token of finderTokens()) {
    const list = grouped.get(token.chainId) ?? [];
    list.push(token);
    grouped.set(token.chainId, list);
  }
  const batches = await Promise.all(
    [...grouped.entries()].map(async ([chainId, tokens]) => {
      const reads = await readTokenBalances(chainId, owner, tokens);
      return tokens.map((token, index) => ({ token, amount: readAmount(reads, index) }));
    }),
  );
  return batches.flat();
}

/** Compact wallet fingerprint for Receive. Tokens plus native on Base, Celo, and this app chain. */
export async function walletStamp(owner: Address): Promise<string> {
  const [listed, appNative, baseNative, celoNative, baseSuper, celoSuper] = await Promise.all([
    listedBalances(owner),
    publicClient.getBalance({ address: owner }).catch(() => 0n),
    chain.id === 8453 ? Promise.resolve(null) : baseReader.getBalance({ address: owner }).catch(() => 0n),
    chain.id === 42220 ? Promise.resolve(null) : celoReader.getBalance({ address: owner }).catch(() => 0n),
    readTokenBalances(8453, owner, [{ address: baseUsdcx }, { address: baseEthx }]),
    readTokenBalances(42220, owner, [{ address: celoCusdx }, { address: celoCelox }]),
  ]);
  return [
    `app:${appNative}`,
    baseNative == null ? "" : `base:${baseNative}`,
    celoNative == null ? "" : `celo:${celoNative}`,
    listed.map((row) => `${row.token.key}:${row.amount}`).join(","),
    `busdcx:${readAmount(baseSuper, 0)}`,
    `bethx:${readAmount(baseSuper, 1)}`,
    `cusdx:${readAmount(celoSuper, 0)}`,
    `celox:${readAmount(celoSuper, 1)}`,
  ]
    .filter(Boolean)
    .join("|");
}

/** Wallet fUSDCx plus idle vault fUSDCx. Both can fund a goal without a swap. */
async function spendableSuper(owner: Address): Promise<bigint> {
  if (!(await hasCode(addresses.fusdcx))) return 0n;
  const [wallet, vault] = await Promise.all([
    publicClient.readContract({ address: addresses.fusdcx, abi: erc20, functionName: "balanceOf", args: [owner] }),
    publicClient.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "vaultOf", args: [owner] }),
  ]);
  if (vault === zeroAddress) return wallet;
  const idle = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "unallocated", args: [addresses.fusdcx] });
  return wallet + idle;
}

type Piece = {
  key: string;
  label: string;
  network: string;
  group: "usd" | "eth" | "celo";
  amount: bigint;
  decimals: number;
  value: bigint;
};

type SavedToken = { key: string; label: string; address: Address; group: "usd" | "eth" | "celo" };

/** Wallet, vault, and lock balances for a chain the app is not currently using. */
async function savedOn(chainId: number, owner: Address, factory: Address, locks: Address, tokens: SavedToken[]): Promise<{ token: SavedToken; amount: bigint }[]> {
  if (chainId === chain.id || tokens.length === 0) return [];
  const client = chainId === 42220 ? celoReader : baseReader;
  const head = await client.multicall({
    contracts: [
      ...tokens.map((token) => ({ address: token.address, abi: erc20, functionName: "balanceOf" as const, args: [owner] as const })),
      { address: factory, abi: factoryAbi, functionName: "vaultOf" as const, args: [owner] as const },
      { address: locks, abi: lockAbi, functionName: "locksOf" as const, args: [owner] as const },
    ],
    allowFailure: true,
  });
  const wallets = tokens.map((_, index) => {
    const row = head[index];
    return row?.status === "success" && typeof row.result === "bigint" ? row.result : 0n;
  });
  const vaultRow = head[tokens.length];
  const lockRow = head[tokens.length + 1];
  const vault = vaultRow?.status === "success" ? (vaultRow.result as Address) : zeroAddress;
  const lockIds = lockRow?.status === "success" ? (lockRow.result as bigint[]) : [];
  const inVault = tokens.map(() => 0n);
  if (vault !== zeroAddress) {
    const sheets = await client.multicall({
      contracts: tokens.map((token) => ({ address: vault, abi: vaultAbi, functionName: "balanceSheet" as const, args: [token.address] as const })),
      allowFailure: true,
    });
    sheets.forEach((row, index) => {
      if (row.status !== "success") return;
      const sheet = row.result as readonly [bigint, bigint, bigint];
      inVault[index] = sheet[0] + sheet[1] + sheet[2];
    });
  }
  const locked = tokens.map(() => 0n);
  if (lockIds.length > 0) {
    const records = await client.multicall({
      contracts: lockIds.map((id) => ({ address: locks, abi: lockAbi, functionName: "locks" as const, args: [id] as const })),
      allowFailure: true,
    });
    for (const row of records) {
      if (row.status !== "success") continue;
      const entry = row.result as readonly [Address, Address, bigint, bigint, bigint, bigint, bigint, boolean, number, Hex, bigint, bigint];
      if (entry[7]) continue;
      const index = tokens.findIndex((token) => token.address.toLowerCase() === entry[1].toLowerCase());
      if (index >= 0) locked[index] += entry[2];
    }
  }
  return tokens.map((token, index) => ({ token, amount: wallets[index] + inVault[index] + locked[index] }));
}

function amountDigits(label: string, decimals: number): number {
  if (label === "ETH" || label === "ETHx" || label === "CELO" || label === "CELOx" || label === "G$") return 6;
  return decimals === 6 ? 2 : 4;
}

function partOf(piece: Piece, quote: Quote, usdcUsd8: bigint): HoldingRow {
  return {
    key: piece.key,
    label: piece.label,
    network: piece.network,
    amount: formatAmount(piece.amount, piece.decimals, amountDigits(piece.label, piece.decimals)),
    usd: money(piece.value),
    local: localText(piece.value, quote, usdcUsd8),
  };
}

function groupNetwork(pieces: Piece[]): string {
  const names = pieces.map((piece) => piece.network.replace(/ · streaming out$/, "").replace(/^Streaming out$/, networkName));
  const hasBase = names.some((name) => name.startsWith("Base"));
  const hasCelo = names.some((name) => name.startsWith("Celo"));
  if (hasBase && hasCelo) return "Base and Celo";
  return names[0] ?? "";
}

function groupRow(key: "usd" | "eth" | "celo", label: string, pieces: Piece[], quote: Quote, usdcUsd8: bigint): HoldingRow {
  const value = pieces.reduce((sum, piece) => sum + piece.value, 0n);
  const amount = key === "usd"
    ? formatAmount(value, 8, 2)
    : formatAmount(pieces.reduce((sum, piece) => sum + piece.amount, 0n), 18, 6);
  return {
    key,
    label,
    network: groupNetwork(pieces),
    amount,
    usd: money(value),
    local: localText(value, quote, usdcUsd8),
    parts: [...pieces]
      .sort((left, right) => (right.value > left.value ? 1 : right.value < left.value ? -1 : 0))
      .map((piece) => partOf(piece, quote, usdcUsd8)),
  };
}

function take(pieces: Map<string, Piece>, keys: string[]): Piece[] {
  return keys.flatMap((key) => {
    const piece = pieces.get(key);
    return piece ? [piece] : [];
  });
}

function superChoice(amount: bigint, price8: bigint, label = stableLabel, network?: string, id?: string): PayChoice {
  const shown = formatAmount(amount / 10n ** 12n, 6, 2);
  const value = valueOf(amount, 18, price8);
  return { pay: "usdcx", label, balance: shown, usd: money(value), maxUsd: maxUsdInput(value), network, id };
}

async function spendableSuperOn(net: GroupNet, owner: Address): Promise<bigint> {
  const site = vaultSite(net);
  try {
    const [wallet, vault] = await Promise.all([
      site.client.readContract({ address: site.fusdcx, abi: erc20, functionName: "balanceOf", args: [owner] }),
      site.client.readContract({ address: site.factory, abi: factoryAbi, functionName: "vaultOf", args: [owner] }),
    ]);
    if (vault === zeroAddress) return wallet;
    const idle = await site.client.readContract({ address: vault, abi: vaultAbi, functionName: "unallocated", args: [site.fusdcx] });
    return wallet + idle;
  } catch {
    return 0n;
  }
}

export async function loadHoldings(owner: Address, portfolio: Portfolio, quote: Quote): Promise<HoldingsView> {
  const baseSaved: SavedToken[] = [
    { key: "base-usdcx", label: "USDCx", address: baseUsdcx, group: "usd" },
    { key: "base-ethx", label: "ETHx", address: baseEthx, group: "eth" },
  ];
  const celoSaved: SavedToken[] = [
    { key: "celo-cusdx", label: "cUSDx", address: celoCusdx, group: "usd" },
    { key: "celo-celox", label: "CELOx", address: celoCelox, group: "celo" },
  ];
  const [prices, quotes, balances, listed, superAmount, baseWei, celoWei, basePositions, celoPositions] = await Promise.all([
    loadPrices(),
    coinMap(["ethereum", "celo", "gooddollar"]),
    walletBalances(owner),
    listedBalances(owner),
    spendableSuper(owner),
    baseReader.getBalance({ address: owner }),
    celoReader.getBalance({ address: owner }),
    savedOn(8453, owner, baseFactory, baseLocks, baseSaved),
    savedOn(42220, owner, celoFactory, celoLocks, celoSaved),
  ]);
  const { reads, eth, ethx } = balances;
  const usdc = readAmount(reads, 0);
  const usdt = readAmount(reads, 1);
  const spendableSuperBalance = BigInt(portfolio.wallet) + BigInt(portfolio.idle);
  const streamingSuper = BigInt(portfolio.streaming);
  const usdSuper = spendableSuperBalance + BigInt(portfolio.held) + streamingSuper + BigInt(portfolio.locked);
  let ethxLocked = 0n;
  for (const lock of portfolio.locks) {
    if (!lock.settled && lock.token.toLowerCase() === addresses.ethx.toLowerCase()) ethxLocked += BigInt(lock.principal);
  }
  const wrappedEth = ethx + ethxLocked;
  const ethPrice = chain.id === 42220 ? quotes.ethereum : prices.ethUsd8;
  const celoPrice = quotes.celo;
  const goodPrice = prices.gdxUsd8 > 0n ? prices.gdxUsd8 : quotes.gooddollar;
  const pieces = new Map<string, Piece>();
  const put = (piece: Piece) => pieces.set(piece.key, piece);
  for (const { token, amount } of listed) {
    const price = token.pegged ? prices.usdcUsd8 : goodPrice;
    put({
      key: token.key,
      label: token.label,
      network: token.network,
      group: "usd",
      amount,
      decimals: token.decimals,
      value: valueOf(amount, token.decimals, price),
    });
  }
  put({
    key: "base-eth",
    label: "ETH",
    network: "Base",
    group: "eth",
    amount: baseWei,
    decimals: 18,
    value: valueOf(baseWei, 18, ethPrice),
  });
  put({
    key: "celo",
    label: "CELO",
    network: "Celo",
    group: "celo",
    amount: celoWei,
    decimals: 18,
    value: valueOf(celoWei, 18, celoPrice),
  });
  put({
    key: "usdcx",
    label: stableLabel,
    network: holdingCaption(networkName, spendableSuperBalance, streamingSuper),
    group: "usd",
    amount: usdSuper,
    decimals: 18,
    value: valueOf(usdSuper, 18, prices.usdcUsd8),
  });
  const nativeSuperLabel = chain.id === 42220 ? "CELOx" : "ETHx";
  const nativeSuperPrice = chain.id === 42220 ? celoPrice : ethPrice;
  put({
    key: "ethx",
    label: nativeSuperLabel,
    network: networkName,
    group: chain.id === 42220 ? "celo" : "eth",
    amount: wrappedEth,
    decimals: 18,
    value: valueOf(wrappedEth, 18, nativeSuperPrice),
  });
  for (const { token, amount } of [...basePositions, ...celoPositions]) {
    const price = token.group === "celo" ? celoPrice : token.group === "eth" ? ethPrice : prices.usdcUsd8;
    put({
      key: token.key,
      label: token.label,
      network: token.key.startsWith("celo") ? "Celo" : "Base",
      group: token.group,
      amount,
      decimals: 18,
      value: valueOf(amount, 18, price),
    });
  }
  const usdKeys = [
    "base-usdc", "base-usdt", "base-usdm", "base-usdcx",
    ...(chain.id === 42220 ? [] : ["usdcx"]),
    "celo-usdc", "celo-usdt", "celo-usdm", "celo-usdm-mountain", "celo-cusdx",
    ...(chain.id === 42220 ? ["usdcx"] : []),
  ];
  const usdParts = take(pieces, usdKeys).filter((piece) => piece.group === "usd");
  const ethParts = take(pieces, ["base-eth", "base-ethx", "ethx"]).filter((piece) => piece.group === "eth");
  const celoParts = take(pieces, ["celo", "celo-celox", "ethx"]).filter((piece) => piece.group === "celo");
  const gdxPiece = pieces.get("celo-gooddollar") ?? {
    key: "celo-gooddollar",
    label: "G$",
    network: "Celo",
    group: "usd" as const,
    amount: 0n,
    decimals: 18,
    value: 0n,
  };
  const goodDollar = partOf(gdxPiece, quote, prices.usdcUsd8);
  const rows = [
    groupRow("usd", "USD", usdParts, quote, prices.usdcUsd8),
    groupRow("eth", "ETH", ethParts, quote, prices.usdcUsd8),
    groupRow("celo", "CELO", celoParts, quote, prices.usdcUsd8),
  ];
  const total = [...usdParts, ...ethParts, ...celoParts, gdxPiece].reduce((sum, piece) => sum + piece.value, 0n);
  const streamingUsd8 = valueOf(BigInt(portfolio.streaming), 18, prices.usdcUsd8);
  const lockedUsd8 = valueOf(BigInt(portfolio.locked), 18, prices.usdcUsd8) + valueOf(ethxLocked, 18, prices.ethUsd8);
  const columns = balanceColumns(total, streamingUsd8, lockedUsd8);
  const idleValue = valueOf(BigInt(portfolio.idle), 18, prices.usdcUsd8);
  const localUnit = quote.code === "usd" || quote.code === "fusdcx" ? undefined : quote.unit;
  return {
    rows,
    totalUsd: money(total),
    totalLocal: localText(total, quote, prices.usdcUsd8),
    localUnit,
    totalUsd8: total.toString(),
    availableUsd8: columns.available.toString(),
    streamingUsd8: columns.streaming.toString(),
    lockedUsd8: columns.locked.toString(),
    usdcUsd8: prices.usdcUsd8.toString(),
    available: money(columns.available),
    streaming: money(columns.streaming),
    locked: money(columns.locked),
    idleUsd: money(idleValue),
    choices: payChoices(
      prices,
      usdc,
      usdt,
      eth,
      reads[0]?.status === "success",
      reads[1]?.status === "success",
      superAmount,
      undefined,
      undefined,
      listed.find((row) => row.token.key === "celo-gooddollar")?.amount ?? 0n,
    ),
    goodDollar,
    gdxTrade: {
      usdm: formatAmount(listed.find((row) => row.token.key === "celo-usdm")?.amount ?? 0n, 18, 4),
      gdx: goodDollar.amount,
      usdc: formatAmount(listed.find((row) => row.token.key === "celo-usdc")?.amount ?? 0n, 6, 2),
      usdt: formatAmount(listed.find((row) => row.token.key === "celo-usdt")?.amount ?? 0n, 6, 2),
      celo: formatAmount(celoWei, 18, 6),
    },
  };
}

function payChoices(
  prices: Awaited<ReturnType<typeof loadPrices>>,
  usdc: bigint,
  usdt: bigint,
  eth: bigint,
  usdcListed: boolean,
  usdtListed: boolean,
  superAmount: bigint,
  network?: string,
  net?: GroupNet,
  gdx = 0n,
): PayChoice[] {
  const choices: PayChoice[] = [];
  const celo = Boolean(network?.startsWith("Celo"));
  const tag = (pay: PayAsset) => (net ? `${net}-${pay}` : pay);
  choices.push(superChoice(superAmount, prices.usdcUsd8, celo ? "cUSDx" : stableLabel, network, tag("usdcx")));
  if (celo || chain.id === 42220) {
    const gdxUsd8 = prices.gdxUsd8 > 0n ? prices.gdxUsd8 : 0n;
    choices.push({
      pay: "gdx",
      label: "G$",
      balance: formatAmount(gdx, 18, 4),
      usd: money(valueOf(gdx, 18, gdxUsd8)),
      maxUsd: maxUsdInput(valueOf(gdx, 18, gdxUsd8)),
      network: network ?? "Celo",
      id: tag("gdx"),
    });
  }
  choices.push({
    pay: "eth",
    label: celo ? "CELO" : chain.nativeCurrency.symbol,
    balance: formatAmount(eth, 18, 6),
    usd: money(valueOf(eth, 18, prices.ethUsd8)),
    maxUsd: maxUsdInput(valueOf(eth, 18, prices.ethUsd8)),
    network,
    id: tag("eth"),
  });
  if (usdcListed) {
    choices.push({
      pay: "usdc",
      label: celo ? "USDm" : "USDC",
      balance: formatAmount(usdc, celo ? 18 : 6, celo ? 4 : 2),
      usd: money(valueOf(usdc, celo ? 18 : 6, prices.usdcUsd8)),
      maxUsd: maxUsdInput(valueOf(usdc, celo ? 18 : 6, prices.usdcUsd8)),
      network,
      id: tag("usdc"),
    });
  }
  if (usdtListed) {
    choices.push({
      pay: "usdt",
      label: "USDT",
      balance: formatAmount(usdt, 6, 2),
      usd: money(valueOf(usdt, 6, prices.usdtUsd8)),
      maxUsd: maxUsdInput(valueOf(usdt, 6, prices.usdtUsd8)),
      network,
      id: tag("usdt"),
    });
  }
  return choices;
}

export async function loadPayChoices(owner: Address): Promise<PayChoice[]> {
  const prices = await loadPrices();
  const nets: GroupNet[] = ["celo", "base"];
  const lists = await Promise.all(
    nets.map(async (net) => {
      const site = vaultSite(net);
      const wrapIsSix = site.wrap.toLowerCase() === site.usdc.toLowerCase();
      const dollar = wrapIsSix ? site.usdc : site.wrap;
      const [reads, native, superAmount] = await Promise.all([
        site.client.multicall({
          contracts: [
            { address: dollar, abi: erc20, functionName: "balanceOf" as const, args: [owner] as const },
            { address: site.usdt, abi: erc20, functionName: "balanceOf" as const, args: [owner] as const },
            ...(net === "celo"
              ? [{ address: GOOD_DOLLAR, abi: erc20, functionName: "balanceOf" as const, args: [owner] as const }]
              : []),
          ],
          allowFailure: true,
        }),
        site.client.getBalance({ address: owner }).catch(() => 0n),
        spendableSuperOn(net, owner),
      ]);
      return payChoices(
        prices,
        readAmount(reads, 0),
        readAmount(reads, 1),
        native,
        reads[0]?.status === "success",
        reads[1]?.status === "success",
        superAmount,
        site.name,
        net,
        net === "celo" ? readAmount(reads, 2) : 0n,
      );
    }),
  );
  return lists.flat().sort((left, right) => Number(right.usd.replace(/,/g, "")) - Number(left.usd.replace(/,/g, "")));
}

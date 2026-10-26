import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { QUOTE_DEADLINE_SECONDS, baseMarket } from "@/lib/base-market";
import type { PreparedCall } from "@/lib/intent";
import type { PayAsset, ReceiveAsset } from "@/lib/pay-math";

const erc20 = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
const superToken = parseAbi(["function upgrade(uint256 amount)"]);
const vaultPay = parseAbi([
  "function depositUnderlying(address token, uint256 underlyingAmount)",
  "function withdrawUnderlying(address token, uint256 amount)",
]);
const routerAbi = parseAbi([
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)",
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function refundETH() payable",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[])",
]);

function call(to: Address, data: Hex, value = 0n): PreparedCall {
  return { to, data, value: value.toString() };
}

function approve(token: Address, spender: Address, amount: bigint): PreparedCall {
  return call(token, encodeFunctionData({ abi: erc20, functionName: "approve", args: [spender, amount] }));
}

export type FundInput = {
  payer: Address;
  pay: PayAsset;
  /** Where USDC is wrapped. "vault" calls depositUnderlying. "wallet" calls USDCx.upgrade. */
  mode: "vault" | "wallet";
  vault: Address;
  /** 6-decimal USDC that must be wrapped. */
  underlying: bigint;
  /** 18-decimal amount passed to USDCx.upgrade. Ignored for a vault deposit. */
  minted: bigint;
  /** Quoted input. For USDC this equals `underlying`. */
  amountInMax: bigint;
  feeTier: number;
  deadline: bigint;
  approveRouter: boolean;
  /** USDT on some chains rejects a non-zero allowance change. Reset first when this is set. */
  resetRouterAllowance: boolean;
  approveWrap: boolean;
};

export function buildFundCalls(input: FundInput): PreparedCall[] {
  if (input.underlying <= 0n) return [];
  const calls: PreparedCall[] = [];
  const spender = input.mode === "vault" ? input.vault : baseMarket.usdcx;
  if (input.pay === "usdc") {
    if (input.approveWrap) calls.push(approve(baseMarket.usdc, spender, input.underlying));
    calls.push(wrap(input));
    return calls;
  }
  const tokenIn = input.pay === "eth" ? baseMarket.weth : baseMarket.usdt;
  if (input.pay === "usdt") {
    if (input.resetRouterAllowance) calls.push(approve(baseMarket.usdt, baseMarket.swapRouter02, 0n));
    if (input.approveRouter) calls.push(approve(baseMarket.usdt, baseMarket.swapRouter02, input.amountInMax));
  }
  const swap = encodeFunctionData({
    abi: routerAbi,
    functionName: "exactOutputSingle",
    args: [
      {
        tokenIn,
        tokenOut: baseMarket.usdc,
        fee: input.feeTier,
        recipient: input.payer,
        amountOut: input.underlying,
        amountInMaximum: input.amountInMax,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const inner: Hex[] = input.pay === "eth" ? [swap, encodeFunctionData({ abi: routerAbi, functionName: "refundETH" })] : [swap];
  calls.push(
    call(
      baseMarket.swapRouter02,
      encodeFunctionData({ abi: routerAbi, functionName: "multicall", args: [input.deadline, inner] }),
      input.pay === "eth" ? input.amountInMax : 0n,
    ),
  );
  if (input.approveWrap) calls.push(approve(baseMarket.usdc, spender, input.underlying));
  calls.push(wrap(input));
  return calls;
}

function wrap(input: FundInput): PreparedCall {
  if (input.mode === "vault") {
    return call(
      input.vault,
      encodeFunctionData({
        abi: vaultPay,
        functionName: "depositUnderlying",
        args: [baseMarket.usdcx, input.underlying],
      }),
    );
  }
  return call(baseMarket.usdcx, encodeFunctionData({ abi: superToken, functionName: "upgrade", args: [input.minted] }));
}

export type WithdrawBuild = {
  vault: Address;
  payer: Address;
  /** 18-decimal USDCx idle to downgrade. It must be a multiple of the USDC unit. */
  superAmount: bigint;
  receive: ReceiveAsset;
  feeTier: number;
  deadline: bigint;
  amountOutMinimum: bigint;
  approveRouter: boolean;
  resetRouterAllowance: boolean;
};

export function buildWithdrawCalls(input: WithdrawBuild): PreparedCall[] {
  if (input.superAmount <= 0n) return [];
  const underlying = input.superAmount / (10n ** 12n);
  const calls: PreparedCall[] = [
    call(
      input.vault,
      encodeFunctionData({
        abi: vaultPay,
        functionName: "withdrawUnderlying",
        args: [baseMarket.usdcx, input.superAmount],
      }),
    ),
  ];
  if (input.receive === "usdc") return calls;
  if (input.resetRouterAllowance) calls.push(approve(baseMarket.usdc, baseMarket.swapRouter02, 0n));
  if (input.approveRouter) calls.push(approve(baseMarket.usdc, baseMarket.swapRouter02, underlying));
  const tokenOut = input.receive === "eth" ? baseMarket.weth : baseMarket.usdt;
  const swap = encodeFunctionData({
    abi: routerAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: baseMarket.usdc,
        tokenOut,
        fee: input.feeTier,
        recipient: input.receive === "eth" ? baseMarket.swapRouter02 : input.payer,
        amountIn: underlying,
        amountOutMinimum: input.amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const inner: Hex[] =
    input.receive === "eth"
      ? [swap, encodeFunctionData({ abi: routerAbi, functionName: "unwrapWETH9", args: [input.amountOutMinimum, input.payer] })]
      : [swap];
  calls.push(call(baseMarket.swapRouter02, encodeFunctionData({ abi: routerAbi, functionName: "multicall", args: [input.deadline, inner] })));
  return calls;
}

export function quoteDeadline(nowSeconds: number): bigint {
  return BigInt(nowSeconds + QUOTE_DEADLINE_SECONDS);
}

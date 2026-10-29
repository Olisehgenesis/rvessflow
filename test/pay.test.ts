import assert from "node:assert/strict";
import { decodeFunctionData, parseAbi } from "viem";
import test from "node:test";
import { SLIPPAGE_BPS, SUPER_UNIT, baseMarket } from "@/lib/base-market";
import { buildFundCalls, buildWithdrawCalls } from "@/lib/pay-build";
import {
  formatPrice8,
  fundForNet,
  grossForNet,
  netSuperForUsd,
  parseUsd,
  protocolFeeOf,
  slippageCeiling,
  slippageFloor,
  spendableProblem,
  wrapForSuper,
} from "@/lib/pay-math";

const payer = "0x00000000000000000000000000000000000000a1";
const vault = "0x00000000000000000000000000000000000000b2";
const deadline = 1_700_000_000n;
const routerAbi = parseAbi([
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[])",
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)",
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function refundETH() payable",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
]);
const erc20 = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

test("grossing up the Celo wrap leaves the stream amount after the 0.30% skim", () => {
  const net = 63n * 10n ** 16n;
  const stacked = net + protocolFeeOf(net);
  assert.ok(stacked - protocolFeeOf(stacked) < net);
  const minted = grossForNet(net);
  assert.ok(minted - protocolFeeOf(minted) >= net);
});

test("a $100 deposit at a $1 USDC price keeps a full dollar after the 0.30% skim", () => {
  const net = netSuperForUsd(parseUsd("100"), 100_000_000n);
  assert.equal(net, 100n * 10n ** 18n);
  const sized = fundForNet(net);
  assert.ok(sized.credit >= net);
  assert.equal(sized.fee, protocolFeeOf(sized.minted));
  assert.equal(sized.minted, sized.underlying * SUPER_UNIT);
  const feeUsd = Number(sized.fee) / 1e18;
  assert.ok(feeUsd > 0.3 && feeUsd < 0.31);
});

test("USDC cheaper than a dollar buys more than one token per dollar", () => {
  const atPeg = netSuperForUsd(parseUsd("1"), 100_000_000n);
  const cheap = netSuperForUsd(parseUsd("1"), 99_000_000n);
  assert.ok(cheap > atPeg);
});

test("a price just under a dollar keeps the extra decimals", () => {
  assert.equal(formatPrice8(99_970_000n), "0.9997");
  assert.equal(formatPrice8(100_000_000n), "1.00");
  assert.equal(formatPrice8(230_315_482_829n), "2,303.1548");
});

test("slippage ceiling and floor use the 0.50% limit", () => {
  assert.equal(SLIPPAGE_BPS, 50);
  assert.equal(slippageCeiling(1_000_000n), 1_005_000n);
  assert.equal(slippageFloor(1_000_000n), 995_000n);
  assert.equal(slippageCeiling(1n), 2n);
});

test("parseUsd rejects token-sized dust and commas", () => {
  assert.equal(parseUsd("1,250.5"), 1_250_500_000n);
  assert.throws(() => parseUsd("1.234"));
  assert.throws(() => parseUsd("0"));
});

test("USDC funding is approve plus depositUnderlying, with no swap", () => {
  const sized = fundForNet(50n * 10n ** 18n);
  const calls = buildFundCalls({
    payer,
    pay: "usdc",
    mode: "vault",
    vault,
    underlying: sized.underlying,
    minted: sized.minted,
    amountInMax: sized.underlying,
    feeTier: 500,
    deadline,
    approveRouter: false,
    resetRouterAllowance: false,
    approveWrap: true,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].to, baseMarket.usdc);
  assert.equal(calls[0].value, "0");
  const approval = decodeFunctionData({ abi: erc20, data: calls[0].data });
  assert.equal(approval.functionName, "approve");
  assert.equal(approval.args[0], vault);
  assert.equal(calls[1].to, vault);
});

test("a payment that needs more than the wallet holds is refused before the wallet opens", () => {
  const usdc = spendableProblem({ symbol: "USDC", balance: 297_781n, needed: 1_000_000n, scale: 6, digits: 2 });
  assert.match(usdc ?? "", /0\.29 USDC/);
  assert.match(usdc ?? "", /1 USDC/);
  assert.equal(spendableProblem({ symbol: "USDC", balance: 1_000_000n, needed: 1_000_000n, scale: 6, digits: 2 }), null);
  const eth = spendableProblem({ symbol: "ETH", balance: 60_836_392_943_412n, needed: 60_836_392_943_412n, scale: 18, digits: 6, leaveFee: true });
  assert.match(eth ?? "", /network fee/);
  assert.equal(spendableProblem({ symbol: "ETH", balance: 2n, needed: 1n, scale: 18, digits: 6, leaveFee: true }), null);
});

test("ETH funding batches the swap, the refund, the USDC approval, and the wrap", () => {
  const amountInMax = 50_000_000_000_000_000n;
  const calls = buildFundCalls({
    payer,
    pay: "eth",
    mode: "vault",
    vault,
    underlying: 100_000_000n,
    minted: 100n * 10n ** 18n,
    amountInMax,
    feeTier: 500,
    deadline,
    approveRouter: false,
    resetRouterAllowance: false,
    approveWrap: true,
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].to, baseMarket.swapRouter02);
  assert.equal(calls[0].value, amountInMax.toString());
  const outer = decodeFunctionData({ abi: routerAbi, data: calls[0].data });
  assert.equal(outer.functionName, "multicall");
  assert.equal(outer.args[0], deadline);
  const inner = outer.args[1];
  assert.equal(inner.length, 2);
  const swap = decodeFunctionData({ abi: routerAbi, data: inner[0] });
  assert.equal(swap.functionName, "exactOutputSingle");
  assert.equal(swap.args[0].tokenIn, baseMarket.weth);
  assert.equal(swap.args[0].tokenOut, baseMarket.usdc);
  assert.equal(swap.args[0].recipient.toLowerCase(), payer);
  assert.equal(swap.args[0].amountOut, 100_000_000n);
  assert.equal(swap.args[0].amountInMaximum, amountInMax);
  assert.equal(decodeFunctionData({ abi: routerAbi, data: inner[1] }).functionName, "refundETH");
  assert.equal(calls[1].to, baseMarket.usdc);
  assert.equal(calls[2].to, vault);
});

test("USDT funding resets a stuck allowance and wraps into the wallet for a group or a lock", () => {
  const wrap = wrapForSuper(10n * 10n ** 18n);
  const calls = buildFundCalls({
    payer,
    pay: "usdt",
    mode: "wallet",
    vault,
    underlying: wrap.underlying,
    minted: wrap.minted,
    amountInMax: slippageCeiling(wrap.underlying),
    feeTier: 100,
    deadline,
    approveRouter: true,
    resetRouterAllowance: true,
    approveWrap: true,
  });
  assert.equal(calls[0].to, baseMarket.usdt);
  assert.equal(calls[1].to, baseMarket.usdt);
  assert.equal(calls[2].to, baseMarket.swapRouter02);
  assert.equal(calls[2].value, "0");
  assert.equal(calls[3].to, baseMarket.usdc);
  assert.equal(calls[4].to, baseMarket.usdcx);
  const cleared = decodeFunctionData({ abi: erc20, data: calls[0].data });
  assert.equal(cleared.args[1], 0n);
});

test("withdrawing as USDC is only the vault downgrade", () => {
  const calls = buildWithdrawCalls({
    vault,
    payer,
    superAmount: 25n * 10n ** 18n,
    receive: "usdc",
    feeTier: 500,
    deadline,
    amountOutMinimum: 0n,
    approveRouter: false,
    resetRouterAllowance: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, vault);
});

test("withdrawing as ETH swaps the USDC and unwraps in the same router call", () => {
  const calls = buildWithdrawCalls({
    vault,
    payer,
    superAmount: 20n * SUPER_UNIT,
    receive: "eth",
    feeTier: 500,
    deadline,
    amountOutMinimum: 8_000_000_000_000_000n,
    approveRouter: true,
    resetRouterAllowance: false,
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].to, vault);
  assert.equal(calls[1].to, baseMarket.usdc);
  const outer = decodeFunctionData({ abi: routerAbi, data: calls[2].data });
  assert.equal(outer.functionName, "multicall");
  const swap = decodeFunctionData({ abi: routerAbi, data: outer.args[1][0] });
  assert.equal(swap.functionName, "exactInputSingle");
  assert.equal(swap.args[0].tokenOut, baseMarket.weth);
  assert.equal(swap.args[0].recipient, baseMarket.swapRouter02);
  assert.equal(swap.args[0].amountOutMinimum, 8_000_000_000_000_000n);
  const unwrap = decodeFunctionData({ abi: routerAbi, data: outer.args[1][1] });
  assert.equal(unwrap.functionName, "unwrapWETH9");
  assert.equal(unwrap.args[1].toLowerCase(), payer);
});

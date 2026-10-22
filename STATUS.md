# RvessFlow status

Stopped so the founder can continue on a laptop. This commit is a snapshot, not a finished release.

## Done

- Foundry project (Solidity 0.8.35, via IR, optimizer 200) with OpenZeppelin and a vendored Superfluid framework for local tests.
- Streaming is Superfluid only. The old internal stream maths are gone.
- `FlowVault` plus per-flow `FlowConduit` clones: every flow and subflow is a real CFA stream. Subflow residuals, schedule, keeper gate, and chain checks live in the vault.
- `LockVault`: 3% early-break penalty (max 10%) into a bonus pool weighted by principal × duration. Optional yield is a real CFA stream and is not clawed back.
- `GroupRotation`: ROSCA/chama on a real GDA pool. Collateral is contribution × cycles. Missed windows can be slashed. Refunds are pull-based.
- `TokenAllowlist` reads underlying decimals from the super token. Deploy script registers Base USDCx and ETHx, and Base Sepolia fUSDCx and ETHx. `PRIVATE_KEY` is read from the environment and is not hardcoded.
- Solvency margin: protocol deposit plus a one-hour cushion, and a permissionless `protect`. Vaults are not Super Apps and do not take flow-operator permissions.
- Nested subflows open a CFA only for the residual rate. Group pots account for what the pool actually delivered, then distribute the remainder without touching collateral.

## In progress

- `test/Smoke.t.sol` deploys a local Superfluid framework and opens one CFA flow. The stream starts, but `settle` is still red: the test clock does not reach the flow end (`StillActive`).
- The full suite (many accounts, fuzz, invariants, security proofs) has not been written. `SfBase` was not added.

## Left

- Get `forge test` green, including groups of 3, 10, and 50, many vaults with multiple flows and subflows, 6- and 18-decimal tokens, and warps of a year or more.
- Fuzz and invariant tests. `forge coverage` at or near 100% line and branch on `src/`.
- `SECURITY.md`. Liquidation of a critical account is Superfluid's documented sentinel design, an integration risk for RvessFlow, not a protocol bug unless a passing proof breaks a documented invariant.
- Next.js wallet on Base Sepolia (demo mode is fine if nothing is deployed).
- Replace the stock Foundry `README.md` with architecture, rules, how to test, deploy, and run the frontend, plus a clear not-audited warning.

## Not verified

Contracts compiled with `via_ir` in the cloud session before this snapshot. Do not treat that as a green test run. No deploy has been made. No private key is in the repo.

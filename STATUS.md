# RvessFlow status

The app and the contracts it calls are on Base mainnet. Base Sepolia addresses in the Foundry scripts are unused by the app.

## Done

- Foundry project (Solidity 0.8.35, via IR, optimizer 200) with OpenZeppelin and a vendored Superfluid framework for local tests.
- Streaming is Superfluid only. `FlowVault` plus per-flow `FlowConduit` clones. `LockVault` holds principal with a 3% early-break penalty (max 10%) and optional admin-funded yield. `GroupRotation` runs a rotating pot on a real GDA pool.
- `TokenAllowlist` accepts Base USDCx and ETHx. Live proxy addresses are in [CONTRACTS.md](CONTRACTS.md).
- `forge test` from `contracts/` passed in this workspace: 69 tests, 0 failed. That includes the flow, lock, group, smoke, and invariant suites. Coverage is not claimed at 100%.
- Next.js wallet on Base mainnet. Test accounts still sign on the server from `wallet/testers.json`. Passkey and WalletConnect users sign on their own device. A passkey payment needs `NEXT_PUBLIC_BUNDLER_URL`. No paymaster is wired.
- Saving-goal pause is stored with the goal note. The contract rejects `pause` for a saving goal, and this change does not upgrade mainnet. Flow and expense pause still go to the contract.
- The UI is USD-first. USDCx stays the vault’s unit. Wallet balances of USDC, USDT, and ETH (and USDCx or ETHx when held) are priced with Chainlink on Base. Paying for a deposit, goal, lock, or group contribution swaps USDT or ETH to USDC on Uniswap SwapRouter02 when needed, wraps to USDCx, and deposits. Withdrawals default to USDC. No contract code was changed and nothing was deployed. Passkey gas is still unpaid by a paymaster.
- Home shows a real balance for both an empty account and a funded one. A zero balance is $0.00 with Available, Streaming, and Locked, plus Top up. It is not a separate welcome screen. Short “get started” rows appear only when the account also has no goals, locks, or groups. A funded balance also offers Withdraw. A failed Base read shows an error and a retry, not a fake zero. `RVESS_HOME_FIXTURE=1` opens `/home/preview` for the documented first wallet, and `?view=loading` or `?view=error` for those states. There is no paymaster and no fee-token setting.
- Top up (`/home/add`) offers four methods: convert USDC/USDT/ETH (four-screen review with a live quote, network-fee estimate, and price impact), receive on Base (address plus QR), Uganda mobile money via Kotani Pay, and card onramps via Transak and Coinbase. Provider calls stay behind env vars and show a not-configured state when those vars are empty. No provider secrets are committed.
- Goal descriptions, frequency labels, and the activity feed that the chain does not store live in MotherDuck when `MOTHERDUCK_TOKEN` is set, otherwise in `data/local-store.json` (gitignored).

## Left

- Kotani Pay, Transak, and Coinbase Onramp keys. The screens are built; they do not call the providers until the env vars in `.env.example` are set.
- A bundler paymaster, so a new passkey account can pay gas without already holding ETH.
- An on-chain description and a way to raise a saving goal's target after creation. The create form matches the mockup and sets the target equal to the first deposit.
- Activity history before the factory's recent logs, and top-ups that were never written to the app database, are absent from the feed.
- `SECURITY.md` and an external audit. These contracts are unaudited. Do not add real funds beyond what you can afford to lose.

# RvessFlow

RvessFlow is a savings wallet on Base mainnet, built on Superfluid. Money moves as real Superfluid streams: a constant-flow agreement (CFA) stream or a general-distribution agreement (GDA) pool. The app uses USDCx and ETHx on Base. Base Sepolia addresses in the contracts are historical and the app does not read them.

**These contracts have not been audited. Do not put real funds in them.**

The contract reference is [CONTRACTS.md](CONTRACTS.md).

## What a person can do

One person has one vault and can also be in savings groups. The vault and the groups are separate contracts, so membership does not use up a flow.

A vault holds up to 64 flows in the allowlisted Super Tokens. Several flows can use the same token. Each flow gets its own conduit, so two saving plans can pay the same wallet. Flows can last from one minute up to 30 years.

- **Expense.** Streams to someone else. No goal.
- **Saving goal.** A hold in the vault. Nothing is streamed, and the target may be larger than the first deposit. No subflows.
- **Flow goal.** Streams toward a goal. The goal is required and cannot be larger than the reserved amount.

Subflows are allowed only when the parent permits them. The sum of the children's rates must stay at or under the parent's rate. Depth stops at 3. A flow can start at a chosen time, or when another flow ends or hits its goal. A chain can be 8 flows long. A keeper can be required to release a flow. If no keeper is set, the owner triggers it.

Money for a flow sits in the vault until the stream is opened. The stream does not stop by itself at the end time. Anyone can call `protect` or `settle`. The vault keeps a deposit plus a one-hour cushion so it can be closed before the account goes critical. If nobody calls in time, Superfluid can liquidate the stream.

A lock keeps principal until a chosen time. Breaking it early costs a penalty of 3% by default, at most 10%. The penalty goes into a bonus pool and is split, by principal times duration, among locks that finish. The admin can fund yield in the same Super Token. People who lock with yield on receive a real CFA stream from that budget. The admin sets the rate and can keep topping the budget up. There is no function to take the unused budget back. Yield already streamed stays with the saver.

A group is a rotating pot of 3 to 50 members. Each member has their own payment window inside a cycle of one hour to 366 days, for up to 520 cycles. The pot is a GDA pool streaming to the member whose turn it is. If that member misses their window, the next call moves the stream to the next member who has not missed, and the missed contribution is taken from their collateral. Every payment records who paid whom. A payment after the window repays the person the round went to. It does not reopen the round.

## Layout

| Path | Role |
| --- | --- |
| `src/FlowVault.sol` | One person's flows and subflows |
| `src/FlowConduit.sol` | One CFA sender per flow |
| `src/VaultFactory.sol` | Creates vaults and upgrades them |
| `src/LockVault.sol` | Locks, the penalty pool, and admin-funded yield |
| `src/GroupRotation.sol` | Rotating group pots |
| `src/TokenAllowlist.sol` | Which Super Tokens the protocol accepts |
| `script/Deploy.s.sol` | Base and Base Sepolia deploy |
| `test/` | Local Superfluid tests |

## Build and test

Foundry uses Solidity 0.8.35, the Cancun EVM, the optimizer, and via-IR.

```shell
cd contracts
forge build
forge test
```

The tests deploy a local Superfluid framework. They cover one person in a group and six flows of the same token, groups of 3, 7, 10, and 50, 6-decimal and 18-decimal tokens, warps of a year, fuzz tests, and invariants that the vaults, locks, and groups stay solvent.

Coverage disables via-IR unless you pass `--ir-minimum`. Without it, compilation stops with a stack-too-deep error.

```shell
FOUNDRY_PROFILE=coverage forge coverage --ir-minimum --no-match-coverage "test/*|script/*|lib/*" --report summary
```

## Deploy

Copy `.env.example` to `.env`. Set `PRIVATE_KEY` and, if you want one, `KEEPER`. Never commit `.env` or anything in `wallet/`. Do not broadcast a new mainnet deploy from a cloud agent or with a key you do not control.

```shell
source .env
cd contracts
forge script script/Deploy.s.sol:DeployBaseMainnet --rpc-url "$BASE_RPC_URL" --broadcast
```

`DeployBaseSepolia` remains for the old testnet set. The script deploys upgradeable proxies and registers the chain's Super Tokens. On Base that is USDCx and ETHx. On Base Sepolia there is no Circle USDCx, so the stable token is fUSDCx. Addresses are in `src/SuperfluidAddresses.sol`. The live Base mainnet proxies the app talks to are listed in [CONTRACTS.md](CONTRACTS.md).

The owner can upgrade the allowlist, factory, lock vault, and group through their proxies. An upgrade waits two days. `upgradeVaults` and `upgradeConduits` on the factory upgrade every vault or every conduit.

## App

The web app is the Next.js project at the repository root. It reads Base mainnet (`BASE_RPC_URL`, or `https://mainnet.base.org`).

Signing depends on how you entered:

- **Test account.** The server signs with a key from `wallet/testers.json`. Those keys stay on disk. This path is for development.
- **Wallet.** WalletConnect sends each transaction from the connected account. The app never sees that key.
- **Passkey.** A Kernel 0.3.1 smart account signs a user operation. Set `NEXT_PUBLIC_BUNDLER_URL` to a Base bundler. There is no paymaster, so the smart account pays its own gas.

A saving goal cannot be paused on chain (`pause` reverts for that kind). Pausing one in the app only stops further top-ups. The hold stays in the vault until you resume. Flow and expense pauses still call the contract.

```shell
npm run dev
```

`npm run lint` checks the app. Contract tests still run from `contracts/` with `forge test`. The last full run of that suite in this workspace passed (69 tests).

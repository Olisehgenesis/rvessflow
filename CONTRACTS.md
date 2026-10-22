# RvessFlow contracts

These contracts have not been audited. Do not put real funds in them.

RvessFlow holds savings and pays them out as Superfluid streams. A flow or subflow is a constant-flow agreement (CFA) stream. A group pot is a general-distribution agreement (GDA) pool. The accepted tokens are Super Tokens on the allowlist, normally USDCx and ETHx. On Base Sepolia the stable token is fUSDCx.

The protocol owner is the admin. The owner can pause new positions, set the lock penalty and the yield rate, fund yield, pause a group, and upgrade the contracts. The owner cannot withdraw a user's flow balance, lock principal, penalty pool, unused yield budget, group collateral, or a group pot, and cannot rewrite who paid whom.

## Upgrade

`TokenAllowlist`, `VaultFactory`, `LockVault`, and `GroupRotation` are UUPS proxies. Call `initialize` once through the proxy. `upgradeToAndCall` is owner-only.

Each person gets one `FlowVault`, and each flow gets one `FlowConduit`. Both are beacon proxies. The factory owner calls `upgradeVaults` or `upgradeConduits` to move every existing vault or conduit to a new implementation. A new vault implementation must be constructed with the same Superfluid host and CFA forwarder.

`contractVersion` returns `1` on the current implementations.

## TokenAllowlist

The owner registers a Super Token with `setSuperToken(token, allowed, kind)`.

| Kind | Meaning |
| --- | --- |
| `Wrapper` | Has an ERC-20 underlying. Decimals must be from 1 to 18 and must match the token. |
| `Native` | ETHx. Underlying must be empty. |
| `Pure` | A pure Super Token with no underlying. |

`setPaused(true)` blocks new flows, new locks, and new groups. It does not block settle, protect, withdraw, or an already running stream.

## VaultFactory

`createVault` deploys one beacon-proxy vault for `msg.sender`. A second call reverts. `vaultOf` returns that address.

`setKeeper` stores an optional keeper address. The keeper can trigger a gated flow and cannot move tokens. Flows still run if the keeper is unset: the owner calls `trigger`. `setAllowlist` points vaults at a new allowlist. Vaults read the allowlist from the factory on each use.

## FlowVault

The vault owner deposits with `depositSuper`, `depositUnderlying`, or `depositNative`. Idle value is `unallocated`. Only the owner can `withdraw`, `withdrawUnderlying`, or `withdrawNative`, and only up to the unallocated balance. A withdraw that would leave the vault critical within the hour reverts.

`createFlow` reserves the stream amount, the CFA deposits for the vault-to-conduit and conduit-to-recipient streams, and one hour of rate as a cushion.

| Limit | Value |
| --- | --- |
| Flows per vault | 64, including subflows and settled flows |
| Subflow depth | 3 |
| Children of one flow | 16 |
| Chain length | 8 |
| Duration | 60 seconds to 30 years |

`createSubflow` is allowed only before the root starts, only if the parent allows subflows, and only if the children's rates still fit under the parent. Share mode sets the child rate to `parent.rate * shareBps / 10000`. A saving goal cannot allow subflows, and its recipient must be the owner. An expense cannot have a goal.

`activate` opens the CFA streams once the flow is ready. Ready means the earliest start time has passed, a chained predecessor has ended or reached its goal, and a keeper-gated flow has been triggered. `trigger` is the owner or the factory keeper. Anyone can activate a ready flow.

`cancel` is the owner. Cancelling a subflow before the root starts folds that rate back into the parent. Cancelling a root closes the tree. `settle` closes a root after its end, or earlier if the outward stream was deleted or the vault will be critical within the hour. `protect(token)` closes every root in that token that is due, broken, or about to be critical.

The stream keeps running past `end` until one of those calls. After the one-hour cushion, the vault can go critical and a third party can liquidate the CFA deposit. Call `protect` before then.

## FlowConduit

CFA allows one stream between a pair of addresses. The vault streams to the conduit, and the conduit streams to the person, so two flows can pay the same wallet. `setStream` and `close` accept only the vault.

## LockVault

`lock` and `lockUnderlying` pull a Super Token, or wrap an underlying token, and hold it until `end`. Duration is one hour to 30 years.

`breakEarly` before the end returns principal minus the penalty. The penalty is `penaltyBps` of principal, 300 by default and at most 1000. It is added to `bonusPool`. `withdrawMature` at or after the end returns principal plus that lock's share of the pool. The share is this lock's `principal * duration` divided by the weight of locks still open in that token when this one finishes.

`setPenaltyBps` is the owner. It applies to breaks after the change.

Yield is optional per lock. The owner sets `yieldPerTokenPerSecond`: wei of the same Super Token streamed per second for each 1e18 of principal. The owner, or anyone, adds tokens with `fundYield` or `fundYieldUnderlying`. Those tokens become `yieldBudget`. A lock opened with `earnYield` true starts a CFA stream from the lock vault to the saver. The rate of an open stream does not change when the owner sets a new rate. Streamed yield is already in the saver's wallet, so an early break does not take it back. The stream stops when the lock ends or is broken.

`protect` and `protectUser` close yield streams when the remaining budget cannot cover the CFA deposit plus one hour of yield. That stop is there so yield cannot spend locked principal. The owner cannot withdraw principal, penalties, or the yield budget.

## GroupRotation

`createGroup` takes the token, contribution, cycle length, window, grace, cycle count, members, and each member's offset from the start of the cycle. The creator must be a member. Offsets, the window, and the grace must fit inside the cycle. Windows may differ per member.

Collateral is `contribution * totalCycles`. Every member calls `postCollateral`, then the creator calls `start`. `start` opens a GDA pool whose admin is the group. Units are not transferable, and only the group can distribute. Each member calls `connect` so the pool streams to them. The forwarder's `connectPool` would connect the group itself, so the contract uses `tryConnectPoolFor` for the member. A member can be connected to at most four pools.

`contribute` pulls one contribution during that member's window, or during the grace period after it. On time and late-but-inside-grace are both recorded. The pot streams to `activeRecipient`. `recipientOf` remains the scheduled turn.

If the window and grace have passed, the next `contribute`, `sync`, `catchUp`, or `protect` settles the miss. The contribution is slashed from collateral into the pot, `owed` increases by the contribution, and `missed` increases by one. If the missed member was the one receiving the pot, the stream moves in that same call to the next member who has not missed. A later `contribute` or `repay` pays that debt down and restores collateral. The payment stays marked slashed, and the round does not come back.

`paidFromTo(group, from, to)` is what `from` has sent toward `to`. `owedFromTo` is what `from` still owes `to`. `ledger` and `ledgerOf` return given, received, owed, misses, and whether they are in owe. `legAt` is one booked payment: who sent it, whose round it was for, the cycle, the amount, and whether it was on time, late, slashed, or a repayment. `place` is waiting, in the window, missed, or in owe.

`received` is what the pool has accounted to that member, which can be a little under the nominal rate. At the end of a cycle the remainder of the pot is distributed without spending collateral.

`finalize` waits until every cycle has ended, settles any still-open misses, stops the stream, and lets members `claimCollateral`. `cancelBeforeStart` is only the creator, and only before `start`.

`setGroupPaused` is the owner. A paused group rejects new contributions, repayments, and `start`. Sync, protect, settle, and claims still run.

The group keeps collateral as its solvency margin and caps the pool flow so the GDA deposit fits in the pot. Anyone can `protect`. A missed call can still leave the account critical after the one-hour window, the same as a vault.

## Solvency

`isAccountCritical` on a Super Token means the available balance is below zero. These contracts stay positive by reserving the stream amount, the protocol deposit, and one extra hour, and by exposing `protect` to anyone. That is an operation the keeper or any caller has to make. It is not automatic at the flow's end time.

A solvent vault cannot be liquidated by a third party. Deleting its stream reverts with `CFA_NON_CRITICAL_SENDER`. After the cushion, liquidation is Superfluid's rule: the liquidator can delete the stream and take the deposit reward.

## Deployed token addresses

Forwarders are the same on Base and Base Sepolia.

| | Address |
| --- | --- |
| CFA forwarder | `0xcfA132E353cB4E398080B9700609bb008eceB125` |
| GDA forwarder | `0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08` |
| Base host | `0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74` |
| Base USDCx | `0xD04383398dD2426297da660F9CCA3d439AF9ce1b` |
| Base ETHx | `0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93` |
| Base Sepolia host | `0x109412E3C84f0539b43d39dB691B08c90f58dC7c` |
| Base Sepolia fUSDCx | `0x1650581F573eAd727B92073B5Ef8B4f5B94D1648` |
| Base Sepolia ETHx | `0x143ea239159155B408e71CDbE836e8CFD6766732` |

Source of those constants: `src/SuperfluidAddresses.sol`.

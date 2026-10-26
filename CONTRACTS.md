# RvessFlow Protocol

These contracts were reviewed against a Solidity security checklist. That is not an external audit. Do not put real funds in them.

The RvessFlow Protocol holds savings and pays them out as Superfluid streams. A flow or subflow is a constant-flow agreement (CFA) stream. A group pot is a general-distribution agreement (GDA) pool. The accepted tokens are Super Tokens on the allowlist, normally USDCx and ETHx. On Base Sepolia the stable token is fUSDCx.

The protocol owner is one address. That address should be a Safe, so several people sign upgrades and treasury actions, and the contracts still see a single owner. The owner can add support managers, set the token list, set the lock penalty and the yield rate, fund yield, and upgrade the contracts. The owner cannot withdraw a user's flow balance, lock principal, penalty pool, unused yield budget, group collateral, or a group pot, and cannot rewrite who paid whom.

Support managers are a separate list on the allowlist. The owner adds and removes them with `setManager`. A manager can pause new positions and pause a group, so support can stop a stuck group without holding the Safe. Only the owner can unpause. A manager cannot upgrade, change the token list, change the penalty or the yield rate, add another manager, or withdraw fees. A group has its own admins, added with `addGroupAdmin`. Those people run that group. They are not protocol managers.

## Upgrade

`TokenAllowlist`, `VaultFactory`, `LockVault`, and `GroupRotation` are UUPS proxies. Call `initialize` once through the proxy. An upgrade waits two days. The owner calls `scheduleUpgrade` with the new implementation, and `upgradeToAndCall` reverts until that time. The same wait applies to the factory's own upgrade.

Each person gets one `FlowVault`, and each flow gets one `FlowConduit`. Both are beacon proxies. The factory owner calls `scheduleVaultUpgrade` or `scheduleConduitUpgrade`, waits two days, then `upgradeVaults` or `upgradeConduits`. A new vault implementation must be constructed with the same Superfluid host and CFA forwarder.

`contractVersion` returns `3` on the allowlist, `2` on the factory, `3` on the lock vault, and `4` on the group. The 26 October 2026 Base Sepolia deployment owned by the 2-of-3 Safe returns those versions. The older Sepolia proxies are still on allowlist 2 and group 3.

## TokenAllowlist

The owner registers a Super Token with `setSuperToken(token, allowed, kind)`.

| Kind | Meaning |
| --- | --- |
| `Wrapper` | Has an ERC-20 underlying. Decimals must be from 1 to 18 and must match the token. |
| `Native` | ETHx. Underlying must be empty. |
| `Pure` | A pure Super Token with no underlying. |

`setPaused(true)` blocks new flows, new locks, and new groups. The owner or a support manager may pause. Only the owner may pass `false`. It does not block settle, protect, withdraw, or an already running stream. `setManager` is the owner only. `managerAt` lists the current managers.

## VaultFactory

`createVault` deploys one beacon-proxy vault for `msg.sender`. A second call reverts. `vaultOf` returns that address.

`setKeeper` stores an optional keeper address. The keeper can trigger a gated flow and cannot move tokens. Flows still run if the keeper is unset: the owner calls `trigger`. `setAllowlist` points vaults at a new allowlist. Vaults read the allowlist from the factory on each use.

## FlowVault

The vault owner deposits with `depositSuper`, `depositUnderlying`, or `depositNative`. Idle value is `unallocated`. Only the owner can `withdraw`, `withdrawUnderlying`, or `withdrawNative`, and only up to the unallocated balance. A withdraw that would leave the vault critical within the hour reverts.

`createFlow` for an expense or a flow goal reserves the stream amount, the CFA deposits for the vault-to-conduit and conduit-to-recipient streams, and one hour of rate as a cushion. A saving goal reserves only the amount that will be held. It does not open a CFA stream, so it posts no deposit and no cushion. `openSavings` creates that hold and starts it in one call. The target may be larger than the first deposit.

`topUp` adds idle tokens to a saving goal, or extends an expense or flow goal at the same rate. `release` moves part of a saving goal back to idle. `pause` stops an expense or flow goal and keeps the unstreamed balance reserved. `resume` opens a new conduit for the time that was left. `recoverSurplus` credits tokens that arrived outside a deposit, and it does not treat an active stream's reserve as idle. `balanceSheet` and `progress` read idle, held, and still-due amounts.

| Limit | Value |
| --- | --- |
| Flows per vault | 64 unsettled flows, including subflows. Settled flows stay in history and free a slot |
| Subflow depth | 3 |
| Children of one flow | 16 |
| Chain length | 8 |
| Duration | 60 seconds to 30 years |

`createSubflow` is allowed only before the root starts, only if the parent allows subflows, and only if the children's rates still fit under the parent. Share mode sets the child rate to `parent.rate * shareBps / 10000`. A saving goal cannot allow subflows, and its recipient must be the owner. An expense cannot have a goal.

`activate` opens the CFA streams once an expense or a flow goal is ready. A saving goal is marked active and holds the deposit in the vault. Ready means the earliest start time has passed, a chained predecessor has ended or reached its goal, and a keeper-gated flow has been triggered. A paused flow is not ready. `trigger` is the owner or the factory keeper. Anyone can activate a ready flow.

`cancel` is the owner. Cancelling a subflow before the root starts folds that rate back into the parent. Cancelling a root, or anything in a paused tree, closes the tree and returns what was not streamed. `settle` closes a root after its end, or earlier if the outward stream was deleted, the vault will be critical within the hour, or a flow goal has already streamed its goal. A saving goal returns the full hold, because nothing was streamed. `protect(token)` closes every active root in that token that is due, broken, or about to be critical.

An expense or flow goal keeps running past `end` until one of those calls. After the one-hour cushion, that vault can go critical and a third party can liquidate the CFA deposit. Call `protect` before then. A saving goal does not stream, so it cannot be liquidated.

## FlowConduit

CFA allows one stream between a pair of addresses. The vault streams to the conduit, and the conduit streams to the person, so two flows can pay the same wallet. `setStream` and `close` accept only the vault.

## LockVault

`lock` and `lockUnderlying` pull a Super Token, or wrap an underlying token, and hold it until `end`. Duration is one hour to 30 years.

`breakEarly` before the end returns principal minus the penalty. The penalty is the rate copied onto the lock at creation, 300 by default and at most 1000. It is added to `bonusPool`. `withdrawPartial` takes part of the principal at that same rate and leaves the rest locked. `withdrawMature` at or after the end returns principal plus that lock's share of the pool. The share is this lock's weight divided by the weight of locks still open in that token when this one finishes. `topUp` adds principal. Weight added is the new amount times the time still left. `lockGoal` stores a name and a target, which may be larger than the first deposit.

`setPenaltyBps` is the owner. It applies to locks created after the change. An open lock keeps the rate it was created with.

Yield is optional per lock. The owner sets `yieldPerTokenPerSecond`: wei of the same Super Token streamed per second for each 1e18 of principal. The owner, or anyone, adds tokens with `fundYield` or `fundYieldUnderlying`. Those tokens are transferred to `yieldPayer` and counted in `yieldBudget`. A lock opened with `earnYield` true starts a CFA stream from the payer to the saver. The payer holds only the reward budget, so a reward stream cannot spend locked principal. The rate of an open stream does not change when the owner sets a new global rate. `topUp` on a yielding lock adds to that saver's stream. Streamed yield is already in the saver's wallet, so an early break does not take it back. The stream stops when the lock ends or is broken.

`protect` and `protectUser` close yield streams when the remaining budget cannot cover the CFA deposit plus one hour of yield. If nobody calls and the budget runs out, Superfluid can liquidate the payer. The lock vault still pays principal. The owner cannot withdraw principal, penalties, or the yield budget.

## GroupRotation

`createGroup` takes the token, contribution, cycle length, window, grace, cycle count, members, and each member's offset from the start of the cycle. The creator must be a member. Offsets, the window, and the grace must fit inside the cycle. Windows may differ per member. `setMemberWindow` sets one member's window before start. Zero means the group window.

Collateral is `contribution * totalCycles`. Every member calls `postCollateral`. Before `start`, `exitBeforeStart` returns that member's collateral and removes them, and the payout order is remapped rather than wiped. `removeBeforeStart` drops a member who never posted, and returns collateral if they had. `start` then requires at least three members, each of whom has posted. The creator calls `start`. If the creator has already left, any remaining member may, and that former creator is no longer an admin. `start` opens a GDA pool whose admin is the group. Units are not transferable, and only the group can distribute.

Each member calls `connect` so the pool streams to them. The contract can attach a member to four pools on one token. Someone in ten groups still receives ten streams: the first four use `connect`, and the member's own wallet calls the GDA forwarder's `connectPool` for each pool after that. Superfluid allows 256 of those self-connections per token. USDCx and ETHx are separate. A finished group keeps its slot until that member disconnects the pool. `claimStream` still pulls a pool they have not connected. An admin-fee pool is a second stream and is not attached automatically. An admin calls `connectAdminFee`, or `connectPool` on that pool once the four contract attachments are used.

`contribute` pulls one contribution during that member's window, or during the grace period after it. On time and late-but-inside-grace are both recorded. The pot streams to `activeRecipient`. `recipientOf` remains the scheduled turn.

If the window and grace have passed, the next `contribute`, `sync`, `catchUp`, or `protect` settles the miss. The contribution is slashed from collateral into the pot, `owed` increases by the contribution, and `missed` increases by one. If the missed member was the one receiving the pot, the stream moves in that same call to the next member who has not missed. A later `contribute` or `repay` pays that debt down and restores collateral. The payment stays marked slashed, and the round does not come back.

`paidFromTo(group, from, to)` is what `from` has sent toward `to`. `owedFromTo` is what `from` still owes `to`. `ledger` and `ledgerOf` return given, received, owed, misses, and whether they are in owe. `legAt` is one booked payment: who sent it, whose round it was for, the cycle, the amount, and whether it was on time, late, slashed, or a repayment. `place` is waiting, in the window, missed, or in owe.

`received` is what the pool has accounted to that member, which can be a little under the nominal rate. At the end of a cycle the remainder of the pot is distributed without spending collateral. `claimPayout` is the member the pot is streaming to. It stops that stream and distributes the funded remainder in one lump, still without spending collateral. Later contributions in the cycle can start a stream again.

`finalize` waits until every cycle has ended, settles still-open misses, stops the stream, and lets members `claimCollateral`. One call books at most 50 misses. If a long silence is still catching up, `finalize` returns without marking the group final and emits `GroupCatchingUp`. The caller repeats it until every cycle is booked. `cancelBeforeStart` is an admin, or any remaining member once the creator has left. `previewMember` returns one member's offset, window, grace, and the cycle index on which they are paid.

`setGroupPaused(true)` is the owner or a support manager. Only the owner may unpause. While a group is paused its clock stays at the moment the pause began, the pool stream is stopped, and `contribute`, `repay`, and `settleMissed` revert. `sync` does not slash. Unpausing adds the paused seconds back, so a window that was open stays open.

The group keeps collateral as its solvency margin and caps the pool flow so the GDA deposit fits in the pot. Anyone can `protect`. A missed call can still leave the account critical after the one-hour window, the same as a vault.

## Solvency

`isAccountCritical` on a Super Token means the available balance is below zero. These contracts stay positive by reserving the stream amount, the protocol deposit, and one extra hour, and by exposing `protect` to anyone. That is an operation the keeper or any caller has to make. It is not automatic at the flow's end time.

A solvent vault cannot be liquidated by a third party. Deleting its stream reverts with `CFA_NON_CRITICAL_SENDER`. After the cushion, liquidation is Superfluid's rule: the liquidator can delete the stream and take the deposit reward.

## Deployments

Base mainnet and Base Sepolia are separate deployments. Money on one does not move to the other. A person using the app accepts the terms before they sign. The terms are at `/terms` in the app.

### Base mainnet

Deployed 25 October 2026. These contracts have not had an external audit. Any two of the three wallets below can upgrade, pause, change tokens, change fees, and name managers. One wallet is not enough. The owner is the 2-of-3 Safe.

| | Address |
| --- | --- |
| First wallet | `0x9b6A52A88a1Ee029Bd14170fFb8fB15839Bd18cB` |
| Second wallet | `0xf7dbD2867f55832E4A05E16Cd69cB57A70923cDD` |
| Third wallet | `0x53eaF4CD171842d8144e45211308e5D90B4b0088` |
| Owner | `0x780c78D104090477300eb148148b3329f8959899` |
| Signing contract | `0x87d7801994fec45e2a5565d201f3967af427222b` |
| Allowlist implementation | `0xcD83B2C687d89DE94f6A528E69d5953De0b71Fda` |
| Allowlist | `0x34e748f13c294ED3b8Cdd1dd65C45b58981dBe8b` |
| Conduit implementation | `0xC0fcEF3C1165B72a9e6170b0a77c0F9D7F2558f1` |
| Vault implementation | `0xDEf73c9c39e0adE09faDC928254e792bf8F51371` |
| Factory implementation | `0xD148E2e27357a6903Ab46c2d530Ef84Ba65D5478` |
| Factory | `0xc21B7Bd68F8235b7DB2827334d2039fD8B3C118d` |
| Lock vault implementation | `0xBD675F1c5395d1B6764a9B6b268550F15E48A017` |
| Lock vault | `0x68B0667E098A62b3e3F437DBeb0aEdB746cD4c41` |
| Group implementation | `0x3920469b30958FE92d32F19Bc552DC315EE9FFFc` |
| Group | `0x13008059FAd0348Fb8848A0737F9E826C82199fa` |

On this deployment `contractVersion` is 3 on the allowlist, 2 on the factory, 3 on the lock vault, and 4 on the group. No keeper was set.

The constructors also created these contracts. The live beacons are the ones owned by the factory proxy. The yield payer used by the lock vault is the second one.

| | Address |
| --- | --- |
| Vault code extension | `0x2eE04C683f14C5de76131131E46050f5Ee38b399` |
| Group extension | `0x52A24bc5E3b060ce83F2a48cbA6f6F4EB0AE6295` |
| Yield payer, lock implementation | `0xA99Cb51AC79D47ff791859BDf049984EAc026A42` |
| Yield payer, lock vault | `0xd93cbeCD471bD0ED4ecdF4c5A658b8924dE72A79` |
| Vault beacon | `0x8bBf21fd3fC858ABE9aaf83E7551D1fE6B604719` |
| Conduit beacon | `0xfce3999211f63c5B11175A885E4DCEa56fD030f1` |

Source for every address above, including the OpenZeppelin proxies and beacons, is an exact match on Sourcify and verified on Basescan. The allowlist is [on Basescan](https://basescan.org/address/0x34e748f13c294ED3b8Cdd1dd65C45b58981dBe8b#code) and [on Sourcify](https://sourcify.dev/server/v2/contract/8453/0x34e748f13c294ED3b8Cdd1dd65C45b58981dBe8b). Basescan treats the four proxies as proxies and points each one at its implementation.

### Base Sepolia

Deployed 26 October 2026. Localhost reads this set when `RVESS_NETWORK=sepolia`. Production still reads Base mainnet. The owner is a 2-of-3 Safe. Jamie, Alex, and Taylor are the signers. Any two of them can act. One is not enough. fUSDCx and ETHx are allowlisted. No keeper was set. `contractVersion` is 3 on the allowlist, 2 on the factory, 3 on the lock vault, and 4 on the group. Gas was paid by `0xB1819b7287B8e709A526D942f5c3e1ae7389054D`.

| | Address |
| --- | --- |
| Jamie | `0x7190De5bf1dEDEad830ba81F64e70801Dc575797` |
| Alex | `0x8351f673C77CB49Fe25d4bB6F2198c01167C9b51` |
| Taylor | `0xfccEAFCe6A372ed3181E041f07A33fe1503c7176` |
| Owner | `0xA9741381a7bd12Ed9c6354D685438ecD66d8eD56` |
| Allowlist implementation | `0x30dA2123603773721a21569bf2A9a23d91BB29EF` |
| Allowlist | `0xed115A3Ac77036fD7f4ec4B597d655B486d7AB6D` |
| Conduit implementation | `0x34977B0f54d2fdF26cC9342475A68e8519526583` |
| Vault implementation | `0x67C5183E0850AE5697d0Fa47AAf18F43F8D52c1A` |
| Factory implementation | `0xb716271BA253f7daF2Eac60370AAf9D778c8Db39` |
| Factory | `0x18E484ca13A7e63511343EB474C13e04C0929354` |
| Lock vault implementation | `0xA964cd3d54FaA1081e787FC76a3C2c0666706565` |
| Lock vault | `0x99F4f175e117a16D554AEAbee4a2a5b754c2540E` |
| Group implementation | `0xBe4C482A15C9abcD6d07F927A1E65778f9e2f0EB` |
| Group | `0x70f5CF80052E8a8E0e5e252d33cd15F059956E3D` |

An earlier deploy the same day is owned by the single testnet wallet `0xB1819b7287B8e709A526D942f5c3e1ae7389054D`. Localhost does not read it.

| | Address |
| --- | --- |
| Owner | `0xB1819b7287B8e709A526D942f5c3e1ae7389054D` |
| Allowlist implementation | `0x83f92BbF36B3571d6D277833f6a270aCdDB87422` |
| Allowlist | `0x2321F908B9A7d57529f1AcB9C47d307D91508bfa` |
| Conduit implementation | `0xd3a0fe447Ca47ce7be6d9a534b70E5FdD4433c2e` |
| Vault implementation | `0x00F9F4D841D0Df171Da35FE0fC8554dbE72d798C` |
| Factory implementation | `0xBBd32A69ad5C11aeAD09b702F4F191f1458abF09` |
| Factory | `0xC316c9fF147d5eb859e328f113b74805a3eC128a` |
| Lock vault implementation | `0x0B2918a44C58302e94A53f0c46676a891DE7D898` |
| Lock vault | `0xb75Ba3e52afA970AE6D396e3d3dcD9d64575e44A` |
| Group implementation | `0xE6f1E77c63c97da7a7492d0086C708fE92a8C53C` |
| Group | `0xDE28D909dc07eF47c1e75c6252828bF490685589` |

The constructors also created these contracts. The live beacons are the ones owned by the factory proxy. The yield payer used by the lock vault is the second one.

| | Address |
| --- | --- |
| Vault code extension | `0x6dA02741f9F1128AD9e4f3899B2E3Bf1E6C52a4d` |
| Group extension | `0xa87E0B959B00570c392e35a2e02C8218d8B81631` |
| Yield payer, lock implementation | `0x9749E82B22e35f521E2e7f59bB08F1494A8406E8` |
| Yield payer, lock vault | `0xC3254D598AC2C7776ed7cc2e9Ff4Be9b290Be28d` |
| Vault beacon | `0x096a9a24eFeE2B07664b90b383C881Fd67D3653b` |
| Conduit beacon | `0x8ebE77Eb0BD47D67237Cf3D9a31c0B5F0961Ba4e` |

An earlier Sepolia deployment is still on chain and was not upgraded. Its owner is the same wallet. Allowlist version 2, factory 2, lock vault 3, group 3.

| | Address |
| --- | --- |
| Allowlist | `0xD1c99f91c3495735929F49D62E430B9a1536D4EE` |
| Factory | `0xf60322153F176b98e552263465F05A9c260A0979` |
| Lock vault | `0xD28D065E0A9d1F12f14E3d51e245658A7aAAb410` |
| Group | `0x37F0d018517Ce6F7E72476155b41251F0d6aA6F8` |

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

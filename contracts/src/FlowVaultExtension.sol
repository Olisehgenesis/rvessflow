// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ISuperTokenMini} from "./interfaces/ISuperfluidMini.sol";
import {FlowVaultStore, IFlowVaultHooks} from "./FlowVaultStore.sol";

interface IProtocolOwner {
    function owner() external view returns (address);
}

/// @notice Savings holds, pause, and balance reads for {FlowVault}.
///         The vault delegatecalls here. Storage is the vault's storage.
contract FlowVaultExtension is FlowVaultStore {
    constructor(address host_, address cfa_, address conduit_) FlowVaultStore(host_, cfa_, conduit_) {
        _disableInitializers();
    }

    /// @notice Stop an expense or flow-goal stream. The unstreamed balance stays reserved.
    function pause(uint256 id) external nonReentrant onlyOwner {
        Flow storage root = _flows[id];
        if (root.createdAt == 0 || root.parentId != 0 || root.settled || !root.active) revert NotActive();
        if (root.kind == FlowKind.SavingGoal) revert BadKind();
        if (root.paused) revert AlreadyPaused();
        address token = root.token;
        IFlowVaultHooks(address(this)).hookProtect(token);
        root = _flows[id];
        if (!root.active || root.settled) revert NotActive();
        uint64 nowT = uint64(block.timestamp);
        if (nowT >= root.end) revert NotActive();
        root.remaining = root.end - nowT;
        IFlowVaultHooks(address(this)).hookSilence(id);
        root = _flows[id];
        root.liveRate = 0;
        root.active = false;
        root.paused = true;
        activeCount[root.token] -= 1;
    }

    /// @notice Open the same stream again for the time that was left at the pause.
    function resume(uint256 id) external nonReentrant onlyOwner {
        Flow storage root = _flows[id];
        if (root.parentId != 0 || root.settled || !root.paused) revert NotPaused();
        address token = root.token;
        IFlowVaultHooks(address(this)).hookProtect(token);
        root = _flows[id];
        if (!root.paused || root.settled) revert NotPaused();
        uint64 nowT = uint64(block.timestamp);
        uint64 already = root.duration - root.remaining;
        root.start = nowT - already;
        root.end = nowT + root.remaining;
        root.paused = false;
        root.active = true;
        root.liveRate = root.rate - root.childRate;
        activeCount[root.token] += 1;
        int96 live = root.liveRate;
        uint64 start = root.start;
        uint64 end = root.end;
        IFlowVaultHooks(address(this)).hookOpen(id, live);
        IFlowVaultHooks(address(this)).hookOpenChildren(id, start, end);
        IFlowVaultHooks(address(this)).hookRequireMargin(token);
    }

    /// @notice Add money to a saving goal, or extend an expense by `amount` at the same rate.
    function topUp(uint256 id, uint256 amount) external nonReentrant onlyOwner {
        Flow storage root = _flows[id];
        if (root.createdAt == 0 || root.parentId != 0 || root.settled) revert NotFound();
        address token = root.token;
        IFlowVaultHooks(address(this)).hookProtect(token);
        root = _flows[id];
        if (root.settled) revert NotFound();
        if (amount == 0) revert ZeroAmount();
        if (unallocated[token] < amount) revert Insufficient();
        if (root.kind == FlowKind.SavingGoal) {
            unallocated[token] -= amount;
            root.reserved += amount;
            return;
        }
        uint256 per = uint256(uint96(root.rate));
        if (per == 0) revert BadRate();
        uint256 extraSeconds = amount / per;
        if (extraSeconds == 0) revert BadAmount();
        if (root.duration + extraSeconds > MAX_DURATION) revert BadDuration();
        uint256 add = per * extraSeconds;
        unallocated[token] -= add;
        root.reserved += add;
        root.duration += uint64(extraSeconds);
        if (root.paused) root.remaining += uint64(extraSeconds);
        if (root.active) root.end += uint64(extraSeconds);
    }

    /// @notice Move part of a saving goal back to idle. The rest stays held.
    function release(uint256 id, uint256 amount) external nonReentrant onlyOwner {
        Flow storage flow = _flows[id];
        if (flow.createdAt == 0 || flow.parentId != 0 || flow.settled) revert NotFound();
        if (flow.kind != FlowKind.SavingGoal) revert BadKind();
        if (amount == 0 || amount > flow.reserved) revert BadAmount();
        address token = flow.token;
        IFlowVaultHooks(address(this)).hookProtect(token);
        flow = _flows[id];
        flow.reserved -= amount;
        unallocated[token] += amount;
        if (flow.reserved == 0) {
            if (flow.active) activeCount[token] -= 1;
            flow.active = false;
            flow.settled = true;
            _dropOpen(1);
            _untrackRoot(token, id);
            emit FlowSettled(id, unallocated[token]);
        }
    }

    /// @notice Credit tokens that arrived outside a deposit, without touching reserved funds.
    function recoverSurplus(address token) external nonReentrant onlyOwner {
        IFlowVaultHooks(address(this)).hookProtect(token);
        uint256 expected = unallocated[token] + protocolFees[token];
        uint256[] storage roots = liveRoots[token];
        uint256 n = roots.length;
        for (uint256 i; i < n; ++i) {
            Flow storage flow = _flows[roots[i]];
            if (flow.settled) continue;
            if (flow.paused) {
                expected += _outflowRate(roots[i]) * flow.remaining + _heldReserve(roots[i]) + flow.cushion + flow.buffers;
            } else if (!flow.active || flow.kind == FlowKind.SavingGoal) {
                expected += flow.reserved + flow.cushion + flow.buffers;
            } else {
                uint256 elapsed = block.timestamp >= flow.end ? flow.duration : block.timestamp - flow.start;
                uint256 streamed = _outflowRate(roots[i]) * elapsed;
                uint256 unstreamed = flow.reserved > streamed ? flow.reserved - streamed : 0;
                expected += unstreamed + flow.cushion;
            }
        }
        uint256 bal = ISuperTokenMini(token).balanceOf(address(this));
        if (bal > expected) unallocated[token] += bal - expected;
    }

    /// @notice Idle, money held in saving goals, and money still due on open streams.
    function balanceSheet(address token) external view returns (uint256 idle, uint256 held, uint256 streaming) {
        idle = unallocated[token];
        uint256[] memory roots = _rootsOf(token);
        uint256 n = roots.length;
        for (uint256 i; i < n; ++i) {
            Flow storage flow = _flows[roots[i]];
            if (flow.settled) continue;
            if (flow.kind == FlowKind.SavingGoal) {
                held += flow.reserved;
            } else if (flow.paused) {
                streaming += _outflowRate(roots[i]) * flow.remaining + _heldReserve(roots[i]);
            } else if (!flow.active) {
                streaming += flow.reserved;
            } else {
                uint256 elapsed = block.timestamp >= flow.end ? flow.duration : block.timestamp - flow.start;
                uint256 streamed = _outflowRate(roots[i]) * elapsed;
                streaming += flow.reserved > streamed ? flow.reserved - streamed : 0;
            }
        }
    }

    /// @notice What a saving goal still holds, its target, and when the hold ends.
    function progress(uint256 id) external view returns (uint256 saved, uint256 target, uint64 end, bool holding) {
        Flow storage flow = _flows[id];
        if (flow.createdAt == 0) revert NotFound();
        saved = flow.kind == FlowKind.SavingGoal && !flow.settled ? flow.reserved : 0;
        target = flow.goalAmount;
        end = flow.end;
        holding = flow.kind == FlowKind.SavingGoal && !flow.settled;
    }

    /// @notice Protocol admin withdraws the 0.3% kept on deposits. The saver cannot.
    function withdrawProtocolFees(address token, address to) external nonReentrant {
        if (msg.sender != IProtocolOwner(factory).owner()) revert NotOwner();
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = protocolFees[token];
        if (amount == 0) revert ZeroAmount();
        protocolFees[token] = 0;
        ISuperTokenMini(token).transfer(to, amount);
        IFlowVaultHooks(address(this)).hookRequireMargin(token);
        emit ProtocolFeeWithdrawn(token, to, amount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ITokenAllowlist} from "./interfaces/ITokenAllowlist.sol";
import {
    ISuperTokenMini,
    IGDAv1Forwarder,
    ISuperfluidGovernance,
    ISuperfluidHost,
    ISuperfluidPool
} from "./interfaces/ISuperfluidMini.sol";
import {SuperTokenReceiver} from "./SuperTokenReceiver.sol";
import {GroupRotationExtension} from "./GroupRotationExtension.sol";
import {GroupRotationStore} from "./GroupRotationStore.sol";

/// @title GroupRotation
/// @notice RvessFlow Protocol. A ROSCA / chama. Members contribute once per cycle inside their own
///         window. A streaming group pays that cycle's recipient with a real GDA pool flow.
///         A plain group pays the same turn as a transfer, with no pool.
/// @dev Collateral (contribution × cycles) stays here until the group ends and
///      is the solvency margin for the pool's deposit. A missed window is
///      settled on the next call: the missed contribution is slashed from
///      collateral into the pot, and if that member's own round was the one
///      streaming, the stream moves to the next member in the same call.
///      Every leg records who paid whom. Paying after your window does not
///      rewrite the round; it repays the person the round actually went to.
///      The owner can pause a group and upgrade this contract. The owner
///      cannot take collateral, the pot, or rewrite a leg.
contract GroupRotation is GroupRotationStore {
    using SafeERC20 for IERC20;

    address public immutable extension;

    constructor(address allowlist_, address host_, address gda_) GroupRotationStore(allowlist_, host_, gda_) {
        extension = address(new GroupRotationExtension(allowlist_, host_, gda_));
        _registerSuperTokenReceiver();
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        if (initialOwner == address(0)) revert ZeroAddress();
        _transferOwnership(initialOwner);
        if (nextId == 0) nextId = 1;
        _registerSuperTokenReceiver();
    }

    function contractVersion() public pure virtual returns (uint256) {
        return 5;
    }

    /// @notice Schedule an upgrade. It can be executed after six hours. Members can still exit a group
    ///         that has not started, and can still claim after it ends.
    function scheduleUpgrade(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        pendingImplementation = newImplementation;
        upgradeReadyAt = uint64(block.timestamp) + UPGRADE_DELAY;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        if (newImplementation != pendingImplementation || block.timestamp < upgradeReadyAt) revert UpgradeNotReady();
    }

    /// @notice Stop new contributions and repayments. Sync, protect, settle, and
    ///         claims still run, so a pause cannot hide a miss or trap collateral.
    ///         The protocol owner may pause or unpause. A support manager may only pause.
    function setGroupPaused(uint256 id, bool paused_) external nonReentrant {
        if (msg.sender != owner() && (!paused_ || !allowlist.isManager(msg.sender))) revert NotManager();
        if (groups[id].creator == address(0)) revert BadState();
        if (paused_ == groupPaused[id]) {
            emit GroupPausedSet(id, paused_);
            return;
        }
        if (paused_) {
            // Freeze the group clock at this moment so a pause cannot expire windows.
            pauseBegan[id] = uint64(block.timestamp);
            groupPaused[id] = true;
            if (groups[id].rate != 0) _setRate(id, 0);
        } else {
            pauseAccum[id] += uint64(block.timestamp) - pauseBegan[id];
            pauseBegan[id] = 0;
            groupPaused[id] = false;
        }
        emit GroupPausedSet(id, paused_);
    }

    function postCollateral(uint256 id) external nonReentrant {
        Group storage g = groups[id];
        if (g.creator == address(0) || g.started || g.cancelled) revert BadState();
        uint256 index = _memberIndex(id, msg.sender);
        Member storage m = _members[id][index];
        if (m.collateralPosted) revert AlreadyPosted();
        uint256 got = _pullExact(g.token, g.collateralRequired);
        _pullProtocol(g.token, g.collateralRequired);
        m.collateral = uint128(got);
        m.collateralPosted = true;
        _holdCollateral(g.token, got);
        emit CollateralPosted(id, msg.sender, got);
    }

    /// @notice Stop a group that has not started. Members pull their own collateral.
    function cancelBeforeStart(uint256 id) external {
        Group storage g = groups[id];
        if (_indexOf[id][g.creator] == 0) _memberIndex(id, msg.sender);
        else if (!_isAdmin(id, msg.sender)) revert NotAdmin();
        if (g.started || g.cancelled) revert BadState();
        g.cancelled = true;
        emit GroupCancelled(id);
    }

    function contribute(uint256 id) external nonReentrant {
        if (groupPaused[id]) revert Paused();
        Group storage g = groups[id];
        if (!g.started || g.finalized) revert BadState();
        _sync(id, false);
        (uint256 cycle, bool open) = currentCycle(id);
        if (!open) revert CycleOver();
        uint256 index = _memberIndex(id, msg.sender);
        Member storage m = _members[id][index];
        Payment storage p = payments[id][cycle][index];
        // The window is already closed. This payment does not reopen it. It
        // repays the member the round went to.
        if (p.status == PayStatus.Slashed) {
            if (m.owed == 0) revert AlreadyPaid();
            _repay(id, index, g.contribution);
            return;
        }
        if (p.status != PayStatus.None) revert AlreadyPaid();

        (uint64 windowStart, uint64 graceEnd, uint64 cycleEnd) = _bounds(id, cycle, index);
        uint64 nowT = _now(id);
        if (nowT < windowStart) revert TooEarly();
        if (nowT > graceEnd || nowT >= cycleEnd) revert TooLate();

        PayStatus status = nowT <= windowStart + _windowAt(id, index) ? PayStatus.OnTime : PayStatus.Late;
        _pullExact(g.token, g.contribution);
        _pullProtocol(g.token, g.contribution);
        // Book the payment before the admin-fee pull. A token callback then sees
        // this window as already paid, so it cannot be settled as a miss.
        p.amount = g.contribution;
        p.paidAt = uint64(block.timestamp);
        p.status = status;
        pots[id][cycle].funded += g.contribution;
        _fundPot(g.token, g.contribution);
        address to = g.plain ? _activeRecipient(id, cycle) : (g.streamingTo != address(0) ? g.streamingTo : _activeRecipient(id, cycle));
        _pushLeg(id, msg.sender, to, g.contribution, uint16(cycle), status);
        m.given += g.contribution;
        emit Contributed(id, cycle, msg.sender, status, g.contribution);
        if (g.plain) _payPlain(id, cycle, to, g.contribution);
        adminFeeGate = id;
        _ext(abi.encodeWithSignature("takeAdminFee(uint256)", id));
        _sync(id, false);
    }

    /// @notice Send tokens against an open debt. Does not give the missed round back.
    function repay(uint256 id, uint128 amount) external nonReentrant {
        if (groupPaused[id]) revert Paused();
        Group storage g = groups[id];
        if (!g.started || g.finalized || g.cancelled) revert BadState();
        _sync(id, false);
        uint256 index = _memberIndex(id, msg.sender);
        if (amount == 0 || amount > _members[id][index].owed) revert NothingOwed();
        _repay(id, index, amount);
    }

    /// @notice Settle every window that has already closed, then point the stream
    ///         at whoever the round now belongs to.
    function catchUp(uint256 id) external nonReentrant {
        _sync(id, false);
    }

    function settleMissed(uint256 id, uint256 cycle, uint256 memberIndex) external nonReentrant {
        if (groupPaused[id]) revert Paused();
        _settle(id, cycle, memberIndex);
        _sync(id, false);
    }

    /// @notice Pay the current recipient the funded pot now, as one distribution.
    ///         The stream stops for what was already funded. Later contributions can stream again.
    function claimPayout(uint256 id) external nonReentrant {
        if (groupPaused[id]) revert Paused();
        Group storage g = groups[id];
        if (g.plain) revert BadState();
        if (!g.started || g.finalized) revert BadState();
        _sync(id, false);
        if (g.streamingTo != msg.sender) revert NotMember();
        _setRate(id, 0);
        _noteStreamed(id);
        uint256 left = _remainingPot(id);
        uint256 free = _liquid(g.token, _backing(id, left));
        if (left > free) left = free;
        if (left == 0) revert NothingToClaim();
        _point(id, msg.sender);
        uint256 beforeBal = ISuperTokenMini(g.token).balanceOf(address(this));
        gda.distribute(g.token, address(this), g.pool, left, "");
        uint256 spent = beforeBal - ISuperTokenMini(g.token).balanceOf(address(this));
        _bookPaid(id, g.streamingCycle, msg.sender, spent);
        _slideSnapshot(id);
        emit PayoutClaimed(id, msg.sender, spent);
    }

    /// @notice Connect `msg.sender` to the group's pool so the pot can stream to them.
    /// @dev Implemented on the extension. Superfluid lets this contract attach a member
    ///      to four pools on one token. A fifth pool, and every pool after it up to 256,
    ///      is connected by the member's own wallet with `GDAv1Forwarder.connectPool`.
    function connect(uint256) external returns (bool connected) {
        _delegate();
    }

    function claimStream(uint256 id) external returns (bool) {
        Group storage g = groups[id];
        if (g.pool == address(0)) revert BadState();
        return gda.claimAll(g.pool, msg.sender, "");
    }

    /// @notice Keep the pool solvent. Anyone may call. An emergency closes the
    ///         flow and pays the remainder of the open pot through the pool.
    function protect(uint256 id) external nonReentrant {
        _sync(id, _criticalSoon(groups[id].token));
    }

    function sync(uint256 id) external nonReentrant {
        _sync(id, false);
    }

    function finalize(uint256 id) external nonReentrant {
        Group storage g = groups[id];
        if (!g.started || g.finalized || g.cancelled) revert BadState();
        uint64 end = g.startTime + uint64(g.totalCycles) * g.cycleDuration;
        if (_now(id) < end) revert StillRunning();
        _sync(id, true);
        if (settledThrough[id] < g.totalCycles) {
            emit GroupCatchingUp(id, settledThrough[id]);
            return;
        }
        g.finalized = true;
        emit GroupFinalized(id);
    }

    /// @notice Pull leftover collateral after cancel or finalize.
    function claimCollateral(uint256 id) external nonReentrant returns (uint256 amount) {
        Group storage g = groups[id];
        if (!g.cancelled && !g.finalized) revert BadState();
        uint256 index = _memberIndex(id, msg.sender);
        Member storage m = _members[id][index];
        amount = m.collateral;
        if (amount == 0) revert NothingToClaim();
        m.collateral = 0;
        _releaseCollateral(g.token, amount);
        ISuperTokenMini(g.token).transfer(msg.sender, amount);
        emit Claimed(id, msg.sender, amount);
    }

    function currentCycle(uint256 id) public view returns (uint256 cycle, bool open) {
        Group storage g = groups[id];
        uint64 nowT = _now(id);
        if (!g.started || nowT < g.startTime) return (0, false);
        cycle = (nowT - g.startTime) / g.cycleDuration;
        if (cycle >= g.totalCycles) return (g.totalCycles, false);
        open = true;
    }

    function recipientOf(uint256 id, uint256 cycle) public view returns (address) {
        Group storage g = groups[id];
        if (cycle >= g.totalCycles || g.memberCount == 0) revert BadCycle();
        return _members[id][_memberSeat(id, cycle)].account;
    }

    /// @notice Who the pot is streaming to for `cycle` after misses are applied.
    function activeRecipient(uint256 id, uint256 cycle) external view returns (address) {
        return _activeRecipient(id, cycle);
    }

    function groupsOf(address user) external view returns (uint256[] memory) {
        return _groupsOf[user];
    }

    function poolOf(uint256 id) external view returns (address) {
        return groups[id].pool;
    }

    function collateralOwed(uint256 id) public view returns (uint256 total) {
        uint256 n = groups[id].memberCount;
        for (uint256 i; i < n; ++i) {
            total += _members[id][i].collateral;
        }
    }

    function _sync(uint256 id, bool forceClose) internal {
        Group storage g = groups[id];
        if (!g.started || g.finalized) return;
        if (g.plain) {
            _syncPlain(id, forceClose);
            return;
        }
        if (g.pool == address(0)) return;
        // A pause freezes misses and stops the stream. It does not move collateral.
        if (groupPaused[id]) {
            if (g.rate != 0) _setRate(id, 0);
            _touchAdminFee(id);
            return;
        }
        (uint256 cycle, bool open) = currentCycle(id);
        _catchUp(id, cycle, open && !forceClose);
        uint256 settled = settledThrough[id];
        _noteStreamed(id);
        if (g.cycleOpen && g.streamingCycle < settled) _finishStreamingCycle(id);
        uint256 distributeUpTo = settled;
        if (!forceClose && open && distributeUpTo > cycle) distributeUpTo = cycle;
        for (uint256 c; c < distributeUpTo; ++c) {
            if (!pots[id][c].closed) _distributePot(id, c);
        }
        if (forceClose || !open) {
            _setRate(id, 0);
            _touchAdminFee(id);
            return;
        }
        // Prior cycles still have misses to book. Don't open this cycle's stream on top of that.
        if (settled < cycle) {
            _touchAdminFee(id);
            return;
        }
        bool opened;
        if (!g.cycleOpen) {
            g.streamingCycle = uint16(cycle);
            g.cycleOpen = true;
            g.rateUpdatedAt = uint64(block.timestamp);
            opened = true;
        }
        address recipient = _activeRecipient(id, cycle);
        bool switched = g.streamingTo != recipient;
        _point(id, recipient);
        if (switched || opened) _setSnapshot(id);
        _setRate(id, _safeRate(id));
        emit PoolRetargeted(id, cycle, recipient, g.rate);
        _touchAdminFee(id);
    }

    /// @dev A plain group has no pool. Missed windows still slash collateral, and that
    ///      amount is transferred to whoever the turn now belongs to.
    function _syncPlain(uint256 id, bool forceClose) internal {
        if (groupPaused[id]) return;
        (uint256 cycle, bool open) = currentCycle(id);
        _catchUp(id, cycle, open && !forceClose);
        uint256 end = forceClose || !open ? groups[id].totalCycles : cycle + 1;
        for (uint256 c; c < end; ++c) {
            Cycle storage pot = pots[id][c];
            if (pot.closed) continue;
            uint256 left = pot.funded > pot.accounted ? pot.funded - pot.accounted : 0;
            if (left > 0) _payPlain(id, c, _activeRecipient(id, c), left);
            // A live cycle can still receive the next contribution or a slash.
            // Close it only after that cycle is over and nothing is waiting.
            bool finished = forceClose || !open || c < cycle;
            if (finished && pot.accounted >= pot.funded) pot.closed = true;
        }
    }

    function _payPlain(uint256 id, uint256 cycle, address to, uint256 amount) internal {
        if (to == address(0) || amount == 0) return;
        Group storage g = groups[id];
        uint256 free = _liquid(g.token, _backing(id, amount));
        if (amount > free) amount = free;
        if (amount == 0) return;
        ISuperTokenMini(g.token).transfer(to, amount);
        _bookPaid(id, cycle, to, amount);
    }

    function _finishStreamingCycle(uint256 id) internal {
        _setRate(id, 0);
        _noteStreamed(id);
        _distributePot(id, groups[id].streamingCycle);
        groups[id].cycleOpen = false;
    }

    /// @dev `balanceOf` on a super token is the available balance and hides the
    ///      GDA deposit. Callers stop the flow first so the deposit is spendable,
    ///      then this pays only what is still unaccounted and never the collateral.
    function _distributePot(uint256 id, uint256 cycle) internal {
        Group storage g = groups[id];
        Cycle storage pot = pots[id][cycle];
        if (pot.closed) return;
        uint256 left = pot.funded > pot.accounted ? pot.funded - pot.accounted : 0;
        if (left == 0) {
            pot.closed = true;
            return;
        }
        _point(id, _activeRecipient(id, cycle));
        uint256 free = _liquid(g.token, _backing(id, left));
        if (left > free) left = free;
        // Nothing can move yet. Leave the pot open so the next sync can pay it.
        if (left == 0) return;
        uint256 beforeBal = ISuperTokenMini(g.token).balanceOf(address(this));
        gda.distribute(g.token, address(this), g.pool, left, "");
        uint256 spent = beforeBal - ISuperTokenMini(g.token).balanceOf(address(this));
        _bookPaid(id, cycle, g.streamingTo, spent);
        _slideSnapshot(id);
        if (pot.accounted >= pot.funded) pot.closed = true;
    }

    function _point(uint256 id, address recipient) internal {
        if (recipient == address(0)) return;
        Group storage g = groups[id];
        if (g.streamingTo == recipient) return;
        if (g.streamingTo != address(0)) gda.updateMemberUnits(g.pool, g.streamingTo, 0, "");
        gda.updateMemberUnits(g.pool, recipient, 1, "");
        g.streamingTo = recipient;
    }

    /// @dev Count what the pool actually delivered since the last snapshot, and add it.
    ///      A miss moves the stream to the next member and starts a new snapshot. The
    ///      previous member's tokens stay in `accounted`. Replacing it would pay that
    ///      stream again at the end of the cycle.
    ///      GDA may stream a hair under the requested rate. The gap is paid by
    ///      `_distributePot` at the end of the cycle.
    function _noteStreamed(uint256 id) internal {
        Group storage g = groups[id];
        if (!g.cycleOpen || g.streamingTo == address(0)) return;
        uint256 received = ISuperfluidPool(g.pool).getTotalAmountReceivedByMember(g.streamingTo);
        uint256 delta = received > g.receivedSnapshot ? received - g.receivedSnapshot : 0;
        Cycle storage pot = pots[id][g.streamingCycle];
        uint256 room = pot.funded > pot.accounted ? pot.funded - pot.accounted : 0;
        if (delta > room) delta = room;
        if (delta != 0) _bookPaid(id, g.streamingCycle, g.streamingTo, delta);
        // Move past tokens that already left, including any hair above this pot,
        // so a later top-up is not charged for them.
        if (received > g.receivedSnapshot) g.receivedSnapshot = received;
    }

    function _bookPaid(uint256 id, uint256 cycle, address to, uint256 amount) internal {
        if (amount == 0) return;
        pots[id][cycle].accounted += amount;
        _accountPot(groups[id].token, amount);
        _creditReceived(id, to, amount);
    }

    function _slideSnapshot(uint256 id) internal {
        Group storage g = groups[id];
        if (g.pool == address(0) || g.streamingTo == address(0)) return;
        uint256 received = ISuperfluidPool(g.pool).getTotalAmountReceivedByMember(g.streamingTo);
        if (received > g.receivedSnapshot) g.receivedSnapshot = received;
    }

    function _setSnapshot(uint256 id) internal {
        Group storage g = groups[id];
        if (g.streamingTo == address(0)) return;
        g.receivedSnapshot = ISuperfluidPool(g.pool).getTotalAmountReceivedByMember(g.streamingTo);
    }

    function _safeRate(uint256 id) internal view returns (int96) {
        Group storage g = groups[id];
        uint256 remaining = _remainingPot(id);
        if (remaining == 0) return 0;
        uint64 cycleEnd = _cycleStart(g, g.streamingCycle) + g.cycleDuration;
        uint64 nowT = _now(id);
        if (nowT >= cycleEnd) return 0;
        return _capRate(g.token, remaining, cycleEnd - nowT, _backing(id, remaining));
    }

    function _remainingPot(uint256 id) internal view returns (uint256) {
        Group storage g = groups[id];
        Cycle storage pot = pots[id][g.streamingCycle];
        return pot.funded > pot.accounted ? pot.funded - pot.accounted : 0;
    }

    function _capRate(address token, uint256 remaining, uint256 timeLeft, uint256 reserved) internal view returns (int96) {
        uint256 denom = timeLeft + _liquidationPeriod(token) + PROTECT_WINDOW;
        uint256 perSecond = remaining / denom;
        uint256 cap = remaining / timeLeft;
        if (perSecond > cap) perSecond = cap;
        uint256 freeRate = _freeRate(token, reserved, denom);
        if (perSecond > freeRate) perSecond = freeRate;
        if (perSecond == 0 || perSecond > uint256(uint96(type(int96).max))) return 0;
        return int96(int256(perSecond));
    }

    function _freeRate(address token, uint256 reserved, uint256 denom) internal view returns (uint256) {
        (int256 available, uint256 deposit,,) = ISuperTokenMini(token).realtimeBalanceOfNow(address(this));
        uint256 owned = available > 0 ? uint256(available) + deposit : deposit;
        if (owned <= reserved) return 0;
        return (owned - reserved) / denom;
    }

    function _setRate(uint256 id, int96 rate) internal {
        Group storage g = groups[id];
        if (g.rate == rate) return;
        gda.distributeFlow(g.token, address(this), g.pool, rate, "");
        g.rate = rate;
        g.rateUpdatedAt = uint64(block.timestamp);
    }

    function _settle(uint256 id, uint256 cycle, uint256 memberIndex) internal {
        Group storage g = groups[id];
        if (!g.started || g.finalized) revert BadState();
        if (cycle >= g.totalCycles) revert BadCycle();
        if (memberIndex >= g.memberCount) revert BadMember();
        Payment storage p = payments[id][cycle][memberIndex];
        if (p.status != PayStatus.None) revert AlreadyPaid();
        Member storage m = _members[id][memberIndex];
        (, uint64 graceEnd, uint64 cycleEnd) = _bounds(id, cycle, memberIndex);
        uint64 nowT = _now(id);
        if (nowT < cycleEnd && nowT <= graceEnd) revert StillOpen();

        uint128 slash = g.contribution;
        if (slash > m.collateral) slash = m.collateral;
        m.collateral -= slash;
        _releaseCollateral(g.token, slash);
        if (m.collateral < g.contribution) m.defaulted = true;
        p.amount = slash;
        p.paidAt = uint64(block.timestamp);
        p.status = PayStatus.Slashed;
        pots[id][cycle].funded += slash;
        _fundPot(g.token, slash);
        m.owed += g.contribution;
        m.missed += 1;
        _pushLeg(id, m.account, address(0), g.contribution, uint16(cycle), PayStatus.Slashed);
        emit MissSettled(id, cycle, memberIndex, slash);
    }

    function _bounds(uint256 id, uint256 cycle, uint256 index)
        internal
        view
        returns (uint64 windowStart, uint64 graceEnd, uint64 cycleEnd)
    {
        Group storage g = groups[id];
        uint64 cycleStart = _cycleStart(g, cycle);
        windowStart = cycleStart + _members[id][index].offset;
        graceEnd = windowStart + _windowAt(id, index) + g.graceDuration;
        cycleEnd = cycleStart + g.cycleDuration;
    }

    function _cycleStart(Group storage g, uint256 cycle) internal view returns (uint64) {
        return g.startTime + uint64(cycle) * g.cycleDuration;
    }

    function _memberIndex(uint256 id, address account) internal view returns (uint256) {
        uint256 index = _indexOf[id][account];
        if (index == 0) revert NotMember();
        return index - 1;
    }

    function _pullExact(address token, uint256 amount) internal returns (uint256 got) {
        uint256 beforeBal = ISuperTokenMini(token).balanceOf(address(this));
        ISuperTokenMini(token).transferFrom(msg.sender, address(this), amount);
        got = ISuperTokenMini(token).balanceOf(address(this)) - beforeBal;
        if (got != amount) revert FeeOnTransfer();
    }

    function _liquidationPeriod(address token) internal view returns (uint256 period) {
        (period,) = ISuperfluidGovernance(ISuperfluidHost(host).getGovernance()).getPPPConfig(host, token);
        if (period == 0) period = 4 hours;
    }

    function _criticalSoon(address token) internal view returns (bool) {
        return ISuperTokenMini(token).isAccountCritical(address(this), block.timestamp + PROTECT_WINDOW);
    }

    /// @dev One call books at most this many misses. A quiet group is finished by calling again.
    uint256 internal constant MAX_SETTLE_OPS = 50;

    function _catchUp(uint256 id, uint256 cycle, bool open) internal {
        Group storage g = groups[id];
        uint256 n = g.memberCount;
        uint256 budget = MAX_SETTLE_OPS;
        uint256 cursor = settledThrough[id];
        uint256 end = open ? cycle : g.totalCycles;
        for (uint256 c = cursor; c < end; ++c) {
            bool done = true;
            for (uint256 i; i < n; ++i) {
                if (payments[id][c][i].status != PayStatus.None) continue;
                if (budget == 0) {
                    done = false;
                    break;
                }
                _settle(id, c, i);
                budget--;
            }
            if (!done) return;
            _bind(id, uint16(c));
            settledThrough[id] = uint16(c + 1);
        }
        if (!open || budget == 0) return;
        for (uint256 i; i < n; ++i) {
            if (payments[id][cycle][i].status != PayStatus.None) continue;
            if (!_graceClosed(id, cycle, i)) continue;
            if (budget == 0) return;
            _settle(id, cycle, i);
            budget--;
        }
        _bind(id, uint16(cycle));
    }

    function _bind(uint256 id, uint16 cycle) internal {
        address payee = _activeRecipient(id, cycle);
        if (payee == address(0)) return;
        Leg[] storage legs = _legs[id];
        uint256 n = legs.length;
        for (uint256 i; i < n; ++i) {
            Leg storage leg = legs[i];
            if (leg.cycle != cycle || leg.to != address(0)) continue;
            if (leg.kind == PayStatus.Slashed) {
                uint256 openAmount = uint256(leg.amount) - uint256(leg.repaid);
                leg.to = payee;
                if (openAmount == 0) continue;
                owedFromTo[id][leg.from][payee] += openAmount;
                emit Paid(id, leg.from, payee, cycle, PayStatus.Slashed, openAmount);
            } else if (leg.kind == PayStatus.Repaid) {
                leg.to = payee;
                paidFromTo[id][leg.from][payee] += leg.amount;
                emit Paid(id, leg.from, payee, cycle, PayStatus.Repaid, leg.amount);
            }
        }
    }

    function _activeRecipient(uint256 id, uint256 cycle) internal view returns (address) {
        Group storage g = groups[id];
        uint256 n = g.memberCount;
        if (n == 0 || cycle >= g.totalCycles) return address(0);
        uint256 origin = cycle % n;
        for (uint256 k; k < n; ++k) {
            uint256 index = _memberSeat(id, origin + k);
            if (!_skipped(id, cycle, index)) return _members[id][index].account;
        }
        return _members[id][_memberSeat(id, origin)].account;
    }

    /// @dev Collateral, fees, locks, and unpaid pots of every group on this token.
    ///      `releasable` is the slice of `openPots` this call is allowed to spend.
    function _backing(uint256 id, uint256 releasable) internal view returns (uint256 reserved) {
        address token = groups[id].token;
        uint256 potsOpen = openPots[token];
        if (releasable > potsOpen) releasable = potsOpen;
        reserved = collateralHeld[token] + kept[token] + potsOpen - releasable;
    }

    function _liquid(address token, uint256 reserved) internal view returns (uint256) {
        uint256 bal = ISuperTokenMini(token).balanceOf(address(this));
        return bal > reserved ? bal - reserved : 0;
    }

    function _pullProtocol(address token, uint256 base) internal {
        uint256 fee = (base * 30) / 10_000;
        if (fee == 0) return;
        _pullExact(token, fee);
        protocolFees[token] += fee;
        kept[token] += fee;
        emit ProtocolFeeCharged(token, fee);
    }

    function _touchAdminFee(uint256 id) internal {
        if (groupRules[id].feePool == address(0) && groupRules[id].feeFunded == 0) return;
        _ext(abi.encodeWithSignature("syncAdminFee(uint256)", id));
    }

    function _ext(bytes memory data) internal {
        address ext = extension;
        assembly ("memory-safe") {
            let ok := delegatecall(gas(), ext, add(data, 0x20), mload(data), 0, 0)
            if iszero(ok) {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
    }

    function _skipped(uint256 id, uint256 cycle, uint256 index) internal view returns (bool) {
        PayStatus status = payments[id][cycle][index].status;
        if (status == PayStatus.Slashed) return true;
        if (status != PayStatus.None) return false;
        return _graceClosed(id, cycle, index);
    }

    function _graceClosed(uint256 id, uint256 cycle, uint256 index) internal view returns (bool) {
        (, uint64 graceEnd, uint64 cycleEnd) = _bounds(id, cycle, index);
        uint64 nowT = _now(id);
        return nowT > graceEnd || nowT >= cycleEnd;
    }

    /// @dev Wall time, minus every second the group has spent paused. During a pause
    ///      the clock stays at the moment the pause began.
    function _now(uint256 id) internal view returns (uint64) {
        if (groupPaused[id]) return pauseBegan[id] - pauseAccum[id];
        return uint64(block.timestamp) - pauseAccum[id];
    }

    /// @notice One member's offset, window, and the cycle index on which they are paid.
    function _pushLeg(uint256 id, address from, address to, uint256 amount, uint16 cycle, PayStatus kind) internal {
        _legs[id].push(
            Leg({
                from: from,
                to: to,
                amount: uint128(amount),
                repaid: 0,
                at: uint64(block.timestamp),
                cycle: cycle,
                kind: kind
            })
        );
        if (kind == PayStatus.Slashed) _debtLegs[id][from].push(_legs[id].length - 1);
        if (to != address(0)) {
            paidFromTo[id][from][to] += amount;
            emit Paid(id, from, to, cycle, kind, amount);
        }
    }

    function _repay(uint256 id, uint256 index, uint256 amount) internal {
        Member storage m = _members[id][index];
        if (amount == 0 || m.owed == 0 || amount > m.owed) revert NothingOwed();
        _pullExact(groups[id].token, amount);
        _pullProtocol(groups[id].token, amount);
        uint256 room = uint256(groups[id].collateralRequired) - uint256(m.collateral);
        uint256 restore = amount < room ? amount : room;
        m.collateral += uint128(restore);
        _holdCollateral(groups[id].token, restore);
        if (m.collateral >= groups[id].contribution) m.defaulted = false;
        m.owed -= amount;
        m.given += amount;
        _applyRepay(id, m.account, amount);
        emit Repaid(id, m.account, amount, m.owed);
    }

    function _applyRepay(uint256 id, address from, uint256 amount) internal {
        uint256[] storage debts = _debtLegs[id][from];
        uint256 n = debts.length;
        for (uint256 i; i < n && amount > 0; ++i) {
            Leg storage debt = _legs[id][debts[i]];
            uint256 openAmount = uint256(debt.amount) - uint256(debt.repaid);
            if (openAmount == 0) continue;
            uint256 take = amount < openAmount ? amount : openAmount;
            debt.repaid += uint128(take);
            // A slash is bound to its payee only after the whole window is settled.
            // Repaying before that must not touch `owedFromTo[from][address(0)]`.
            if (debt.to != address(0)) owedFromTo[id][from][debt.to] -= take;
            amount -= take;
            _pushLeg(id, from, debt.to, take, debt.cycle, PayStatus.Repaid);
        }
    }

    function _creditReceived(uint256 id, address account, uint256 amount) internal {
        if (amount == 0 || account == address(0)) return;
        uint256 index = _indexOf[id][account];
        if (index == 0) return;
        _members[id][index - 1].received += amount;
    }

    /// @dev Creation and start live on the extension. These wrappers keep the
    ///      calls on this contract's surface and forward the raw calldata.
    function createGroup(address, uint128, uint64, uint64, uint64, uint16, address[] calldata, uint64[] calldata)
        external
        returns (uint256)
    {
        _delegate();
    }

    function createPlainGroup(address, uint128, uint64, uint64, uint64, uint16, address[] calldata, uint64[] calldata)
        external
        returns (uint256)
    {
        _delegate();
    }

    function start(uint256) external {
        _delegate();
    }

    /// @dev These calls live on the extension. The fallback forwards them so this
    ///      contract stays under the EIP-170 size limit. See {IGroupCalls}.
    fallback() external {
        _delegate();
    }

    function _delegate() internal {
        address ext = extension;
        assembly ("memory-safe") {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), ext, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

/// @notice Calls implemented on {GroupRotationExtension} and reached through
///         {GroupRotation}'s fallback. Kept off the main contract so it deploys.
interface IGroupCalls {
    function createGroup(
        address token,
        uint128 contribution,
        uint64 cycleDuration,
        uint64 windowDuration,
        uint64 graceDuration,
        uint16 totalCycles,
        address[] calldata accounts,
        uint64[] calldata offsets
    ) external returns (uint256 id);
    function createPlainGroup(
        address token,
        uint128 contribution,
        uint64 cycleDuration,
        uint64 windowDuration,
        uint64 graceDuration,
        uint16 totalCycles,
        address[] calldata accounts,
        uint64[] calldata offsets
    ) external returns (uint256 id);
    function start(uint256 id) external;
    function exitBeforeStart(uint256 id) external;
    function removeBeforeStart(uint256 id, address account) external;
    function setMemberWindow(uint256 id, uint256 index, uint64 window) external;
    function connectAdminFee(uint256 id) external returns (bool);
    function addGroupAdmin(uint256 id, address account) external;
    function removeGroupAdmin(uint256 id, address account) external;
    function setMemberPhone(uint256 id, address account, bytes32 phone) external;
    function setPayoutOrder(uint256 id, uint16[] calldata indexes) external;
    function setAdminFee(uint256 id, uint8 mode, uint128 flat, uint16 bps) external;
    function lockGroupSavings(uint256 id, uint128 amount, uint64 duration) external;
    function withdrawGroupSavings(uint256 id, uint128 amount) external;
    function withdrawProtocolFees(address token, address to) external;
    function claimAdminFee(uint256 id) external returns (bool);
    function payoutOrder(uint256 id) external view returns (uint16[] memory);
    function ledger(uint256 id, uint256 index) external view returns (GroupRotationStore.Books memory);
    function ledgerOf(uint256 id, address account) external view returns (GroupRotationStore.Books memory);
    function place(uint256 id, uint256 index) external view returns (GroupRotationStore.Place);
    function legCount(uint256 id) external view returns (uint256);
    function legAt(uint256 id, uint256 index) external view returns (GroupRotationStore.Leg memory);
    function getMember(uint256 id, uint256 index) external view returns (GroupRotationStore.Member memory);
    function previewMember(uint256 id, uint256 index)
        external
        view
        returns (address account, uint64 offset, uint64 window, uint64 grace, uint256 payoutIndex, bool stillIn);
}

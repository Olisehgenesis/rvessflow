// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {
    ISuperTokenMini,
    IGDAv1Forwarder,
    ISuperfluidHost,
    ISuperfluidGovernance,
    ISuperfluidPool,
    IGDAv1Autoconnect
} from "./interfaces/ISuperfluidMini.sol";
import {GroupRotationStore, IGroupCycle} from "./GroupRotationStore.sol";

/// @notice Exit and the group reads for {GroupRotation}.
///         The group delegatecalls here. Storage is the group's storage.
contract GroupRotationExtension is GroupRotationStore {
    constructor(address allowlist_, address host_, address gda_) GroupRotationStore(allowlist_, host_, gda_) {
        _disableInitializers();
    }

    function _authorizeUpgrade(address) internal pure override {
        revert UpgradeNotReady();
    }

    /// @notice Take your own collateral back before the group starts. No creator signature.
    function exitBeforeStart(uint256 id) external nonReentrant {
        Group storage g = groups[id];
        if (g.creator == address(0) || g.started || g.cancelled) revert BadState();
        uint256 index = _memberIndex(id, msg.sender);
        uint256 amount = _members[id][index].collateral;
        address token = g.token;
        _dropMember(id, index);
        if (amount != 0) ISuperTokenMini(token).transfer(msg.sender, amount);
        emit Exited(id, msg.sender, amount);
    }

    /// @notice Drop a member before the group starts and return any collateral they posted.
    ///         An admin uses this when someone never posts and the group cannot start.
    function removeBeforeStart(uint256 id, address account) external nonReentrant {
        if (!_isAdmin(id, msg.sender)) revert NotAdmin();
        Group storage g = groups[id];
        if (g.creator == address(0) || g.started || g.cancelled) revert BadState();
        uint256 index = _memberIndex(id, account);
        uint256 amount = _members[id][index].collateral;
        address token = g.token;
        _dropMember(id, index);
        if (amount != 0) ISuperTokenMini(token).transfer(account, amount);
        emit Exited(id, account, amount);
    }

    function _dropMember(uint256 id, uint256 index) internal {
        uint256 n = groups[id].memberCount;
        address gone = _members[id][index].account;
        uint16[] storage order = _payoutOrder[id];
        if (order.length == n) {
            uint256 write;
            for (uint256 i; i < n; ++i) {
                uint256 seat = order[i];
                if (seat == index) continue;
                order[write++] = uint16(seat > index ? seat - 1 : seat);
            }
            while (order.length > write) order.pop();
        } else if (order.length != 0) {
            delete _payoutOrder[id];
        }
        for (uint256 i = index; i + 1 < n; ++i) {
            _members[id][i] = _members[id][i + 1];
            _indexOf[id][_members[id][i].account] = i + 1;
            memberWindow[id][i] = memberWindow[id][i + 1];
        }
        delete memberWindow[id][n - 1];
        _members[id].pop();
        _indexOf[id][gone] = 0;
        groupAdmin[id][gone] = false;
        groups[id].memberCount = uint16(n - 1);
    }

    function ledger(uint256 id, uint256 index) external view returns (Books memory books) {
        if (index >= groups[id].memberCount) revert BadMember();
        Member storage m = _members[id][index];
        books = Books({given: m.given, received: m.received, owed: m.owed, missed: m.missed, inOwe: m.owed > 0});
    }

    function ledgerOf(uint256 id, address account) external view returns (Books memory books) {
        uint256 index = _memberIndex(id, account);
        Member storage m = _members[id][index];
        books = Books({given: m.given, received: m.received, owed: m.owed, missed: m.missed, inOwe: m.owed > 0});
    }

    function place(uint256 id, uint256 index) public view returns (Place) {
        if (index >= groups[id].memberCount) revert BadMember();
        Member storage m = _members[id][index];
        if (m.owed > 0) return Place.InOwe;
        (uint256 cycle, bool open) = IGroupCycle(address(this)).currentCycle(id);
        if (!groups[id].started || !open) {
            return payments[id][cycle][index].status == PayStatus.Slashed ? Place.Missed : Place.Clear;
        }
        Payment storage p = payments[id][cycle][index];
        if (p.status == PayStatus.Slashed) return Place.Missed;
        if (p.status == PayStatus.OnTime || p.status == PayStatus.Late) return Place.Clear;
        (uint64 windowStart, uint64 graceEnd,) = _bounds(id, cycle, index);
        uint64 nowT = _now(id);
        if (nowT < windowStart) return Place.Waiting;
        if (nowT > graceEnd) return Place.Missed;
        return Place.InWindow;
    }

    function legCount(uint256 id) external view returns (uint256) {
        return _legs[id].length;
    }

    function legAt(uint256 id, uint256 index) external view returns (Leg memory) {
        return _legs[id][index];
    }

    function getMember(uint256 id, uint256 index) external view returns (Member memory) {
        return _members[id][index];
    }

    function previewMember(uint256 id, uint256 index)
        external
        view
        returns (address account, uint64 offset, uint64 window, uint64 grace, uint256 payoutIndex, bool stillIn)
    {
        if (index >= groups[id].memberCount) revert BadMember();
        Member storage m = _members[id][index];
        account = m.account;
        offset = m.offset;
        window = _windowAt(id, index);
        grace = groups[id].graceDuration;
        payoutIndex = index;
        stillIn = true;
    }

    function _memberIndex(uint256 id, address account) internal view returns (uint256) {
        uint256 index = _indexOf[id][account];
        if (index == 0) revert NotMember();
        return index - 1;
    }

    function _bounds(uint256 id, uint256 cycle, uint256 index)
        internal
        view
        returns (uint64 windowStart, uint64 graceEnd, uint64 cycleEnd)
    {
        Group storage g = groups[id];
        uint64 cycleStart = g.startTime + uint64(cycle) * g.cycleDuration;
        windowStart = cycleStart + _members[id][index].offset;
        graceEnd = windowStart + _windowAt(id, index) + g.graceDuration;
        cycleEnd = cycleStart + g.cycleDuration;
    }

    /// @notice Replace one member's contribution window before the group starts.
    function setMemberWindow(uint256 id, uint256 index, uint64 window) external {
        if (!_isAdmin(id, msg.sender)) revert NotAdmin();
        Group storage g = groups[id];
        if (g.creator == address(0) || g.started || g.cancelled) revert BadState();
        if (index >= g.memberCount || window == 0) revert BadParams();
        if (uint256(_members[id][index].offset) + uint256(window) + uint256(g.graceDuration) > g.cycleDuration) {
            revert WindowOutOfRange();
        }
        memberWindow[id][index] = window;
    }

    /// @notice Connect `msg.sender` to the group's pool so the pot can stream to them.
    /// @dev Superfluid lets this contract attach a member to four pools on one token.
    ///      A fifth pool, and every pool after it up to 256, is connected by the member's
    ///      own wallet with `GDAv1Forwarder.connectPool`. Calling `connectPool` from this
    ///      contract would connect the group, not the member.
    function connect(uint256 id) external nonReentrant returns (bool) {
        Group storage g = groups[id];
        if (!g.started || g.pool == address(0)) revert BadState();
        _memberIndex(id, msg.sender);
        address agreement = ISuperfluidHost(host).getAgreementClass(
            keccak256("org.superfluid-finance.agreements.GeneralDistributionAgreement.v1")
        );
        bytes memory ret = ISuperfluidHost(host).callAgreement(
            agreement,
            abi.encodeCall(IGDAv1Autoconnect.tryConnectPoolFor, (g.pool, msg.sender, new bytes(0))),
            ""
        );
        (bool success,) = abi.decode(ret, (bool, bytes));
        if (!success) revert SelfConnectRequired(g.pool);
        return true;
    }

    /// @notice Connect the caller to the admin-fee pool. Does not spend a slot until an admin asks.
    function connectAdminFee(uint256 id) external nonReentrant returns (bool) {
        if (!_isAdmin(id, msg.sender)) revert NotAdmin();
        address pool = groupRules[id].feePool;
        if (pool == address(0)) revert BadState();
        address agreement = ISuperfluidHost(host).getAgreementClass(
            keccak256("org.superfluid-finance.agreements.GeneralDistributionAgreement.v1")
        );
        bytes memory ret = ISuperfluidHost(host).callAgreement(
            agreement, abi.encodeCall(IGDAv1Autoconnect.tryConnectPoolFor, (pool, msg.sender, new bytes(0))), ""
        );
        (bool success,) = abi.decode(ret, (bool, bytes));
        if (!success) revert SelfConnectRequired(pool);
        return true;
    }

    function _now(uint256 id) internal view returns (uint64) {
        if (groupPaused[id]) return pauseBegan[id] - pauseAccum[id];
        return uint64(block.timestamp) - pauseAccum[id];
    }

    function payoutOrder(uint256 id) external view returns (uint16[] memory) {
        return _payoutOrder[id];
    }

    function addGroupAdmin(uint256 id, address account) external {
        if (!_isAdmin(id, msg.sender)) revert NotAdmin();
        if (groups[id].creator == address(0) || groups[id].finalized) revert BadState();
        _memberIndex(id, account);
        if (account == groups[id].creator || groupAdmin[id][account]) revert BadState();
        groupAdmin[id][account] = true;
        if (groupRules[id].feePool != address(0)) _syncAdminUnits(id);
        emit AdminAdded(id, account);
    }

    function removeGroupAdmin(uint256 id, address account) external {
        if (!_isAdmin(id, msg.sender)) revert NotAdmin();
        if (account == groups[id].creator || !groupAdmin[id][account]) revert BadState();
        groupAdmin[id][account] = false;
        if (groupRules[id].feePool != address(0)) _syncAdminUnits(id);
        emit AdminRemoved(id, account);
    }

    /// @notice Phone numbers are the member id. They are public on the chain.
    function setMemberPhone(uint256 id, address account, bytes32 phone) external {
        if (groups[id].creator == address(0)) revert BadState();
        if (msg.sender != account && !_isAdmin(id, msg.sender)) revert NotAdmin();
        _memberIndex(id, account);
        memberPhone[id][account] = phone;
        emit MemberPhoneSet(id, account, phone);
    }

    /// @notice Who receives cycle 0, cycle 1, and so on. Only before the group starts.
    function setPayoutOrder(uint256 id, uint16[] calldata indexes) external {
        if (!_isAdmin(id, msg.sender)) revert NotAdmin();
        Group storage g = groups[id];
        if (g.creator == address(0) || g.started || g.cancelled) revert BadState();
        uint256 n = g.memberCount;
        if (indexes.length != n || n == 0) revert BadParams();
        bool[] memory seen = new bool[](n);
        for (uint256 i; i < n; ++i) {
            uint256 index = indexes[i];
            if (index >= n || seen[index]) revert BadParams();
            seen[index] = true;
        }
        delete _payoutOrder[id];
        for (uint256 i; i < n; ++i) _payoutOrder[id].push(indexes[i]);
        emit PayoutOrderSet(id);
    }

    /// @notice Admin fee on each contribution. `mode` 0 is none, 1 is a flat amount, 2 is bps of the contribution.
    function setAdminFee(uint256 id, uint8 mode, uint128 flat, uint16 bps) external {
        if (!_isAdmin(id, msg.sender)) revert NotAdmin();
        Group storage g = groups[id];
        if (g.creator == address(0) || g.started || g.cancelled) revert BadState();
        if (mode > 2 || (mode == 2 && bps > 1_000) || (mode == 1 && flat == 0)) revert BadParams();
        if (mode != 1) flat = 0;
        if (mode != 2) bps = 0;
        GroupRules storage rules = groupRules[id];
        rules.feeMode = mode;
        rules.feeFlat = flat;
        rules.feeBps = bps;
        emit AdminFeeSet(id, mode, flat, bps);
    }

    /// @notice Save tokens in the group. Only an admin can withdraw, and only after the lock ends.
    function lockGroupSavings(uint256 id, uint128 amount, uint64 duration) external nonReentrant {
        if (!_isAdmin(id, msg.sender)) revert NotAdmin();
        Group storage g = groups[id];
        if (g.creator == address(0) || g.cancelled || g.finalized) revert BadState();
        if (amount == 0 || duration < 1 hours || duration > 366 days) revert BadParams();
        _pullExact(g.token, amount);
        uint256 fee = (uint256(amount) * 30) / 10_000;
        if (fee != 0) {
            _pullExact(g.token, fee);
            protocolFees[g.token] += fee;
            kept[g.token] += fee;
            emit ProtocolFeeCharged(g.token, fee);
        }
        GroupRules storage rules = groupRules[id];
        rules.lockBalance += amount;
        kept[g.token] += amount;
        uint64 unlockAt = uint64(block.timestamp) + duration;
        if (unlockAt > rules.lockUnlockAt) rules.lockUnlockAt = unlockAt;
        emit GroupLocked(id, amount, rules.lockUnlockAt);
    }

    function withdrawGroupSavings(uint256 id, uint128 amount) external nonReentrant {
        if (!_isAdmin(id, msg.sender)) revert NotAdmin();
        GroupRules storage rules = groupRules[id];
        if (amount == 0 || amount > rules.lockBalance) revert BadParams();
        if (block.timestamp < rules.lockUnlockAt) revert TooEarly();
        rules.lockBalance -= amount;
        address token = groups[id].token;
        kept[token] -= amount;
        ISuperTokenMini(token).transfer(msg.sender, amount);
        emit GroupLockWithdrawn(id, msg.sender, amount);
    }

    function withdrawProtocolFees(address token, address to) external nonReentrant {
        if (msg.sender != owner()) revert NotProtocolAdmin();
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = protocolFees[token];
        if (amount == 0) revert NothingToClaim();
        protocolFees[token] = 0;
        kept[token] -= amount;
        ISuperTokenMini(token).transfer(to, amount);
        emit ProtocolFeeWithdrawn(token, to, amount);
    }

    function claimAdminFee(uint256 id) external returns (bool) {
        address pool = groupRules[id].feePool;
        if (pool == address(0)) revert BadState();
        _memberIndex(id, msg.sender);
        return gda.claimAll(pool, msg.sender, "");
    }

    /// @dev Called from {GroupRotation.contribute} after the contribution is pulled. The gate stops a direct call.
    function takeAdminFee(uint256 id) external {
        if (adminFeeGate != id) revert BadState();
        adminFeeGate = 0;
        Group storage g = groups[id];
        uint256 fee = _adminFeeQuote(id, g.contribution);
        if (fee == 0) return;
        _pullExact(g.token, fee);
        GroupRules storage rules = groupRules[id];
        rules.feeFunded += fee;
        kept[g.token] += fee;
        _ensureAdminPool(id);
        _streamAdminFee(id);
        emit AdminFeePaid(id, fee);
    }

    function syncAdminFee(uint256 id) external {
        if (groupRules[id].feePool == address(0)) return;
        _streamAdminFee(id);
    }

    function _adminFeeQuote(uint256 id, uint256 contribution) internal view returns (uint256) {
        GroupRules storage rules = groupRules[id];
        if (rules.feeMode == 1) return rules.feeFlat;
        if (rules.feeMode == 2) return (contribution * rules.feeBps) / 10_000;
        return 0;
    }

    function _ensureAdminPool(uint256 id) internal {
        GroupRules storage rules = groupRules[id];
        if (rules.feePool != address(0)) {
            _syncAdminUnits(id);
            return;
        }
        (, address pool) = gda.createPool(
            groups[id].token, address(this), IGDAv1Forwarder.PoolConfig({transferabilityForUnitsOwner: false, distributionFromAnyAddress: false})
        );
        rules.feePool = pool;
        _syncAdminUnits(id);
    }

    function _syncAdminUnits(uint256 id) internal {
        address pool = groupRules[id].feePool;
        uint256 n = groups[id].memberCount;
        for (uint256 i; i < n; ++i) {
            address account = _members[id][i].account;
            uint128 units = _isAdmin(id, account) ? 1 : 0;
            if (ISuperfluidPool(pool).getUnits(account) != units) gda.updateMemberUnits(pool, account, units, "");
        }
    }

    function _streamAdminFee(uint256 id) internal {
        Group storage g = groups[id];
        GroupRules storage rules = groupRules[id];
        if (rules.feePool == address(0)) return;
        _accountAdminStream(id);
        if (groupPaused[id]) {
            _setAdminRate(id, 0);
            return;
        }
        uint256 remaining = rules.feeFunded > rules.feeAccounted ? rules.feeFunded - rules.feeAccounted : 0;
        if (remaining == 0 || !g.started) {
            _setAdminRate(id, 0);
            return;
        }
        uint64 nowT = _now(id);
        uint64 end = g.startTime + uint64(g.totalCycles) * g.cycleDuration;
        if (nowT >= end) {
            _setAdminRate(id, 0);
            _lumpAdminFee(id, remaining);
            return;
        }
        uint256 timeLeft = end - nowT;
        (uint256 period,) = ISuperfluidGovernance(ISuperfluidHost(host).getGovernance()).getPPPConfig(host, g.token);
        if (period == 0) period = 4 hours;
        uint256 perSecond = remaining / (timeLeft + period + 1 hours);
        if (perSecond == 0) {
            _setAdminRate(id, 0);
            _lumpAdminFee(id, remaining);
            return;
        }
        uint256 protect = _collateral(id) + rules.lockBalance + protocolFees[g.token];
        _setAdminRate(id, int96(int256(perSecond)));
        if (
            ISuperTokenMini(g.token).balanceOf(address(this)) < protect
                || ISuperTokenMini(g.token).isAccountCritical(address(this), block.timestamp + 1 hours)
        ) {
            _setAdminRate(id, 0);
            _lumpAdminFee(id, remaining);
        }
    }

    function _lumpAdminFee(uint256 id, uint256 amount) internal {
        if (amount == 0 || groupRules[id].feePool == address(0)) return;
        address token = groups[id].token;
        if (amount > kept[token]) amount = kept[token];
        if (amount == 0) return;
        uint256 bal = ISuperTokenMini(token).balanceOf(address(this));
        uint256 protect = _collateral(id) + kept[token] - amount;
        uint256 free = bal > protect ? bal - protect : 0;
        if (amount > free) amount = free;
        if (amount == 0) return;
        uint256 beforeBal = bal;
        gda.distribute(token, address(this), groupRules[id].feePool, amount, "");
        uint256 spent = beforeBal - ISuperTokenMini(token).balanceOf(address(this));
        if (spent == 0) return;
        groupRules[id].feeAccounted += spent;
        if (kept[token] >= spent) kept[token] -= spent;
    }

    function _accountAdminStream(uint256 id) internal {
        GroupRules storage rules = groupRules[id];
        uint256 total;
        uint256 n = groups[id].memberCount;
        for (uint256 i; i < n; ++i) {
            address account = _members[id][i].account;
            if (!_isAdmin(id, account)) continue;
            total += ISuperfluidPool(rules.feePool).getTotalAmountReceivedByMember(account);
        }
        uint256 openAmount = rules.feeFunded > rules.feeAccounted ? rules.feeFunded - rules.feeAccounted : 0;
        uint256 delta = total > rules.feeSnapshot ? total - rules.feeSnapshot : 0;
        if (delta > openAmount) delta = openAmount;
        if (delta != 0) {
            rules.feeAccounted += delta;
            address token = groups[id].token;
            if (kept[token] >= delta) kept[token] -= delta;
        }
        rules.feeSnapshot = total;
    }

    function _setAdminRate(uint256 id, int96 rate) internal {
        GroupRules storage rules = groupRules[id];
        if (rules.feePool == address(0) || rules.feeRate == rate) return;
        gda.distributeFlow(groups[id].token, address(this), rules.feePool, rate, "");
        rules.feeRate = rate;
    }

    function _collateral(uint256 id) internal view returns (uint256 total) {
        uint256 n = groups[id].memberCount;
        for (uint256 i; i < n; ++i) total += _members[id][i].collateral;
    }

    function _pullExact(address token, uint256 amount) internal returns (uint256 got) {
        uint256 beforeBal = ISuperTokenMini(token).balanceOf(address(this));
        ISuperTokenMini(token).transferFrom(msg.sender, address(this), amount);
        got = ISuperTokenMini(token).balanceOf(address(this)) - beforeBal;
        if (got != amount) revert FeeOnTransfer();
    }
}

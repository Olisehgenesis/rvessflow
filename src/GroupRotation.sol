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
    ISuperfluidPool,
    IGDAv1Autoconnect
} from "./interfaces/ISuperfluidMini.sol";
import {SuperTokenReceiver} from "./SuperTokenReceiver.sol";

/// @title GroupRotation
/// @notice A ROSCA / chama. Members contribute once per cycle inside their own
///         window. The pot is a real GDA pool flow to that cycle's recipient,
///         not a lump sum and not an internal balance.
/// @dev Collateral (contribution × cycles) stays here until the group ends and
///      is the solvency margin for the pool's deposit. A missed window is
///      settled on the next call: the missed contribution is slashed from
///      collateral into the pot, and if that member's own round was the one
///      streaming, the stream moves to the next member in the same call.
///      Every leg records who paid whom. Paying after your window does not
///      rewrite the round; it repays the person the round actually went to.
///      The owner can pause a group and upgrade this contract. The owner
///      cannot take collateral, the pot, or rewrite a leg.
contract GroupRotation is Initializable, Ownable2Step, UUPSUpgradeable, ReentrancyGuard, SuperTokenReceiver {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_MEMBERS = 3;
    uint256 public constant MAX_MEMBERS = 50;
    uint16 public constant MAX_CYCLES = 520;
    uint64 public constant MIN_CYCLE = 1 hours;
    uint64 public constant MAX_CYCLE = 366 days;
    uint256 public constant PROTECT_WINDOW = 1 hours;

    enum PayStatus {
        None,
        OnTime,
        Late,
        Slashed,
        Repaid
    }

    /// @notice Where a member stands in the open cycle.
    enum Place {
        Clear,
        Waiting,
        InWindow,
        Missed,
        InOwe
    }

    struct Group {
        address creator;
        address token;
        address pool;
        uint128 contribution;
        uint128 collateralRequired;
        uint64 cycleDuration;
        uint64 windowDuration;
        uint64 graceDuration;
        uint64 startTime;
        uint16 totalCycles;
        uint16 memberCount;
        bool started;
        bool cancelled;
        bool finalized;
        uint16 streamingCycle;
        address streamingTo;
        int96 rate;
        uint64 rateUpdatedAt;
        bool cycleOpen;
        /// @dev Pool receipt counter of `streamingTo` when this cycle's stream began.
        uint256 receivedSnapshot;
    }

    struct Member {
        address account;
        uint64 offset;
        uint128 collateral;
        bool collateralPosted;
        bool defaulted;
        /// @dev Tokens this member actually sent (on-time, late-in-grace, or a later repay).
        uint256 given;
        /// @dev What the pool has accounted to this member.
        uint256 received;
        /// @dev Contributions they still have not given.
        uint256 owed;
        uint16 missed;
    }

    /// @notice One booked payment: `from` paid `to` for `cycle`.
    ///         `to` is the member the round actually streamed to, not whoever's
    ///         window happened to be open when a late payment arrived.
    struct Leg {
        address from;
        address to;
        uint128 amount;
        uint128 repaid;
        uint64 at;
        uint16 cycle;
        PayStatus kind;
    }

    struct Books {
        uint256 given;
        uint256 received;
        uint256 owed;
        uint16 missed;
        bool inOwe;
    }

    struct Payment {
        uint128 amount;
        uint64 paidAt;
        PayStatus status;
    }

    struct Cycle {
        uint256 funded;
        uint256 accounted;
        bool closed;
    }

    ITokenAllowlist public immutable allowlist;
    address public immutable host;
    IGDAv1Forwarder public immutable gda;
    uint256 public nextId = 1;

    mapping(uint256 id => Group group) public groups;
    mapping(uint256 id => Member[] members) private _members;
    mapping(uint256 id => mapping(address account => uint256 indexPlusOne)) private _indexOf;
    mapping(uint256 id => mapping(uint256 cycle => mapping(uint256 index => Payment payment))) public payments;
    mapping(uint256 id => mapping(uint256 cycle => Cycle pot)) public pots;
    mapping(address user => uint256[] ids) private _groupsOf;
    mapping(uint256 id => Leg[] legs) private _legs;
    mapping(uint256 id => mapping(address from => uint256[] indexes)) private _debtLegs;
    mapping(uint256 id => mapping(address from => mapping(address to => uint256 amount))) public paidFromTo;
    mapping(uint256 id => mapping(address from => mapping(address to => uint256 amount))) public owedFromTo;
    mapping(uint256 id => uint16 nextCycle) public settledThrough;
    mapping(uint256 id => bool paused) public groupPaused;

    event GroupCreated(uint256 indexed id, address indexed creator, address indexed token, uint16 members, uint16 cycles);
    event CollateralPosted(uint256 indexed id, address indexed member, uint256 amount);
    event GroupStarted(uint256 indexed id, uint64 startTime, address pool);
    event GroupCancelled(uint256 indexed id);
    event Contributed(uint256 indexed id, uint256 indexed cycle, address indexed member, PayStatus status, uint256 amount);
    event MissSettled(uint256 indexed id, uint256 indexed cycle, uint256 indexed memberIndex, uint256 slashed);
    event PoolRetargeted(uint256 indexed id, uint256 indexed cycle, address indexed recipient, int96 rate);
    event GroupFinalized(uint256 indexed id);
    event Claimed(uint256 indexed id, address indexed member, uint256 collateral);
    event Paid(
        uint256 indexed id, address indexed from, address indexed to, uint256 cycle, PayStatus kind, uint256 amount
    );
    event Repaid(uint256 indexed id, address indexed from, uint256 amount, uint256 owedLeft);
    event GroupPausedSet(uint256 indexed id, bool paused);

    error ZeroAddress();
    error TokenNotAllowed();
    error Paused();
    error BadParams();
    error WindowOutOfRange();
    error DuplicateMember();
    error CreatorNotMember();
    error BadState();
    error NotCreator();
    error NotMember();
    error AlreadyPosted();
    error MissingCollateral();
    error FeeOnTransfer();
    error CycleOver();
    error BadCycle();
    error BadMember();
    error AlreadyPaid();
    error TooEarly();
    error TooLate();
    error StillOpen();
    error StillRunning();
    error NothingToClaim();
    error ConnectFailed();
    error NothingOwed();

    uint256[40] private __gap;

    constructor(address allowlist_, address host_, address gda_) Ownable(msg.sender) {
        if (allowlist_ == address(0) || host_ == address(0) || gda_ == address(0)) revert ZeroAddress();
        allowlist = ITokenAllowlist(allowlist_);
        host = host_;
        gda = IGDAv1Forwarder(gda_);
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
        return 1;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
    }

    /// @notice Stop new contributions and repayments. Sync, protect, settle, and
    ///         claims still run, so a pause cannot hide a miss or trap collateral.
    function setGroupPaused(uint256 id, bool paused_) external onlyOwner {
        if (groups[id].creator == address(0)) revert BadState();
        groupPaused[id] = paused_;
        emit GroupPausedSet(id, paused_);
    }

    function createGroup(
        address token,
        uint128 contribution,
        uint64 cycleDuration,
        uint64 windowDuration,
        uint64 graceDuration,
        uint16 totalCycles,
        address[] calldata accounts,
        uint64[] calldata offsets
    ) external returns (uint256 id) {
        if (!allowlist.isAllowed(token)) revert TokenNotAllowed();
        if (allowlist.paused()) revert Paused();
        uint256 n = accounts.length;
        if (contribution == 0 || n < MIN_MEMBERS || n > MAX_MEMBERS || n != offsets.length) revert BadParams();
        if (totalCycles == 0 || totalCycles > MAX_CYCLES) revert BadParams();
        if (cycleDuration < MIN_CYCLE || cycleDuration > MAX_CYCLE || windowDuration == 0) revert BadParams();

        uint256 bond = uint256(contribution) * uint256(totalCycles);
        if (bond > type(uint128).max) revert BadParams();

        bool creatorIn;
        for (uint256 i; i < n; ++i) {
            if (accounts[i] == address(0)) revert ZeroAddress();
            if (accounts[i] == msg.sender) creatorIn = true;
            if (uint256(offsets[i]) + uint256(windowDuration) + uint256(graceDuration) > cycleDuration) {
                revert WindowOutOfRange();
            }
            for (uint256 j; j < i; ++j) {
                if (accounts[i] == accounts[j]) revert DuplicateMember();
            }
        }
        if (!creatorIn) revert CreatorNotMember();

        id = nextId++;
        Group storage g = groups[id];
        g.creator = msg.sender;
        g.token = token;
        g.contribution = contribution;
        g.collateralRequired = uint128(bond);
        g.cycleDuration = cycleDuration;
        g.windowDuration = windowDuration;
        g.graceDuration = graceDuration;
        g.totalCycles = totalCycles;
        g.memberCount = uint16(n);
        for (uint256 i; i < n; ++i) {
            _members[id].push(
                Member({
                    account: accounts[i],
                    offset: offsets[i],
                    collateral: 0,
                    collateralPosted: false,
                    defaulted: false,
                    given: 0,
                    received: 0,
                    owed: 0,
                    missed: 0
                })
            );
            _indexOf[id][accounts[i]] = i + 1;
            _groupsOf[accounts[i]].push(id);
        }
        emit GroupCreated(id, msg.sender, token, uint16(n), totalCycles);
    }

    function postCollateral(uint256 id) external nonReentrant {
        Group storage g = groups[id];
        if (g.creator == address(0) || g.started || g.cancelled) revert BadState();
        uint256 index = _memberIndex(id, msg.sender);
        Member storage m = _members[id][index];
        if (m.collateralPosted) revert AlreadyPosted();
        uint256 got = _pullExact(g.token, g.collateralRequired);
        m.collateral = uint128(got);
        m.collateralPosted = true;
        emit CollateralPosted(id, msg.sender, got);
    }

    function start(uint256 id) external {
        Group storage g = groups[id];
        if (msg.sender != g.creator) revert NotCreator();
        if (groupPaused[id]) revert Paused();
        if (g.started || g.cancelled || allowlist.paused()) revert BadState();
        uint256 n = g.memberCount;
        for (uint256 i; i < n; ++i) {
            if (!_members[id][i].collateralPosted) revert MissingCollateral();
        }
        IGDAv1Forwarder.PoolConfig memory config =
            IGDAv1Forwarder.PoolConfig({transferabilityForUnitsOwner: false, distributionFromAnyAddress: false});
        (, address pool) = gda.createPool(g.token, address(this), config);
        g.pool = pool;
        g.started = true;
        g.startTime = uint64(block.timestamp);
        emit GroupStarted(id, g.startTime, pool);
    }

    /// @notice Stop a group that has not started. Members pull their own collateral.
    function cancelBeforeStart(uint256 id) external {
        Group storage g = groups[id];
        if (msg.sender != g.creator) revert NotCreator();
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

        (uint64 windowStart, uint64 graceEnd, uint64 cycleEnd) = _bounds(g, cycle, m.offset);
        if (block.timestamp < windowStart) revert TooEarly();
        if (block.timestamp > graceEnd || block.timestamp >= cycleEnd) revert TooLate();

        PayStatus status = block.timestamp <= windowStart + g.windowDuration ? PayStatus.OnTime : PayStatus.Late;
        _pullExact(g.token, g.contribution);
        p.amount = g.contribution;
        p.paidAt = uint64(block.timestamp);
        p.status = status;
        pots[id][cycle].funded += g.contribution;
        address to = g.streamingTo != address(0) ? g.streamingTo : _activeRecipient(id, cycle);
        _pushLeg(id, msg.sender, to, g.contribution, uint16(cycle), status);
        m.given += g.contribution;
        emit Contributed(id, cycle, msg.sender, status, g.contribution);
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
        _settle(id, cycle, memberIndex);
        _sync(id, false);
    }

    /// @notice Connect `msg.sender` to the group's pool so the pot can stream to them.
    /// @dev `GDAv1Forwarder.connectPool` attributes the caller. Invoking it from this
    ///      contract would connect the group, not the member. `tryConnectPoolFor`
    ///      takes the member explicitly. The caller must be that member.
    function connect(uint256 id) external nonReentrant returns (bool) {
        Group storage g = groups[id];
        if (!g.started || g.pool == address(0)) revert BadState();
        address member = msg.sender;
        _memberIndex(id, member);
        address agreement = ISuperfluidHost(host).getAgreementClass(
            keccak256("org.superfluid-finance.agreements.GeneralDistributionAgreement.v1")
        );
        bytes memory ret = ISuperfluidHost(host).callAgreement(
            agreement,
            abi.encodeCall(IGDAv1Autoconnect.tryConnectPoolFor, (g.pool, member, new bytes(0))),
            ""
        );
        (bool success,) = abi.decode(ret, (bool, bytes));
        if (!success) revert ConnectFailed();
        return true;
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
        if (block.timestamp < end) revert StillRunning();
        uint256 cycles = g.totalCycles;
        uint256 n = g.memberCount;
        for (uint256 c; c < cycles; ++c) {
            for (uint256 i; i < n; ++i) {
                if (payments[id][c][i].status == PayStatus.None) _settle(id, c, i);
            }
        }
        _sync(id, true);
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
        ISuperTokenMini(g.token).transfer(msg.sender, amount);
        emit Claimed(id, msg.sender, amount);
    }

    function currentCycle(uint256 id) public view returns (uint256 cycle, bool open) {
        Group storage g = groups[id];
        if (!g.started || block.timestamp < g.startTime) return (0, false);
        cycle = (block.timestamp - g.startTime) / g.cycleDuration;
        if (cycle >= g.totalCycles) return (g.totalCycles, false);
        open = true;
    }

    function recipientOf(uint256 id, uint256 cycle) public view returns (address) {
        Group storage g = groups[id];
        if (cycle >= g.totalCycles || g.memberCount == 0) revert BadCycle();
        return _members[id][cycle % g.memberCount].account;
    }

    /// @notice Who the pot is streaming to for `cycle` after misses are applied.
    function activeRecipient(uint256 id, uint256 cycle) external view returns (address) {
        return _activeRecipient(id, cycle);
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
        (uint256 cycle, bool open) = currentCycle(id);
        if (!groups[id].started || !open) {
            return payments[id][cycle][index].status == PayStatus.Slashed ? Place.Missed : Place.Clear;
        }
        Payment storage p = payments[id][cycle][index];
        if (p.status == PayStatus.Slashed) return Place.Missed;
        if (p.status == PayStatus.OnTime || p.status == PayStatus.Late) return Place.Clear;
        (uint64 windowStart, uint64 graceEnd,) = _bounds(groups[id], cycle, m.offset);
        if (block.timestamp < windowStart) return Place.Waiting;
        if (block.timestamp > graceEnd) return Place.Missed;
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
        if (!g.started || g.finalized || g.pool == address(0)) return;
        (uint256 cycle, bool open) = currentCycle(id);
        _catchUp(id, cycle, open && !forceClose);
        uint256 through = forceClose || !open ? g.totalCycles : cycle;
        _noteStreamed(id);
        if (g.cycleOpen && g.streamingCycle < through) {
            _finishStreamingCycle(id);
        }
        for (uint256 c; c < through; ++c) {
            if (!pots[id][c].closed) _distributePot(id, c);
        }
        if (forceClose || !open) {
            _setRate(id, 0);
            return;
        }
        if (!g.cycleOpen) {
            g.streamingCycle = uint16(cycle);
            g.cycleOpen = true;
            g.rateUpdatedAt = uint64(block.timestamp);
        }
        address recipient = _activeRecipient(id, cycle);
        bool switched = g.streamingTo != recipient;
        _point(id, recipient);
        if (switched) _setSnapshot(id);
        _setRate(id, _safeRate(id));
        emit PoolRetargeted(id, cycle, recipient, g.rate);
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
        if (left != 0) {
            _point(id, _activeRecipient(id, cycle));
            uint256 bal = ISuperTokenMini(g.token).balanceOf(address(this));
            uint256 reserved = collateralOwed(id);
            uint256 free = bal > reserved ? bal - reserved : 0;
            if (left > free) left = free;
            if (left != 0) {
                uint256 beforeBal = ISuperTokenMini(g.token).balanceOf(address(this));
                gda.distribute(g.token, address(this), g.pool, left, "");
                uint256 spent = beforeBal - ISuperTokenMini(g.token).balanceOf(address(this));
                pot.accounted += spent;
                _creditReceived(id, g.streamingTo, spent);
            }
        }
        pot.closed = true;
    }

    function _point(uint256 id, address recipient) internal {
        if (recipient == address(0)) return;
        Group storage g = groups[id];
        if (g.streamingTo == recipient) return;
        if (g.streamingTo != address(0)) gda.updateMemberUnits(g.pool, g.streamingTo, 0, "");
        gda.updateMemberUnits(g.pool, recipient, 1, "");
        g.streamingTo = recipient;
    }

    /// @dev Count what the pool actually delivered this cycle, not the nominal rate.
    ///      GDA may stream a hair under the requested rate. The gap is paid by
    ///      `_distributePot` at the end of the cycle.
    function _noteStreamed(uint256 id) internal {
        Group storage g = groups[id];
        if (!g.cycleOpen || g.streamingTo == address(0)) return;
        uint256 received = ISuperfluidPool(g.pool).getTotalAmountReceivedByMember(g.streamingTo);
        uint256 delta = received > g.receivedSnapshot ? received - g.receivedSnapshot : 0;
        Cycle storage pot = pots[id][g.streamingCycle];
        if (delta > pot.funded) delta = pot.funded;
        uint256 before = pot.accounted;
        if (delta > pot.accounted) pot.accounted = delta;
        if (pot.accounted > before) _creditReceived(id, g.streamingTo, pot.accounted - before);
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
        if (block.timestamp >= cycleEnd) return 0;
        return _capRate(g.token, remaining, cycleEnd - block.timestamp, collateralOwed(id));
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
        (, uint64 graceEnd, uint64 cycleEnd) = _bounds(g, cycle, m.offset);
        if (block.timestamp < cycleEnd && block.timestamp <= graceEnd) revert StillOpen();

        uint128 slash = g.contribution;
        if (slash > m.collateral) slash = m.collateral;
        m.collateral -= slash;
        if (m.collateral < g.contribution) m.defaulted = true;
        p.amount = slash;
        p.paidAt = uint64(block.timestamp);
        p.status = PayStatus.Slashed;
        pots[id][cycle].funded += slash;
        m.owed += g.contribution;
        m.missed += 1;
        _pushLeg(id, m.account, address(0), g.contribution, uint16(cycle), PayStatus.Slashed);
        emit MissSettled(id, cycle, memberIndex, slash);
    }

    function _bounds(Group storage g, uint256 cycle, uint64 offset)
        internal
        view
        returns (uint64 windowStart, uint64 graceEnd, uint64 cycleEnd)
    {
        uint64 cycleStart = _cycleStart(g, cycle);
        windowStart = cycleStart + offset;
        graceEnd = windowStart + g.windowDuration + g.graceDuration;
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

    function _catchUp(uint256 id, uint256 cycle, bool open) internal {
        Group storage g = groups[id];
        uint256 n = g.memberCount;
        uint256 cursor = settledThrough[id];
        uint256 end = open ? cycle : g.totalCycles;
        for (uint256 c = cursor; c < end; ++c) {
            for (uint256 i; i < n; ++i) {
                if (payments[id][c][i].status == PayStatus.None) _settle(id, c, i);
            }
            _bind(id, uint16(c));
        }
        if (end > cursor) settledThrough[id] = uint16(end);
        if (!open) return;
        for (uint256 i; i < n; ++i) {
            if (payments[id][cycle][i].status != PayStatus.None) continue;
            if (_graceClosed(id, cycle, i)) _settle(id, cycle, i);
        }
        _bind(id, uint16(cycle));
    }

    function _bind(uint256 id, uint16 cycle) internal {
        address payee = _activeRecipient(id, cycle);
        Leg[] storage legs = _legs[id];
        uint256 n = legs.length;
        for (uint256 i; i < n; ++i) {
            Leg storage leg = legs[i];
            if (leg.cycle != cycle || leg.to != address(0) || leg.kind != PayStatus.Slashed) continue;
            leg.to = payee;
            owedFromTo[id][leg.from][payee] += leg.amount;
            emit Paid(id, leg.from, payee, cycle, PayStatus.Slashed, leg.amount);
        }
    }

    function _activeRecipient(uint256 id, uint256 cycle) internal view returns (address) {
        Group storage g = groups[id];
        uint256 n = g.memberCount;
        if (n == 0 || cycle >= g.totalCycles) return address(0);
        uint256 start = cycle % n;
        for (uint256 k; k < n; ++k) {
            uint256 i = (start + k) % n;
            if (!_skipped(id, cycle, i)) return _members[id][i].account;
        }
        return _members[id][start].account;
    }

    function _skipped(uint256 id, uint256 cycle, uint256 index) internal view returns (bool) {
        PayStatus status = payments[id][cycle][index].status;
        if (status == PayStatus.Slashed) return true;
        if (status != PayStatus.None) return false;
        return _graceClosed(id, cycle, index);
    }

    function _graceClosed(uint256 id, uint256 cycle, uint256 index) internal view returns (bool) {
        (, uint64 graceEnd, uint64 cycleEnd) = _bounds(groups[id], cycle, _members[id][index].offset);
        return block.timestamp > graceEnd || block.timestamp >= cycleEnd;
    }

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
        uint256 room = uint256(groups[id].collateralRequired) - uint256(m.collateral);
        uint256 restore = amount < room ? amount : room;
        m.collateral += uint128(restore);
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
            owedFromTo[id][from][debt.to] -= take;
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
}

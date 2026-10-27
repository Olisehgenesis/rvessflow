// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITokenAllowlist} from "./interfaces/ITokenAllowlist.sol";
import {IGDAv1Forwarder} from "./interfaces/ISuperfluidMini.sol";
import {SuperTokenReceiver} from "./SuperTokenReceiver.sol";

/// @notice Shared storage for {GroupRotation} and the extension it delegatecalls.
///         Field order is the group's storage layout. Do not reorder it.
abstract contract GroupRotationStore is Initializable, Ownable2Step, UUPSUpgradeable, ReentrancyGuard, SuperTokenReceiver {
    uint256 public constant MIN_MEMBERS = 3;
    uint256 public constant MAX_MEMBERS = 50;
    uint16 public constant MAX_CYCLES = 520;
    uint64 public constant MIN_CYCLE = 1 hours;
    uint64 public constant MAX_CYCLE = 366 days;
    uint256 public constant PROTECT_WINDOW = 1 hours;
    uint64 public constant UPGRADE_DELAY = 2 days;

    enum PayStatus {
        None,
        OnTime,
        Late,
        Slashed,
        Repaid
    }

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
        uint256 receivedSnapshot;
        /// @dev False keeps the pot as a GDA stream. True pays each contribution
        ///      straight to the member whose turn it is. Existing groups stay false.
        bool plain;
    }

    struct Member {
        address account;
        uint64 offset;
        uint128 collateral;
        bool collateralPosted;
        bool defaulted;
        uint256 given;
        uint256 received;
        uint256 owed;
        uint16 missed;
    }

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
    mapping(uint256 id => Member[] members) internal _members;
    mapping(uint256 id => mapping(address account => uint256 indexPlusOne)) internal _indexOf;
    mapping(uint256 id => mapping(uint256 cycle => mapping(uint256 index => Payment payment))) public payments;
    mapping(uint256 id => mapping(uint256 cycle => Cycle pot)) public pots;
    mapping(address user => uint256[] ids) internal _groupsOf;
    mapping(uint256 id => Leg[] legs) internal _legs;
    mapping(uint256 id => mapping(address from => uint256[] indexes)) internal _debtLegs;
    mapping(uint256 id => mapping(address from => mapping(address to => uint256 amount))) public paidFromTo;
    mapping(uint256 id => mapping(address from => mapping(address to => uint256 amount))) public owedFromTo;
    mapping(uint256 id => uint16 nextCycle) public settledThrough;
    mapping(uint256 id => bool paused) public groupPaused;
    mapping(uint256 id => uint64 began) public pauseBegan;
    mapping(uint256 id => uint64 secondsPaused) public pauseAccum;
    address public pendingImplementation;
    uint64 public upgradeReadyAt;

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
    event Exited(uint256 indexed id, address indexed member, uint256 collateral);
    event PayoutClaimed(uint256 indexed id, address indexed member, uint256 amount);
    event GroupCatchingUp(uint256 indexed id, uint16 settledThrough);

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
    /// @dev Autoconnect slots for this token are full. The member connects this pool from their own wallet.
    error SelfConnectRequired(address pool);
    error NothingOwed();
    error UpgradeNotReady();
    error NotAdmin();
    error NotManager();
    error NotProtocolAdmin();

    struct GroupRules {
        uint8 feeMode;
        uint16 feeBps;
        uint128 feeFlat;
        uint128 lockBalance;
        uint64 lockUnlockAt;
        address feePool;
        int96 feeRate;
        uint256 feeFunded;
        uint256 feeAccounted;
        uint256 feeSnapshot;
    }

    /// @dev Extra admins. The creator is always an admin even when this is false.
    mapping(uint256 id => mapping(address account => bool admin)) public groupAdmin;
    mapping(uint256 id => mapping(address account => bytes32 phone)) public memberPhone;
    mapping(uint256 id => uint16[] seats) internal _payoutOrder;
    mapping(uint256 id => GroupRules rules) public groupRules;
    mapping(address token => uint256 amount) public protocolFees;
    /// @dev Tokens that must not be paid out as pot or collateral: protocol fees, the group lock, and admin fees not yet sent.
    mapping(address token => uint256 amount) public kept;
    uint256 internal adminFeeGate;
    /// @dev Per-member contribution window. Zero means the group's window.
    mapping(uint256 id => mapping(uint256 index => uint64 window)) public memberWindow;
    /// @dev Collateral still held for every group that uses this token. A payout may not spend it.
    mapping(address token => uint256 amount) public collateralHeld;
    /// @dev Pot that is funded and not yet streamed or paid, across every group on this token.
    mapping(address token => uint256 amount) public openPots;

    event AdminAdded(uint256 indexed id, address indexed account);
    event AdminRemoved(uint256 indexed id, address indexed account);
    event MemberPhoneSet(uint256 indexed id, address indexed account, bytes32 phone);
    event PayoutOrderSet(uint256 indexed id);
    event AdminFeeSet(uint256 indexed id, uint8 mode, uint128 flat, uint16 bps);
    event GroupLocked(uint256 indexed id, uint256 amount, uint64 unlockAt);
    event GroupLockWithdrawn(uint256 indexed id, address indexed to, uint256 amount);
    event ProtocolFeeCharged(address indexed token, uint256 amount);
    event ProtocolFeeWithdrawn(address indexed token, address indexed to, uint256 amount);
    event AdminFeePaid(uint256 indexed id, uint256 amount);

    /// @dev Two slots were taken for {collateralHeld} and {openPots}. Append new fields above this.
    uint256[26] private __gap;

    function _holdCollateral(address token, uint256 amount) internal {
        if (amount != 0) collateralHeld[token] += amount;
    }

    function _releaseCollateral(address token, uint256 amount) internal {
        if (amount != 0) collateralHeld[token] -= amount;
    }

    function _fundPot(address token, uint256 amount) internal {
        if (amount != 0) openPots[token] += amount;
    }

    function _accountPot(address token, uint256 amount) internal {
        if (amount != 0) openPots[token] -= amount;
    }

    function _isAdmin(uint256 id, address account) internal view returns (bool) {
        if (_indexOf[id][account] == 0) return false;
        if (account == groups[id].creator) return true;
        return groupAdmin[id][account];
    }

    function _windowAt(uint256 id, uint256 index) internal view returns (uint64 window) {
        window = memberWindow[id][index];
        if (window == 0) window = groups[id].windowDuration;
    }

    function _memberSeat(uint256 id, uint256 slot) internal view returns (uint256) {
        uint16[] storage order = _payoutOrder[id];
        uint256 n = groups[id].memberCount;
        if (order.length != n) return slot % n;
        uint256 index = order[slot % n];
        if (index >= n) return slot % n;
        return index;
    }

    constructor(address allowlist_, address host_, address gda_) Ownable(msg.sender) {
        if (allowlist_ == address(0) || host_ == address(0) || gda_ == address(0)) revert ZeroAddress();
        allowlist = ITokenAllowlist(allowlist_);
        host = host_;
        gda = IGDAv1Forwarder(gda_);
    }
}

interface IGroupCycle {
    function currentCycle(uint256 id) external view returns (uint256 cycle, bool open);
}

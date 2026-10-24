// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ICFAv1Forwarder} from "./interfaces/ISuperfluidMini.sol";
import {SuperTokenReceiver} from "./SuperTokenReceiver.sol";

/// @notice Shared storage for {FlowVault} and the extension it delegatecalls.
///         Field order is the vault's storage layout. Do not reorder it.
abstract contract FlowVaultStore is Initializable, ReentrancyGuard, SuperTokenReceiver {
    uint256 public constant MAX_FLOWS = 64;
    uint8 public constant MAX_DEPTH = 3;
    uint256 public constant MAX_CHAIN = 8;
    uint256 public constant MAX_CHILDREN = 16;
    uint64 public constant MIN_DURATION = 60;
    uint64 public constant MAX_DURATION = 30 * 365 days;
    uint256 public constant PROTECT_WINDOW = 1 hours;
    uint16 public constant BPS = 10_000;

    enum FlowKind {
        Expense,
        SavingGoal,
        FlowGoal
    }
    enum ChainMode {
        None,
        OnEnd,
        OnGoal
    }
    enum RateMode {
        Fixed,
        Share
    }

    struct Flow {
        address token;
        address recipient;
        address conduit;
        FlowKind kind;
        ChainMode chainMode;
        RateMode rateMode;
        uint16 shareBps;
        uint8 depth;
        bool allowSubflows;
        bool keeperGated;
        bool triggered;
        bool active;
        bool settled;
        bytes32 name;
        uint64 earliestStart;
        uint64 duration;
        uint64 createdAt;
        uint64 triggeredAt;
        uint64 start;
        uint64 end;
        int96 rate;
        int96 childRate;
        int96 liveRate;
        uint256 parentId;
        uint256 predecessorId;
        uint256 goalAmount;
        uint256 reserved;
        uint256 buffers;
        uint256 cushion;
        bool paused;
        uint64 remaining;
        /// @dev Seconds that counted toward a goal when this flow settled. Zero if it never ran.
        uint64 ran;
    }

    struct CreateFlowParams {
        address token;
        address recipient;
        FlowKind kind;
        uint256 amount;
        uint64 earliestStart;
        uint64 duration;
        uint256 goalAmount;
        bool allowSubflows;
        uint256 predecessorId;
        ChainMode chainMode;
        bool keeperGated;
        bytes32 name;
    }

    struct CreateSubflowParams {
        uint256 parentId;
        address recipient;
        FlowKind kind;
        RateMode rateMode;
        uint256 amount;
        uint16 shareBps;
        uint256 goalAmount;
        bool allowSubflows;
        bytes32 name;
    }

    address public immutable host;
    ICFAv1Forwarder public immutable cfa;
    address public immutable conduitImplementation;

    address public owner;
    address public factory;
    uint256 public nextId;

    mapping(address token => uint256 amount) public unallocated;
    mapping(address token => uint256 count) public activeCount;
    mapping(uint256 id => Flow flow) internal _flows;
    mapping(uint256 id => uint256[] childIds) internal _children;
    uint256[] internal _ids;
    mapping(address token => uint256 amount) public protocolFees;
    uint256 internal openCount;
    mapping(address token => uint256[] ids) internal liveRoots;
    mapping(uint256 id => uint256 indexPlusOne) internal liveRootAt;
    /// @dev Set for vaults created on this code. Older vaults rebuild the index on the next protect.
    bool internal openFlowsIndexed;

    event Deposited(address indexed from, address indexed token, uint256 amount);
    event ProtocolFeeCharged(address indexed token, uint256 amount);
    event ProtocolFeeWithdrawn(address indexed token, address indexed to, uint256 amount);
    event Withdrawn(address indexed to, address indexed token, uint256 amount);
    event FlowCreated(uint256 indexed id, uint256 indexed parentId, address indexed recipient, address token, int96 rate);
    event FlowActivated(uint256 indexed id, uint64 start, uint64 end);
    event FlowSettled(uint256 indexed id, uint256 refunded);
    event FlowTriggered(uint256 indexed id, address indexed caller);

    error NotOwner();
    error NotFactory();
    error ZeroAddress();
    error ZeroAmount();
    error TokenNotAllowed();
    error Paused();
    error BadDuration();
    error BadRate();
    error BadKind();
    error RecipientMustBeOwner();
    error SubflowsNotAllowed();
    error TooManyFlows();
    error TooDeep();
    error TooManyChildren();
    error ParentStarted();
    error NotFound();
    error NotActive();
    error StillActive();
    error TooEarly();
    error NotTriggered();
    error NotGated();
    error AlreadyTriggered();
    error BadChain();
    error ChainTooLong();
    error GoalRequired();
    error GoalNotReached();
    error GoalTooLarge();
    error GoalNotAllowed();
    error BadShare();
    error RateExceeded();
    error Insufficient();
    error NotRoot();
    error BadAmount();
    error WrongTokenKind();
    error StreamMismatch();
    error AlreadyPaused();
    error NotPaused();
    error NotSelf();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @dev Vaults opened before the live-root index existed still have their flows in `_ids`.
    function _indexExisting() internal {
        if (openFlowsIndexed) return;
        openFlowsIndexed = true;
        uint256 n = _ids.length;
        for (uint256 i; i < n; ++i) {
            uint256 id = _ids[i];
            Flow storage flow = _flows[id];
            if (flow.createdAt == 0 || flow.settled) continue;
            if (flow.parentId == 0) _trackRoot(flow.token, id);
            else openCount++;
        }
    }

    /// @dev Reads use the index after it has been built, and history before that.
    function _rootsOf(address token) internal view returns (uint256[] memory ids) {
        if (openFlowsIndexed) {
            uint256 n = liveRoots[token].length;
            ids = new uint256[](n);
            for (uint256 i; i < n; ++i) ids[i] = liveRoots[token][i];
            return ids;
        }
        uint256 total = _ids.length;
        uint256 count;
        for (uint256 i; i < total; ++i) {
            Flow storage flow = _flows[_ids[i]];
            if (flow.parentId == 0 && !flow.settled && flow.token == token && flow.createdAt != 0) count++;
        }
        ids = new uint256[](count);
        uint256 write;
        for (uint256 i; i < total; ++i) {
            uint256 id = _ids[i];
            Flow storage flow = _flows[id];
            if (flow.parentId == 0 && !flow.settled && flow.token == token && flow.createdAt != 0) ids[write++] = id;
        }
    }

    function _trackRoot(address token, uint256 id) internal {
        liveRoots[token].push(id);
        liveRootAt[id] = liveRoots[token].length;
        openCount++;
    }

    function _trackChild() internal {
        openCount++;
    }

    function _dropOpen(uint256 n) internal {
        openCount -= n;
    }

    function _untrackRoot(address token, uint256 id) internal {
        uint256 indexPlus = liveRootAt[id];
        if (indexPlus == 0) return;
        uint256[] storage roots = liveRoots[token];
        uint256 last = roots.length;
        if (indexPlus != last) {
            uint256 moved = roots[last - 1];
            roots[indexPlus - 1] = moved;
            liveRootAt[moved] = indexPlus;
        }
        roots.pop();
        liveRootAt[id] = 0;
    }

    /// @dev CFA rate actually opened for this node and its children. A saving goal holds, so it adds nothing.
    function _outflowRate(uint256 id) internal view returns (uint256 total) {
        Flow storage flow = _flows[id];
        if (flow.settled || flow.kind == FlowKind.SavingGoal) return 0;
        int96 residual = flow.rate - flow.childRate;
        if (residual > 0) total = uint256(uint96(residual));
        uint256 n = _children[id].length;
        for (uint256 i; i < n; ++i) {
            total += _outflowRate(_children[id][i]);
        }
    }

    /// @dev Full amount sitting in the vault for saving goals in this tree.
    function _heldReserve(uint256 id) internal view returns (uint256 total) {
        Flow storage flow = _flows[id];
        if (flow.settled) return 0;
        if (flow.kind == FlowKind.SavingGoal) return flow.reserved;
        uint256 n = _children[id].length;
        for (uint256 i; i < n; ++i) {
            total += _heldReserve(_children[id][i]);
        }
    }

    constructor(address host_, address cfa_, address conduitImplementation_) {
        if (host_ == address(0) || cfa_ == address(0) || conduitImplementation_ == address(0)) revert ZeroAddress();
        host = host_;
        cfa = ICFAv1Forwarder(cfa_);
        conduitImplementation = conduitImplementation_;
    }
}

interface IFlowVaultHooks {
    function hookProtect(address token) external;
    function hookSilence(uint256 id) external;
    function hookOpen(uint256 id, int96 rate) external;
    function hookOpenChildren(uint256 id, uint64 start, uint64 end) external;
    function hookRequireMargin(address token) external;
}

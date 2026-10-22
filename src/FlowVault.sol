// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ITokenAllowlist} from "./interfaces/ITokenAllowlist.sol";
import {IVaultFactory} from "./interfaces/IVaultFactory.sol";
import {ISuperTokenMini, ISETHMini, ICFAv1Forwarder, ISuperfluidHost} from "./interfaces/ISuperfluidMini.sol";
import {FlowConduit} from "./FlowConduit.sol";
import {SuperTokenReceiver} from "./SuperTokenReceiver.sol";

/// @title FlowVault
/// @notice One person's savings wallet. Every flow and subflow is a real Superfluid
///         CFA stream: the vault streams to a per-flow conduit, and the conduit streams
///         to the recipient. Nothing vests on an internal balance.
/// @dev Scheduled starts are not opened in FlowScheduler. `activate` is permissionless
///      once the time, chain, or keeper condition is true, and it refuses to open a
///      stream that would leave the vault critical. See the README for why.
contract FlowVault is Initializable, ReentrancyGuard, SuperTokenReceiver {
    using SafeERC20 for IERC20;

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
    mapping(uint256 id => Flow flow) private _flows;
    mapping(uint256 id => uint256[] childIds) private _children;
    uint256[] private _ids;

    event Deposited(address indexed from, address indexed token, uint256 amount);
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

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address host_, address cfa_, address conduitImplementation_) {
        if (host_ == address(0) || cfa_ == address(0) || conduitImplementation_ == address(0)) revert ZeroAddress();
        host = host_;
        cfa = ICFAv1Forwarder(cfa_);
        conduitImplementation = conduitImplementation_;
        _disableInitializers();
    }

    function initialize(address owner_, address factory_) external initializer {
        if (owner_ == address(0) || factory_ == address(0)) revert ZeroAddress();
        if (msg.sender != factory_) revert NotFactory();
        owner = owner_;
        factory = factory_;
        nextId = 1;
        _registerSuperTokenReceiver();
    }

    receive() external payable {}

    function depositSuper(address token, uint256 amount) external nonReentrant {
        _protect(token);
        if (amount == 0) revert ZeroAmount();
        _requireAllowed(token);
        uint256 got = _pullSuper(token, amount);
        unallocated[token] += got;
        emit Deposited(msg.sender, token, got);
    }

    function depositUnderlying(address token, uint256 underlyingAmount) external nonReentrant {
        _protect(token);
        if (underlyingAmount == 0) revert ZeroAmount();
        ITokenAllowlist list = _requireAllowed(token);
        if (list.kindOf(token) != ITokenAllowlist.TokenKind.Wrapper) revert WrongTokenKind();
        uint256 minted = _upgrade(token, list, underlyingAmount);
        unallocated[token] += minted;
        emit Deposited(msg.sender, token, minted);
    }

    function depositNative(address token) external payable nonReentrant {
        _protect(token);
        if (msg.value == 0) revert ZeroAmount();
        ITokenAllowlist list = _requireAllowed(token);
        if (list.kindOf(token) != ITokenAllowlist.TokenKind.Native) revert WrongTokenKind();
        uint256 beforeBal = ISuperTokenMini(token).balanceOf(address(this));
        ISETHMini(token).upgradeByETH{value: msg.value}();
        uint256 minted = ISuperTokenMini(token).balanceOf(address(this)) - beforeBal;
        unallocated[token] += minted;
        emit Deposited(msg.sender, token, minted);
    }

    function withdraw(address token, uint256 amount) external nonReentrant onlyOwner {
        _protect(token);
        _take(token, amount);
        ISuperTokenMini(token).transfer(owner, amount);
        _requireMargin(token);
        emit Withdrawn(owner, token, amount);
    }

    function withdrawUnderlying(address token, uint256 amount) external nonReentrant onlyOwner {
        _protect(token);
        _take(token, amount);
        (uint256 underlyingAmount, uint256 adjusted) = ISuperTokenMini(token).toUnderlyingAmount(amount);
        if (adjusted != amount || underlyingAmount == 0) revert BadAmount();
        address underlying = ISuperTokenMini(token).getUnderlyingToken();
        ISuperTokenMini(token).downgrade(amount);
        IERC20(underlying).safeTransfer(owner, underlyingAmount);
        _requireMargin(token);
        emit Withdrawn(owner, token, amount);
    }

    function withdrawNative(address token, uint256 amount) external nonReentrant onlyOwner {
        _protect(token);
        _take(token, amount);
        ISETHMini(token).downgradeToETH(amount);
        (bool ok,) = owner.call{value: amount}("");
        if (!ok) revert Insufficient();
        _requireMargin(token);
        emit Withdrawn(owner, token, amount);
    }

    function createFlow(CreateFlowParams calldata p) external nonReentrant onlyOwner returns (uint256 id) {
        _protect(p.token);
        if (_list().paused()) revert Paused();
        _requireAllowed(p.token);
        if (p.recipient == address(0)) revert ZeroAddress();
        if (p.duration < MIN_DURATION || p.duration > MAX_DURATION) revert BadDuration();
        if (_ids.length >= MAX_FLOWS) revert TooManyFlows();
        if (p.kind == FlowKind.SavingGoal) {
            if (p.recipient != owner) revert RecipientMustBeOwner();
            if (p.allowSubflows) revert SubflowsNotAllowed();
        }
        (int96 rate, uint256 reserved) = _rate(p.amount, p.duration);
        if (p.kind == FlowKind.Expense) {
            if (p.goalAmount != 0) revert GoalNotAllowed();
        } else if (p.goalAmount == 0 || p.goalAmount > reserved) {
            if (p.goalAmount == 0) revert GoalRequired();
            revert GoalTooLarge();
        }
        _checkChain(p.predecessorId, p.chainMode, p.token);

        uint256 buffers = _pairBuffer(p.token, rate);
        uint256 cushion = uint256(uint96(rate)) * PROTECT_WINDOW;
        uint256 need = reserved + buffers + cushion;
        if (unallocated[p.token] < need) revert Insufficient();
        unallocated[p.token] -= need;

        id = nextId++;
        _flows[id] = Flow({
            token: p.token,
            recipient: p.recipient,
            conduit: address(0),
            kind: p.kind,
            chainMode: p.chainMode,
            rateMode: RateMode.Fixed,
            shareBps: 0,
            depth: 0,
            allowSubflows: p.allowSubflows,
            keeperGated: p.keeperGated,
            triggered: false,
            active: false,
            settled: false,
            name: p.name,
            earliestStart: p.earliestStart,
            duration: p.duration,
            createdAt: uint64(block.timestamp),
            triggeredAt: 0,
            start: 0,
            end: 0,
            rate: rate,
            childRate: 0,
            liveRate: 0,
            parentId: 0,
            predecessorId: p.predecessorId,
            goalAmount: p.goalAmount,
            reserved: reserved,
            buffers: buffers,
            cushion: cushion
        });
        _ids.push(id);
        emit FlowCreated(id, 0, p.recipient, p.token, rate);
    }

    function createSubflow(CreateSubflowParams calldata p) external nonReentrant onlyOwner returns (uint256 id) {
        Flow storage parent = _flows[p.parentId];
        if (parent.createdAt == 0 || parent.settled) revert NotFound();
        uint256 rootId = _rootOf(p.parentId);
        if (_flows[rootId].active || _flows[rootId].settled) revert ParentStarted();
        if (!parent.allowSubflows) revert SubflowsNotAllowed();
        if (parent.depth >= MAX_DEPTH) revert TooDeep();
        if (_children[p.parentId].length >= MAX_CHILDREN) revert TooManyChildren();
        if (_ids.length >= MAX_FLOWS) revert TooManyFlows();
        if (p.recipient == address(0)) revert ZeroAddress();
        _protect(parent.token);
        if (_list().paused()) revert Paused();

        int96 rate;
        uint16 share;
        if (p.rateMode == RateMode.Share) {
            if (p.shareBps == 0 || p.shareBps > BPS) revert BadShare();
            rate = int96(int256(uint256(uint96(parent.rate)) * p.shareBps / BPS));
            share = p.shareBps;
        } else {
            (rate,) = _rate(p.amount, parent.duration);
            share = 0;
        }
        if (rate <= 0) revert BadRate();
        if (uint256(uint96(parent.childRate)) + uint256(uint96(rate)) > uint256(uint96(parent.rate))) {
            revert RateExceeded();
        }
        if (p.kind == FlowKind.SavingGoal && p.recipient != owner) revert RecipientMustBeOwner();
        if (p.kind == FlowKind.Expense && p.goalAmount != 0) revert GoalNotAllowed();
        if (p.kind != FlowKind.Expense && (p.goalAmount == 0 || p.goalAmount > uint256(uint96(rate)) * parent.duration)) {
            if (p.goalAmount == 0) revert GoalRequired();
            revert GoalTooLarge();
        }
        if (p.kind == FlowKind.SavingGoal && p.allowSubflows) revert SubflowsNotAllowed();

        id = nextId++;
        _flows[id] = Flow({
            token: parent.token,
            recipient: p.recipient,
            conduit: address(0),
            kind: p.kind,
            chainMode: ChainMode.None,
            rateMode: p.rateMode,
            shareBps: share,
            depth: parent.depth + 1,
            allowSubflows: p.allowSubflows,
            keeperGated: false,
            triggered: false,
            active: false,
            settled: false,
            name: p.name,
            earliestStart: parent.earliestStart,
            duration: parent.duration,
            createdAt: uint64(block.timestamp),
            triggeredAt: 0,
            start: 0,
            end: 0,
            rate: rate,
            childRate: 0,
            liveRate: 0,
            parentId: p.parentId,
            predecessorId: 0,
            goalAmount: p.goalAmount,
            reserved: uint256(uint96(rate)) * parent.duration,
            buffers: 0,
            cushion: 0
        });
        _children[p.parentId].push(id);
        _ids.push(id);
        parent.childRate += rate;
        _retargetBuffers(rootId);
        emit FlowCreated(id, p.parentId, p.recipient, parent.token, rate);
    }

    function trigger(uint256 id) external nonReentrant {
        Flow storage flow = _flows[id];
        if (flow.createdAt == 0 || flow.parentId != 0) revert NotFound();
        if (!flow.keeperGated) revert NotGated();
        if (flow.triggered) revert AlreadyTriggered();
        address keeper = IVaultFactory(factory).keeper();
        if (msg.sender != owner && msg.sender != keeper) revert NotOwner();
        flow.triggered = true;
        flow.triggeredAt = uint64(block.timestamp);
        emit FlowTriggered(id, msg.sender);
        if (_ready(flow)) _activate(id);
    }

    /// @notice Open the CFA streams once the schedule allows it. Anyone may call.
    function activate(uint256 id) external nonReentrant {
        Flow storage flow = _flows[id];
        if (flow.createdAt == 0 || flow.parentId != 0) revert NotFound();
        if (flow.settled) revert NotActive();
        if (flow.active) revert StillActive();
        if (!_ready(flow)) {
            if (flow.keeperGated && !flow.triggered) revert NotTriggered();
            revert TooEarly();
        }
        _activate(id);
    }

    function cancel(uint256 id) external nonReentrant onlyOwner {
        Flow storage flow = _flows[id];
        if (flow.createdAt == 0 || flow.settled) revert NotFound();
        uint256 rootId = _rootOf(id);
        if (flow.parentId != 0 && !_flows[rootId].active) {
            _flows[flow.parentId].childRate -= flow.rate;
            _markSettled(id);
            _retargetBuffers(rootId);
            emit FlowSettled(id, 0);
            return;
        }
        _closeRoot(rootId);
    }

    function settle(uint256 id) external nonReentrant {
        Flow storage flow = _flows[id];
        if (flow.createdAt == 0) revert NotFound();
        uint256 rootId = _rootOf(id);
        Flow storage root = _flows[rootId];
        if (root.settled) revert NotActive();
        if (!root.active) revert NotActive();
        if (block.timestamp < root.end && !_broken(rootId) && !_criticalSoon(root.token)) revert StillActive();
        _closeRoot(rootId);
    }

    function protect(address token) external nonReentrant {
        _protect(token);
    }

    function getFlow(uint256 id) external view returns (Flow memory) {
        return _flows[id];
    }

    function flowCount() external view returns (uint256) {
        return _ids.length;
    }

    function flowIdAt(uint256 index) external view returns (uint256) {
        return _ids[index];
    }

    function childrenOf(uint256 id) external view returns (uint256[] memory) {
        return _children[id];
    }

    function preview(address token, address account)
        external
        view
        returns (uint256 balance, int96 netFlow, uint256 timestamp)
    {
        balance = ISuperTokenMini(token).balanceOf(account);
        netFlow = cfa.getAccountFlowrate(token, account);
        timestamp = block.timestamp;
    }

    function _activate(uint256 id) internal {
        Flow storage root = _flows[id];
        uint64 start = uint64(block.timestamp);
        uint64 end = start + root.duration;
        root.active = true;
        root.start = start;
        root.end = end;
        root.liveRate = root.rate - root.childRate;
        activeCount[root.token] += 1;
        _open(id, root.liveRate);
        _openChildren(id, start, end);
        _requireMargin(root.token);
        emit FlowActivated(id, start, end);
    }

    function _openChildren(uint256 id, uint64 start, uint64 end) internal {
        uint256 n = _children[id].length;
        for (uint256 i; i < n; ++i) {
            uint256 childId = _children[id][i];
            Flow storage child = _flows[childId];
            if (child.settled) continue;
            child.active = true;
            child.start = start;
            child.end = end;
            // Children are real CFA streams of the residual only. A parent whose
            // children already take the whole rate does not open a second stream.
            int96 residual = child.rate - child.childRate;
            child.liveRate = residual;
            _open(childId, residual);
            _openChildren(childId, start, end);
        }
    }

    function _open(uint256 id, int96 rate) internal {
        if (rate == 0) return;
        Flow storage flow = _flows[id];
        uint256 conduitBuffer = cfa.getBufferAmountByFlowrate(flow.token, rate);
        address conduit = Clones.clone(conduitImplementation);
        FlowConduit(conduit).initialize(address(this), flow.token);
        if (conduitBuffer != 0) {
            ISuperTokenMini(flow.token).transfer(conduit, conduitBuffer);
        }
        FlowConduit(conduit).setStream(flow.recipient, rate);
        cfa.setFlowrate(flow.token, conduit, rate);
        if (cfa.getFlowrate(flow.token, conduit, flow.recipient) != rate) revert StreamMismatch();
        if (cfa.getFlowrate(flow.token, address(this), conduit) != rate) revert StreamMismatch();
        flow.conduit = conduit;
        flow.liveRate = rate;
    }

    function _closeRoot(uint256 id) internal {
        Flow storage root = _flows[id];
        if (root.createdAt == 0 || root.parentId != 0) revert NotRoot();
        if (root.settled) revert NotActive();
        address token = root.token;
        bool wasActive = root.active;
        uint256 unstreamed;
        if (wasActive) {
            uint256 elapsed = block.timestamp >= root.end ? root.duration : block.timestamp - root.start;
            uint256 streamed = uint256(uint96(root.rate)) * elapsed;
            unstreamed = root.reserved > streamed ? root.reserved - streamed : 0;
        } else {
            unstreamed = root.reserved;
        }
        uint256 cushion = root.cushion;
        uint256 buffers = root.buffers;
        root.settled = true;
        root.active = false;
        root.liveRate = 0;
        if (wasActive) activeCount[token] -= 1;

        uint256 beforeBal = ISuperTokenMini(token).balanceOf(address(this));
        _shutTree(id);
        uint256 gained = ISuperTokenMini(token).balanceOf(address(this)) - beforeBal;
        if (wasActive) unallocated[token] += unstreamed + cushion + gained;
        else unallocated[token] += unstreamed + cushion + buffers;
        _clampIdle(token);
        emit FlowSettled(id, unallocated[token]);
    }

    function _shutTree(uint256 id) internal {
        _shut(id);
        uint256 n = _children[id].length;
        for (uint256 i; i < n; ++i) {
            uint256 childId = _children[id][i];
            _flows[childId].settled = true;
            _flows[childId].active = false;
            _flows[childId].liveRate = 0;
            _shutTree(childId);
        }
    }

    function _shut(uint256 id) internal {
        Flow storage flow = _flows[id];
        if (flow.conduit == address(0)) return;
        cfa.setFlowrate(flow.token, flow.conduit, 0);
        FlowConduit(flow.conduit).close();
    }

    function _protect(address token) internal {
        uint256 n = _ids.length;
        for (uint256 i; i < n; ++i) {
            uint256 id = _ids[i];
            Flow storage flow = _flows[id];
            if (flow.token != token || flow.parentId != 0 || flow.settled || !flow.active) continue;
            if (block.timestamp >= flow.end || _broken(id)) _closeRoot(id);
        }
        if (activeCount[token] != 0 && _criticalSoon(token)) {
            for (uint256 i; i < _ids.length; ++i) {
                uint256 id = _ids[i];
                Flow storage flow = _flows[id];
                if (flow.token == token && flow.parentId == 0 && flow.active && !flow.settled) {
                    _closeRoot(id);
                    if (!_criticalSoon(token)) break;
                }
            }
        }
    }

    function _broken(uint256 id) internal view returns (bool) {
        Flow storage flow = _flows[id];
        if (flow.liveRate > 0) {
            if (flow.conduit == address(0)) return true;
            if (cfa.getFlowrate(flow.token, flow.conduit, flow.recipient) != flow.liveRate) return true;
            if (cfa.getFlowrate(flow.token, address(this), flow.conduit) != flow.liveRate) return true;
        }
        uint256 n = _children[id].length;
        for (uint256 i; i < n; ++i) {
            if (_broken(_children[id][i])) return true;
        }
        return false;
    }

    function _ready(Flow storage flow) internal view returns (bool) {
        if (flow.settled || flow.active) return false;
        if (flow.keeperGated && !flow.triggered) return false;
        if (flow.earliestStart != 0 && block.timestamp < flow.earliestStart) return false;
        if (flow.chainMode == ChainMode.None) return true;
        Flow storage pred = _flows[flow.predecessorId];
        if (flow.chainMode == ChainMode.OnEnd) {
            return pred.settled || (pred.active && block.timestamp >= pred.end);
        }
        if (!pred.active || pred.rate == 0) return false;
        uint256 elapsed = block.timestamp - pred.start;
        return uint256(uint96(pred.rate)) * elapsed >= pred.goalAmount;
    }

    function _checkChain(uint256 predecessorId, ChainMode mode, address token) internal view {
        if (mode == ChainMode.None) {
            if (predecessorId != 0) revert BadChain();
            return;
        }
        if (predecessorId == 0) revert BadChain();
        Flow storage pred = _flows[predecessorId];
        if (pred.createdAt == 0 || pred.parentId != 0 || pred.token != token) revert BadChain();
        if (mode == ChainMode.OnGoal && pred.goalAmount == 0) revert GoalRequired();
        uint256 length = 1;
        uint256 cursor = predecessorId;
        while (cursor != 0) {
            length++;
            if (length > MAX_CHAIN) revert ChainTooLong();
            cursor = _flows[cursor].predecessorId;
        }
    }

    function _retargetBuffers(uint256 rootId) internal {
        Flow storage root = _flows[rootId];
        uint256 needed = _treeBuffers(rootId);
        if (needed > root.buffers) {
            uint256 extra = needed - root.buffers;
            if (unallocated[root.token] < extra) revert Insufficient();
            unallocated[root.token] -= extra;
        } else if (root.buffers > needed) {
            unallocated[root.token] += root.buffers - needed;
        }
        root.buffers = needed;
    }

    function _rootOf(uint256 id) internal view returns (uint256) {
        while (_flows[id].parentId != 0) {
            id = _flows[id].parentId;
        }
        return id;
    }

    function _markSettled(uint256 id) internal {
        _flows[id].settled = true;
        _flows[id].liveRate = 0;
        uint256 n = _children[id].length;
        for (uint256 i; i < n; ++i) {
            _markSettled(_children[id][i]);
        }
    }

    function _treeBuffers(uint256 id) internal view returns (uint256 total) {
        Flow storage flow = _flows[id];
        if (flow.settled) return 0;
        int96 residual = flow.rate - flow.childRate;
        if (residual < 0) revert RateExceeded();
        total = _pairBuffer(flow.token, residual);
        uint256 n = _children[id].length;
        for (uint256 i; i < n; ++i) {
            total += _treeBuffers(_children[id][i]);
        }
    }

    function _pairBuffer(address token, int96 rate) internal view returns (uint256) {
        if (rate == 0) return 0;
        return 2 * cfa.getBufferAmountByFlowrate(token, rate);
    }

    function _rate(uint256 amount, uint64 duration) internal pure returns (int96 rate, uint256 reserved) {
        if (amount == 0 || duration == 0) revert BadRate();
        uint256 perSecond = amount / duration;
        if (perSecond == 0 || perSecond > uint256(uint96(type(int96).max))) revert BadRate();
        rate = int96(int256(perSecond));
        reserved = uint256(uint96(rate)) * duration;
    }

    function _requireAllowed(address token) internal view returns (ITokenAllowlist list) {
        list = _list();
        if (!list.isAllowed(token)) revert TokenNotAllowed();
    }

    function _list() internal view returns (ITokenAllowlist) {
        return ITokenAllowlist(IVaultFactory(factory).allowlist());
    }

    function _pullSuper(address token, uint256 amount) internal returns (uint256 got) {
        uint256 beforeBal = ISuperTokenMini(token).balanceOf(address(this));
        ISuperTokenMini(token).transferFrom(msg.sender, address(this), amount);
        got = ISuperTokenMini(token).balanceOf(address(this)) - beforeBal;
        if (got == 0) revert ZeroAmount();
    }

    function _upgrade(address token, ITokenAllowlist list, uint256 underlyingAmount) internal returns (uint256 minted) {
        uint8 decimals = list.underlyingDecimalsOf(token);
        if (decimals == 0 || decimals > 18) revert BadAmount();
        uint256 superAmount = underlyingAmount * (10 ** (18 - decimals));
        (uint256 pullAmount, uint256 adjusted) = ISuperTokenMini(token).toUnderlyingAmount(superAmount);
        if (adjusted == 0 || pullAmount == 0) revert BadAmount();
        address underlying = list.underlyingOf(token);
        IERC20(underlying).safeTransferFrom(msg.sender, address(this), pullAmount);
        IERC20(underlying).forceApprove(address(token), pullAmount);
        uint256 beforeBal = ISuperTokenMini(token).balanceOf(address(this));
        ISuperTokenMini(token).upgrade(superAmount);
        minted = ISuperTokenMini(token).balanceOf(address(this)) - beforeBal;
        if (minted == 0) revert ZeroAmount();
    }

    function _take(address token, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (amount > unallocated[token]) revert Insufficient();
        unallocated[token] -= amount;
    }

    function _requireMargin(address token) internal view {
        if (activeCount[token] == 0) return;
        if (_criticalSoon(token)) revert Insufficient();
    }

    function _criticalSoon(address token) internal view returns (bool) {
        return ISuperTokenMini(token).isAccountCritical(address(this), block.timestamp + PROTECT_WINDOW);
    }

    function _clampIdle(address token) internal {
        if (_hasOpenRoot(token)) return;
        (, uint256 deposit,,) = ISuperTokenMini(token).realtimeBalanceOfNow(address(this));
        if (deposit != 0) return;
        unallocated[token] = ISuperTokenMini(token).balanceOf(address(this));
    }

    function _hasOpenRoot(address token) internal view returns (bool) {
        uint256 n = _ids.length;
        for (uint256 i; i < n; ++i) {
            Flow storage flow = _flows[_ids[i]];
            if (flow.token == token && flow.parentId == 0 && !flow.settled) return true;
        }
        return false;
    }
}

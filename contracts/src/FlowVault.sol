// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {ITokenAllowlist} from "./interfaces/ITokenAllowlist.sol";
import {IVaultFactory} from "./interfaces/IVaultFactory.sol";
import {ISuperTokenMini} from "./interfaces/ISuperfluidMini.sol";
import {FlowConduit} from "./FlowConduit.sol";
import {FlowVaultExtension} from "./FlowVaultExtension.sol";
import {FlowVaultStore, IFlowVaultHooks} from "./FlowVaultStore.sol";

/// @title FlowVault
/// @notice RvessFlow Protocol. One person's savings wallet. An expense or a flow goal is a real Superfluid
///         CFA stream: the vault streams to a per-flow conduit, and the conduit streams
///         to the recipient. A saving goal holds the deposit until its end date and
///         does not open a stream, so it cannot be liquidated.
/// @dev Scheduled starts are not opened in FlowScheduler. `activate` is permissionless
///      once the time, chain, or keeper condition is true, and it refuses to open a
///      stream that would leave the vault critical. See the README for why.
contract FlowVault is FlowVaultStore, IFlowVaultHooks {
    address public immutable extension;

    constructor(address host_, address cfa_, address conduitImplementation_)
        FlowVaultStore(host_, cfa_, conduitImplementation_)
    {
        extension = address(new FlowVaultExtension(host_, cfa_, conduitImplementation_));
        _disableInitializers();
    }


    function initialize(address owner_, address factory_) external initializer {
        if (owner_ == address(0) || factory_ == address(0)) revert ZeroAddress();
        if (msg.sender != factory_) revert NotFactory();
        owner = owner_;
        factory = factory_;
        nextId = 1;
        openFlowsIndexed = true;
        _registerSuperTokenReceiver();
    }

    receive() external payable {}

    /// @dev Deposits and withdrawals live on the extension so this contract stays under the code-size limit.
    function depositSuper(address, uint256) external {
        _delegate();
    }

    function depositUnderlying(address, uint256) external {
        _delegate();
    }

    function depositNative(address) external payable {
        _delegate();
    }

    function withdraw(address, uint256) external {
        _delegate();
    }

    function withdrawUnderlying(address, uint256) external {
        _delegate();
    }

    function withdrawNative(address, uint256) external {
        _delegate();
    }

    function createFlow(CreateFlowParams calldata p) external nonReentrant onlyOwner returns (uint256 id) {
        id = _createFlow(p);
    }

    /// @notice Hold `amount` until `duration` has passed. One call creates and starts the goal.
    ///         `target` may be larger than the first deposit. Nothing is streamed.
    function openSavings(address token, uint256 amount, uint64 duration, bytes32 name_, uint256 target)
        external
        nonReentrant
        onlyOwner
        returns (uint256 id)
    {
        id = _createFlow(
            CreateFlowParams({
                token: token,
                recipient: owner,
                kind: FlowKind.SavingGoal,
                amount: amount,
                earliestStart: 0,
                duration: duration,
                goalAmount: target == 0 ? amount : target,
                allowSubflows: false,
                predecessorId: 0,
                chainMode: ChainMode.None,
                keeperGated: false,
                name: name_
            })
        );
        _activate(id);
    }

    function _createFlow(CreateFlowParams memory p) internal returns (uint256 id) {
        _protect(p.token);
        if (_list().paused()) revert Paused();
        _requireAllowed(p.token);
        if (p.recipient == address(0)) revert ZeroAddress();
        if (p.duration < MIN_DURATION || p.duration > MAX_DURATION) revert BadDuration();
        if (_unsettled() >= MAX_FLOWS) revert TooManyFlows();
        if (p.kind == FlowKind.SavingGoal) {
            if (p.recipient != owner) revert RecipientMustBeOwner();
            if (p.allowSubflows) revert SubflowsNotAllowed();
        }
        (int96 rate, uint256 reserved) = _rate(p.amount, p.duration);
        bool hold = p.kind == FlowKind.SavingGoal;
        if (p.kind == FlowKind.Expense) {
            if (p.goalAmount != 0) revert GoalNotAllowed();
        } else if (hold) {
            if (p.goalAmount == 0) revert GoalRequired();
        } else if (p.goalAmount == 0 || p.goalAmount > reserved) {
            if (p.goalAmount == 0) revert GoalRequired();
            revert GoalTooLarge();
        }
        _checkChain(p.predecessorId, p.chainMode, p.token);

        // A hold does not open a CFA stream, so it posts no deposit and no cushion.
        uint256 buffers = hold ? 0 : _pairBuffer(p.token, rate);
        uint256 cushion = hold ? 0 : uint256(uint96(rate)) * PROTECT_WINDOW;
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
            cushion: cushion,
            paused: false,
            remaining: 0,
            ran: 0
        });
        _ids.push(id);
        _trackRoot(p.token, id);
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
        if (_unsettled() >= MAX_FLOWS) revert TooManyFlows();
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
            cushion: 0,
            paused: false,
            remaining: 0,
            ran: 0
        });
        _children[p.parentId].push(id);
        _ids.push(id);
        _trackChild();
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
        if (_flows[rootId].paused) {
            _closeRoot(rootId);
            return;
        }
        if (flow.parentId != 0 && !_flows[rootId].active) {
            _flows[flow.parentId].childRate -= flow.rate;
            _dropOpen(_markSettled(id));
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
        bool goalHit = root.kind == FlowKind.FlowGoal && root.goalAmount != 0 && root.rate > 0 && block.timestamp > root.start
            && uint256(uint96(root.rate)) * (block.timestamp - root.start) >= root.goalAmount;
        if (block.timestamp < root.end && !_broken(rootId) && !_criticalSoon(root.token) && !goalHit) revert StillActive();
        _closeRoot(rootId);
    }

    function protect(address token) external nonReentrant {
        _protect(token);
    }

    /// @dev The extension calls these. A direct call from anyone else reverts.
    function hookProtect(address token) external {
        if (msg.sender != address(this)) revert NotSelf();
        _protect(token);
    }

    function hookSilence(uint256 id) external {
        if (msg.sender != address(this)) revert NotSelf();
        _silence(id);
    }

    function hookOpen(uint256 id, int96 rate) external {
        if (msg.sender != address(this)) revert NotSelf();
        _open(id, rate);
    }

    function hookOpenChildren(uint256 id, uint64 start, uint64 end) external {
        if (msg.sender != address(this)) revert NotSelf();
        _openChildren(id, start, end);
    }

    function hookRequireMargin(address token) external {
        if (msg.sender != address(this)) revert NotSelf();
        _requireMargin(token);
    }

    /// @dev These forward to the extension so this contract stays under the code-size limit.
    function pause(uint256) external { _delegate(); }
    function resume(uint256) external { _delegate(); }
    function topUp(uint256, uint256) external { _delegate(); }
    function release(uint256, uint256) external { _delegate(); }
    function recoverSurplus(address) external { _delegate(); }

    function balanceSheet(address) external returns (uint256 idle, uint256 held, uint256 streaming) {
        _delegate();
    }

    function progress(uint256) external returns (uint256 saved, uint256 target, uint64 end, bool holding) {
        _delegate();
    }

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
        // An ended stream does not stop itself. Close it before this one starts,
        // or both outflow rates run against the same cushion.
        _protect(_flows[id].token);
        Flow storage root = _flows[id];
        uint64 start = uint64(block.timestamp);
        uint64 end = start + root.duration;
        root.active = true;
        root.start = start;
        root.end = end;
        root.paused = false;
        activeCount[root.token] += 1;
        // A saving goal keeps the deposit in the vault. No CFA stream, no liquidation.
        if (root.kind == FlowKind.SavingGoal) {
            root.liveRate = 0;
            _requireMargin(root.token);
            emit FlowActivated(id, start, end);
            return;
        }
        root.liveRate = root.rate - root.childRate;
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
            if (child.kind == FlowKind.SavingGoal) {
                child.liveRate = 0;
                continue;
            }
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
        address conduit = _spawnConduit(flow.token);
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

    function _spawnConduit(address token) internal returns (address conduit) {
        address beacon = IVaultFactory(factory).conduitBeacon();
        if (beacon != address(0)) {
            conduit = address(new BeaconProxy(beacon, abi.encodeCall(FlowConduit.initialize, (address(this), token))));
        } else {
            conduit = Clones.clone(conduitImplementation);
            FlowConduit(conduit).initialize(address(this), token);
        }
    }

    function _closeRoot(uint256 id) internal {
        Flow storage root = _flows[id];
        if (root.createdAt == 0 || root.parentId != 0) revert NotRoot();
        if (root.settled) revert NotActive();
        address token = root.token;
        bool wasActive = root.active;
        uint256 unstreamed;
        uint64 ranFor;
        if (root.paused) {
            ranFor = root.duration - root.remaining;
            unstreamed = _outflowRate(id) * root.remaining + _heldReserve(id);
            root.paused = false;
        } else if (wasActive && root.kind != FlowKind.SavingGoal) {
            uint256 elapsed = block.timestamp >= root.end ? root.duration : block.timestamp - root.start;
            ranFor = uint64(elapsed);
            uint256 streamed = _outflowRate(id) * elapsed;
            unstreamed = root.reserved > streamed ? root.reserved - streamed : 0;
        } else if (wasActive) {
            unstreamed = root.reserved;
            ranFor = block.timestamp >= root.end ? root.duration : uint64(block.timestamp - root.start);
        } else {
            unstreamed = root.reserved;
        }
        root.ran = ranFor;
        uint256 cushion = root.cushion;
        uint256 buffers = root.buffers;
        root.settled = true;
        root.active = false;
        root.liveRate = 0;
        if (wasActive) activeCount[token] -= 1;

        uint256 beforeBal = ISuperTokenMini(token).balanceOf(address(this));
        uint256 closed = _shutTree(id);
        uint256 gained = ISuperTokenMini(token).balanceOf(address(this)) - beforeBal;
        if (wasActive) unallocated[token] += unstreamed + cushion + gained;
        else unallocated[token] += unstreamed + cushion + buffers;
        _dropOpen(closed);
        _untrackRoot(token, id);
        _clampIdle(token);
        emit FlowSettled(id, unallocated[token]);
    }

    function _silence(uint256 id) internal {
        _shut(id);
        uint256 n = _children[id].length;
        for (uint256 i; i < n; ++i) {
            uint256 childId = _children[id][i];
            Flow storage child = _flows[childId];
            if (child.settled) continue;
            child.active = false;
            child.liveRate = 0;
            _silence(childId);
        }
    }

    function _unsettled() internal view returns (uint256) {
        return openCount;
    }

    function _shutTree(uint256 id) internal returns (uint256 n) {
        _shut(id);
        n = 1;
        uint256 children = _children[id].length;
        for (uint256 i; i < children; ++i) {
            uint256 childId = _children[id][i];
            if (_flows[childId].settled) continue;
            _flows[childId].settled = true;
            _flows[childId].active = false;
            _flows[childId].liveRate = 0;
            n += _shutTree(childId);
        }
    }

    function _shut(uint256 id) internal {
        Flow storage flow = _flows[id];
        if (flow.conduit == address(0)) return;
        cfa.setFlowrate(flow.token, flow.conduit, 0);
        FlowConduit(flow.conduit).close();
        flow.conduit = address(0);
    }

    function _protect(address token) internal {
        _indexExisting();
        uint256[] storage roots = liveRoots[token];
        uint256 i;
        while (i < roots.length) {
            uint256 id = roots[i];
            Flow storage flow = _flows[id];
            if (flow.settled || !flow.active) {
                i++;
                continue;
            }
            if (block.timestamp >= flow.end || _broken(id)) {
                _closeRoot(id);
                continue;
            }
            i++;
        }
        i = 0;
        while (activeCount[token] != 0 && _criticalSoon(token) && i < roots.length) {
            uint256 id = roots[i];
            Flow storage flow = _flows[id];
            if (flow.active && !flow.settled) {
                _closeRoot(id);
                continue;
            }
            i++;
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
        if (flow.settled || flow.active || flow.paused) return false;
        if (flow.keeperGated && !flow.triggered) return false;
        if (flow.earliestStart != 0 && block.timestamp < flow.earliestStart) return false;
        if (flow.chainMode == ChainMode.None) return true;
        Flow storage pred = _flows[flow.predecessorId];
        if (flow.chainMode == ChainMode.OnEnd) {
            return pred.settled || (pred.active && block.timestamp >= pred.end);
        }
        if (pred.rate == 0 || pred.goalAmount == 0) return false;
        uint256 elapsed;
        if (pred.active) elapsed = block.timestamp - pred.start;
        else if (pred.settled) elapsed = pred.ran;
        else return false;
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

    function _markSettled(uint256 id) internal returns (uint256 n) {
        _flows[id].settled = true;
        _flows[id].liveRate = 0;
        n = 1;
        uint256 children = _children[id].length;
        for (uint256 i; i < children; ++i) {
            n += _markSettled(_children[id][i]);
        }
    }

    function _treeBuffers(uint256 id) internal view returns (uint256 total) {
        Flow storage flow = _flows[id];
        if (flow.settled || flow.kind == FlowKind.SavingGoal) return 0;
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
        uint256 bal = ISuperTokenMini(token).balanceOf(address(this));
        uint256 fees = protocolFees[token];
        unallocated[token] = bal > fees ? bal - fees : 0;
    }

    function _hasOpenRoot(address token) internal view returns (bool) {
        return liveRoots[token].length != 0;
    }
}

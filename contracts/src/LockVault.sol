// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ITokenAllowlist} from "./interfaces/ITokenAllowlist.sol";
import {ISuperTokenMini, ICFAv1Forwarder, ISETHMini} from "./interfaces/ISuperfluidMini.sol";
import {SuperTokenReceiver} from "./SuperTokenReceiver.sol";
import {YieldPayer} from "./YieldPayer.sol";

/// @title LockVault
/// @notice Time-locked savings. Breaking a lock early pays a penalty (3% by default)
///         into a bonus pool. Savers who hold until maturity split that pool by
///         weight (principal × duration) among locks still open at completion.
/// @dev Optional yield is a real CFA stream from {YieldPayer} to the saver, funded
///      by a separate yield budget. The payer holds only that budget, so a reward
///      stream cannot spend locked principal. It is not lending. Streamed yield is
///      already in the saver's wallet, so an early break cannot claw it back.
///      The penalty is copied onto the lock. A later admin change does not apply.
///      The admin cannot withdraw principal, penalties, or the yield budget.
contract LockVault is Initializable, Ownable2Step, UUPSUpgradeable, ReentrancyGuard, SuperTokenReceiver {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_PENALTY_BPS = 1_000;
    uint64 public constant MIN_DURATION = 1 hours;
    uint64 public constant MAX_DURATION = 30 * 365 days;
    uint256 public constant PROTECT_WINDOW = 1 hours;
    uint64 public constant UPGRADE_DELAY = 2 days;

    ITokenAllowlist public immutable allowlist;
    address public immutable host;
    ICFAv1Forwarder public immutable cfa;

    struct Lock {
        address owner;
        address token;
        uint128 principal;
        uint64 start;
        uint64 end;
        uint256 weight;
        int96 yieldRate;
        bool settled;
        /// @dev Penalty copied at creation. A later admin change does not apply.
        uint16 lockedPenaltyBps;
        bytes32 name;
        uint128 targetAmount;
        /// @dev Yield wei per second per 1e18 of principal, copied at creation.
        uint256 yieldPerWei;
    }

    uint16 public penaltyBps = 300;
    uint256 public nextId = 1;

    mapping(uint256 id => Lock lock) public locks;
    mapping(address user => uint256[] ids) private _locksOf;
    mapping(address token => uint256 amount) public bonusPool;
    mapping(address token => uint256 weight) public totalWeight;
    mapping(address token => uint256 amount) public principalHeld;
    mapping(address token => uint256 amount) public yieldBudget;
    mapping(address token => uint256 rate) public yieldPerTokenPerSecond;
    mapping(address token => mapping(address user => int96 rate)) public yieldFlow;
    mapping(address token => int96 rate) public totalYieldFlow;
    mapping(address token => uint64 timestamp) public lastYieldSync;
    mapping(address token => address[] users) private _yieldUsers;

    /// @notice Reward streams leave from here. Locked principal stays in this contract.
    YieldPayer public yieldPayer;
    address public pendingImplementation;
    uint64 public upgradeReadyAt;
    mapping(address token => uint256 amount) public protocolFees;

    event Locked(uint256 indexed id, address indexed owner, address indexed token, uint256 principal, uint64 end, int96 yieldRate);
    event ProtocolFeeCharged(address indexed token, uint256 amount);
    event ProtocolFeeWithdrawn(address indexed token, address indexed to, uint256 amount);
    event Broken(uint256 indexed id, uint256 payout, uint256 penalty);
    event Matured(uint256 indexed id, uint256 principal, uint256 bonus);
    event YieldFunded(address indexed token, uint256 amount);
    event YieldRateSet(address indexed token, uint256 perTokenPerSecond);
    event PenaltySet(uint16 bps);

    error ZeroAddress();
    error ZeroAmount();
    error TokenNotAllowed();
    error Paused();
    error BadDuration();
    error BadAmount();
    error NotLock();
    error Mature();
    error StillLocked();
    error PenaltyTooHigh();
    error InsufficientYield();
    error WrongTokenKind();
    error UpgradeNotReady();

    constructor(address initialOwner, address allowlist_, address host_, address cfa_) Ownable(initialOwner) {
        if (allowlist_ == address(0) || host_ == address(0) || cfa_ == address(0)) revert ZeroAddress();
        allowlist = ITokenAllowlist(allowlist_);
        host = host_;
        cfa = ICFAv1Forwarder(cfa_);
        yieldPayer = new YieldPayer(address(this), cfa_);
        _registerSuperTokenReceiver();
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        if (initialOwner == address(0)) revert ZeroAddress();
        _transferOwnership(initialOwner);
        if (penaltyBps == 0) penaltyBps = 300;
        if (nextId == 0) nextId = 1;
        yieldPayer = new YieldPayer(address(this), address(cfa));
        _registerSuperTokenReceiver();
    }

    function contractVersion() public pure virtual returns (uint256) {
        return 3;
    }

    /// @notice Schedule an upgrade. It can be executed after two days. Savers can still exit.
    function scheduleUpgrade(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert ZeroAddress();
        pendingImplementation = newImplementation;
        upgradeReadyAt = uint64(block.timestamp) + UPGRADE_DELAY;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        if (newImplementation != pendingImplementation || block.timestamp < upgradeReadyAt) revert UpgradeNotReady();
    }

    function setPenaltyBps(uint16 bps) external onlyOwner {
        if (bps > MAX_PENALTY_BPS) revert PenaltyTooHigh();
        penaltyBps = bps;
        emit PenaltySet(bps);
    }

    /// @notice Wei of super token streamed per second for each 1e18 of principal.
    ///         Applies to new locks. Existing streams keep the rate they opened at.
    function setYieldPerTokenPerSecond(address token, uint256 perSecond) external onlyOwner {
        if (!allowlist.isAllowed(token)) revert TokenNotAllowed();
        yieldPerTokenPerSecond[token] = perSecond;
        emit YieldRateSet(token, perSecond);
    }

    function fundYield(address token, uint256 amount) external nonReentrant {
        if (!allowlist.isAllowed(token)) revert TokenNotAllowed();
        if (amount == 0) revert ZeroAmount();
        _sync(token);
        uint256 got = _pull(token, amount);
        ISuperTokenMini(token).transfer(address(yieldPayer), got);
        yieldBudget[token] += got;
        emit YieldFunded(token, got);
        _resumeYield(token);
    }

    function fundYieldUnderlying(address token, uint256 underlyingAmount) external nonReentrant {
        if (!allowlist.isAllowed(token)) revert TokenNotAllowed();
        if (allowlist.kindOf(token) != ITokenAllowlist.TokenKind.Wrapper) revert WrongTokenKind();
        _sync(token);
        uint256 minted = _upgrade(token, underlyingAmount);
        ISuperTokenMini(token).transfer(address(yieldPayer), minted);
        yieldBudget[token] += minted;
        emit YieldFunded(token, minted);
        _resumeYield(token);
    }

    function lock(address token, uint128 amount, uint64 duration, bool earnYield) external nonReentrant returns (uint256 id) {
        if (!allowlist.isAllowed(token)) revert TokenNotAllowed();
        id = _lock(token, _pull(token, amount), duration, earnYield, bytes32(0), 0);
    }

    /// @notice Lock toward a named target. `target` may be larger than `amount`. Top up later.
    function lockGoal(address token, uint128 amount, uint64 duration, bool earnYield, bytes32 name, uint128 target)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (!allowlist.isAllowed(token)) revert TokenNotAllowed();
        id = _lock(token, _pull(token, amount), duration, earnYield, name, target);
    }

    function lockUnderlying(address token, uint256 underlyingAmount, uint64 duration, bool earnYield)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (allowlist.kindOf(token) != ITokenAllowlist.TokenKind.Wrapper) revert WrongTokenKind();
        uint256 minted = _upgrade(token, underlyingAmount);
        uint256 fee = (minted * 30) / 10_000;
        if (fee != 0 && fee < minted) {
            protocolFees[token] += fee;
            emit ProtocolFeeCharged(token, fee);
            minted -= fee;
        }
        if (minted > type(uint128).max) revert BadAmount();
        id = _lock(token, minted, duration, earnYield, bytes32(0), 0);
    }

    /// @notice Add principal to an open lock. The end date stays. Weight added is the new
    ///         amount times the time still left.
    function topUp(uint256 id, uint128 amount) external nonReentrant returns (uint256 principal) {
        Lock storage entry = locks[id];
        if (entry.settled || entry.owner != msg.sender) revert NotLock();
        if (block.timestamp >= entry.end) revert Mature();
        address token = entry.token;
        uint256 got = _pull(token, amount);
        _sync(token);
        uint256 remaining = entry.end - block.timestamp;
        entry.principal += uint128(got);
        entry.weight += got * remaining;
        totalWeight[token] += got * remaining;
        principalHeld[token] += got;
        if (entry.targetAmount < entry.principal) entry.targetAmount = entry.principal;
        if (entry.yieldRate > 0) {
            int96 extra = int96(int256(Math.mulDiv(got, _yieldPerWei(entry), 1e18)));
            if (extra > 0) {
                entry.yieldRate += extra;
                _setUserFlow(token, msg.sender, yieldFlow[token][msg.sender] + extra);
                if (_yieldDanger(token) || _criticalSoon(token)) revert InsufficientYield();
            }
        }
        principal = entry.principal;
    }

    /// @notice Take part of the principal out early. The penalty is the rate copied onto
    ///         this lock, applied only to the amount taken.
    function withdrawPartial(uint256 id, uint128 amount) external nonReentrant returns (uint256 payout, uint256 penalty) {
        Lock storage entry = locks[id];
        if (entry.settled || entry.owner != msg.sender) revert NotLock();
        if (block.timestamp >= entry.end) revert Mature();
        if (amount == 0 || amount >= entry.principal) revert BadAmount();
        address token = entry.token;
        _sync(token);
        penalty = Math.mulDiv(amount, entry.lockedPenaltyBps, BPS);
        payout = uint256(amount) - penalty;
        uint256 nextPrincipal = uint256(entry.principal) - amount;
        uint256 nextWeight = Math.mulDiv(entry.weight, nextPrincipal, entry.principal);
        totalWeight[token] = totalWeight[token] - entry.weight + nextWeight;
        principalHeld[token] -= amount;
        if (entry.yieldRate > 0) {
            int96 cut = int96(int256(Math.mulDiv(uint256(uint96(entry.yieldRate)), amount, entry.principal)));
            if (cut > 0) _reduceYield(token, msg.sender, cut);
            entry.yieldRate -= cut;
        }
        entry.weight = nextWeight;
        entry.principal = uint128(nextPrincipal);
        bonusPool[token] += penalty;
        ISuperTokenMini(token).transfer(msg.sender, payout);
        _requirePrincipalSafe(token);
        emit Broken(id, payout, penalty);
    }

    function breakEarly(uint256 id) external nonReentrant returns (uint256 payout, uint256 penalty) {
        Lock storage entry = locks[id];
        if (entry.settled || entry.owner != msg.sender) revert NotLock();
        if (block.timestamp >= entry.end) revert Mature();
        address token = entry.token;
        _sync(token);
        if (entry.yieldRate > 0) _reduceYield(token, msg.sender, entry.yieldRate);

        penalty = Math.mulDiv(entry.principal, entry.lockedPenaltyBps, BPS);
        payout = uint256(entry.principal) - penalty;
        totalWeight[token] -= entry.weight;
        principalHeld[token] -= entry.principal;
        bonusPool[token] += penalty;
        entry.settled = true;
        entry.yieldRate = 0;

        ISuperTokenMini(token).transfer(msg.sender, payout);
        _requirePrincipalSafe(token);
        emit Broken(id, payout, penalty);
    }

    function withdrawMature(uint256 id) external nonReentrant returns (uint256 payout, uint256 bonus) {
        Lock storage entry = locks[id];
        if (entry.settled || entry.owner != msg.sender) revert NotLock();
        if (block.timestamp < entry.end) revert StillLocked();
        address token = entry.token;
        _sync(token);
        if (entry.yieldRate > 0) _reduceYield(token, msg.sender, entry.yieldRate);

        uint256 weight = entry.weight;
        uint256 tw = totalWeight[token];
        if (tw > 0 && bonusPool[token] > 0) {
            bonus = Math.mulDiv(bonusPool[token], weight, tw);
            bonusPool[token] -= bonus;
        }
        totalWeight[token] -= weight;
        principalHeld[token] -= entry.principal;
        payout = uint256(entry.principal) + bonus;
        entry.settled = true;
        entry.yieldRate = 0;

        ISuperTokenMini(token).transfer(msg.sender, payout);
        _requirePrincipalSafe(token);
        emit Matured(id, entry.principal, bonus);
    }

    /// @notice Close yield streams before they can spend principal. Anyone may call.
    function protect(address token) external nonReentrant {
        _sync(token);
        if (_yieldDanger(token)) _closeYield(token);
    }

    function protectUser(address token, address user) external nonReentrant {
        _sync(token);
        if (_yieldDanger(token)) _setUserFlow(token, user, 0);
    }

    /// @notice Open reward streams again after the budget can cover them.
    function resumeYield(address token) external nonReentrant {
        _sync(token);
        _resumeYield(token);
    }

    /// @notice Owner withdraws reward tokens the live streams do not need.
    ///         Locked principal and the bonus pool stay in this contract.
    function withdrawUnusedYield(address token, address to) external nonReentrant onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        _sync(token);
        uint256 reserve;
        if (totalYieldFlow[token] > 0) {
            uint256 deposit = cfa.getBufferAmountByFlowrate(token, totalYieldFlow[token]);
            reserve = deposit + uint256(uint96(totalYieldFlow[token])) * PROTECT_WINDOW;
        }
        uint256 budget = yieldBudget[token];
        if (budget <= reserve) revert ZeroAmount();
        uint256 amount = budget - reserve;
        uint256 liquid = yieldPayer.balance(token);
        if (amount > liquid) amount = liquid;
        if (amount == 0) revert ZeroAmount();
        yieldBudget[token] -= amount;
        yieldPayer.returnTokens(token, to, amount);
    }

    function locksOf(address user) external view returns (uint256[] memory) {
        return _locksOf[user];
    }

    function previewBreak(uint256 id) external view returns (uint256 payout, uint256 penalty) {
        Lock storage entry = locks[id];
        if (entry.settled) return (0, 0);
        penalty = Math.mulDiv(entry.principal, entry.lockedPenaltyBps, BPS);
        payout = uint256(entry.principal) - penalty;
    }

    /// @notice Principal, target, end, and what an early exit of the full lock returns today.
    function progressOf(uint256 id)
        external
        view
        returns (uint128 principal, uint128 target, uint64 end, uint256 breakPayout, uint256 penalty, bytes32 name)
    {
        Lock storage entry = locks[id];
        principal = entry.principal;
        target = entry.targetAmount;
        end = entry.end;
        name = entry.name;
        if (entry.settled) return (principal, target, end, 0, 0, name);
        penalty = Math.mulDiv(entry.principal, entry.lockedPenaltyBps, BPS);
        breakPayout = uint256(entry.principal) - penalty;
    }

    function previewMature(uint256 id) external view returns (uint256 principal, uint256 bonus) {
        Lock storage entry = locks[id];
        if (entry.settled) return (0, 0);
        principal = entry.principal;
        uint256 tw = totalWeight[entry.token];
        if (tw > 0 && bonusPool[entry.token] > 0) {
            bonus = Math.mulDiv(bonusPool[entry.token], entry.weight, tw);
        }
    }

    function _lock(address token, uint256 received, uint64 duration, bool earnYield, bytes32 name, uint128 target)
        internal
        returns (uint256 id)
    {
        if (!allowlist.isAllowed(token)) revert TokenNotAllowed();
        if (allowlist.paused()) revert Paused();
        if (received == 0) revert ZeroAmount();
        if (received > type(uint128).max) revert BadAmount();
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert BadDuration();
        _sync(token);

        int96 yieldRate;
        if (earnYield) {
            yieldRate = int96(int256(Math.mulDiv(received, yieldPerTokenPerSecond[token], 1e18)));
            if (yieldRate <= 0) revert InsufficientYield();
        }

        uint256 weight = received * uint256(duration);
        uint128 goal = target == 0 || target < received ? uint128(received) : target;
        id = nextId++;
        uint64 start = uint64(block.timestamp);
        locks[id] = Lock({
            owner: msg.sender,
            token: token,
            principal: uint128(received),
            start: start,
            end: start + duration,
            weight: weight,
            yieldRate: yieldRate,
            settled: false,
            lockedPenaltyBps: penaltyBps,
            name: name,
            targetAmount: goal,
            yieldPerWei: earnYield ? yieldPerTokenPerSecond[token] : 0
        });
        _locksOf[msg.sender].push(id);
        totalWeight[token] += weight;
        principalHeld[token] += received;

        if (yieldRate > 0) {
            if (yieldFlow[token][msg.sender] == 0) _yieldUsers[token].push(msg.sender);
            _setUserFlow(token, msg.sender, yieldFlow[token][msg.sender] + yieldRate);
            if (_yieldDanger(token) || _criticalSoon(token)) revert InsufficientYield();
        }
        emit Locked(id, msg.sender, token, received, start + duration, yieldRate);
    }

    function _yieldPerWei(Lock storage entry) internal view returns (uint256 per) {
        per = entry.yieldPerWei;
        if (per == 0 && entry.principal > 0 && entry.yieldRate > 0) {
            per = (uint256(uint96(entry.yieldRate)) * 1e18) / entry.principal;
        }
    }

    function _resumeYield(address token) internal {
        if (totalYieldFlow[token] > 0 && _yieldDanger(token)) return;
        address[] storage users = _yieldUsers[token];
        uint256 n = users.length;
        for (uint256 i; i < n; ++i) {
            address user = users[i];
            int96 rate = _lockedYield(token, user);
            if (rate == 0 || yieldFlow[token][user] == rate) continue;
            _setUserFlow(token, user, rate);
            if (_yieldDanger(token) || _criticalSoon(token)) {
                _setUserFlow(token, user, 0);
                return;
            }
        }
    }

    function _lockedYield(address token, address user) internal view returns (int96 rate) {
        uint256[] storage ids = _locksOf[user];
        uint256 n = ids.length;
        for (uint256 i; i < n; ++i) {
            Lock storage entry = locks[ids[i]];
            if (entry.settled || entry.token != token || entry.yieldRate <= 0 || block.timestamp >= entry.end) continue;
            rate += entry.yieldRate;
        }
    }

    function _reduceYield(address token, address user, int96 amount) internal {
        int96 current = yieldFlow[token][user];
        _setUserFlow(token, user, current > amount ? current - amount : int96(0));
    }

    function _setUserFlow(address token, address user, int96 newRate) internal {
        if (newRate < 0) newRate = 0;
        int96 previous = yieldFlow[token][user];
        yieldFlow[token][user] = newRate;
        totalYieldFlow[token] = totalYieldFlow[token] - previous + newRate;
        yieldPayer.setFlow(token, user, newRate);
    }

    function _closeYield(address token) internal {
        address[] storage users = _yieldUsers[token];
        uint256 n = users.length;
        for (uint256 i; i < n; ++i) {
            if (yieldFlow[token][users[i]] > 0) _setUserFlow(token, users[i], 0);
        }
    }

    function _sync(address token) internal {
        uint64 nowT = uint64(block.timestamp);
        uint64 prev = lastYieldSync[token];
        if (prev == 0) {
            lastYieldSync[token] = nowT;
            return;
        }
        uint256 elapsed = nowT - prev;
        lastYieldSync[token] = nowT;
        if (elapsed == 0 || totalYieldFlow[token] <= 0) return;
        uint256 spent = uint256(uint96(totalYieldFlow[token])) * elapsed;
        if (spent > yieldBudget[token]) spent = yieldBudget[token];
        yieldBudget[token] -= spent;
        if (_yieldDanger(token)) _closeYield(token);
    }

    function _yieldDanger(address token) internal view returns (bool) {
        if (totalYieldFlow[token] <= 0) return false;
        uint256 deposit = cfa.getBufferAmountByFlowrate(token, totalYieldFlow[token]);
        uint256 need = deposit + uint256(uint96(totalYieldFlow[token])) * PROTECT_WINDOW;
        return yieldBudget[token] < need;
    }

    function _criticalSoon(address token) internal view returns (bool) {
        return ISuperTokenMini(token).isAccountCritical(address(yieldPayer), block.timestamp + PROTECT_WINDOW);
    }

    /// @dev Available balance must still cover principal and the bonus pool after the
    ///      protocol deposit. Yield may be streamed. Principal may not.
    function _requirePrincipalSafe(address token) internal view {
        (int256 available, uint256 deposit,,) = ISuperTokenMini(token).realtimeBalanceOfNow(address(this));
        if (available < 0) revert InsufficientYield();
        uint256 owned = uint256(available) + deposit;
        if (owned < principalHeld[token] + bonusPool[token]) revert InsufficientYield();
    }

    function withdrawProtocolFees(address token, address to) external nonReentrant onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = protocolFees[token];
        if (amount == 0) revert ZeroAmount();
        protocolFees[token] = 0;
        ISuperTokenMini(token).transfer(to, amount);
        _requirePrincipalSafe(token);
        emit ProtocolFeeWithdrawn(token, to, amount);
    }

    function _pull(address token, uint256 amount) internal returns (uint256 got) {
        if (amount == 0) revert ZeroAmount();
        uint256 fee = (amount * 30) / 10_000;
        uint256 beforeBal = ISuperTokenMini(token).balanceOf(address(this));
        ISuperTokenMini(token).transferFrom(msg.sender, address(this), amount + fee);
        uint256 received = ISuperTokenMini(token).balanceOf(address(this)) - beforeBal;
        if (received < amount) revert ZeroAmount();
        uint256 skim = received - amount;
        if (skim > fee) skim = fee;
        if (skim != 0) {
            protocolFees[token] += skim;
            emit ProtocolFeeCharged(token, skim);
        }
        got = received - skim;
    }

    function _upgrade(address token, uint256 underlyingAmount) internal returns (uint256 minted) {
        uint8 decimals = allowlist.underlyingDecimalsOf(token);
        uint256 superAmount = underlyingAmount * (10 ** (18 - decimals));
        (uint256 pullAmount, uint256 adjusted) = ISuperTokenMini(token).toUnderlyingAmount(superAmount);
        if (adjusted == 0 || pullAmount == 0) revert BadAmount();
        address underlying = allowlist.underlyingOf(token);
        IERC20(underlying).safeTransferFrom(msg.sender, address(this), pullAmount);
        IERC20(underlying).forceApprove(address(token), pullAmount);
        uint256 beforeBal = ISuperTokenMini(token).balanceOf(address(this));
        ISuperTokenMini(token).upgrade(superAmount);
        minted = ISuperTokenMini(token).balanceOf(address(this)) - beforeBal;
        if (minted == 0) revert ZeroAmount();
    }
}

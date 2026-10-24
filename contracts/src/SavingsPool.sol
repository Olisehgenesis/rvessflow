// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ITokenAllowlist} from "./interfaces/ITokenAllowlist.sol";
import {ISuperTokenMini} from "./interfaces/ISuperfluidMini.sol";
import {SuperTokenReceiver} from "./SuperTokenReceiver.sol";

/// @title SavingsPool
/// @notice A savings club or a joint goal. Members keep their own shares.
///         Nobody takes a turn. Loans are drawn from the cash, interest and
///         fines return to the pool, and a reserve stays liquid.
/// @dev Names, ID status, next of kin, group descriptions, and milestone labels
///      are not stored here. The 0.30% protocol fee is pulled on deposits only.
///      A group admin can waive a fine or unpaid interest. The waiver is capped
///      unless a second admin confirms it. An admin cannot waive principal or
///      the protocol fee, and cannot withdraw another member's shares.
contract SavingsPool is Ownable2Step, ReentrancyGuard, SuperTokenReceiver {
    uint16 public constant BPS = 10_000;
    uint16 public constant PROTOCOL_FEE_BPS = 30;
    uint16 public constant MAX_MEMBERS = 50;
    uint16 public constant MAX_LOANS = 64;
    uint16 public constant MAX_INTEREST_BPS = 3_000;
    uint16 public constant MAX_MULTIPLE_BPS = 30_000;
    uint16 public constant MAX_RESERVE_BPS = 5_000;
    uint64 public constant MIN_PERIOD = 1 hours;
    uint64 public constant MAX_PERIOD = 366 days;

    enum Kind {
        Club,
        Joint
    }
    enum PledgeMode {
        Fixed,
        Individual
    }
    enum ReleaseRule {
        Unanimous,
        Treasurer
    }
    enum WaiverKind {
        None,
        Fine,
        Interest
    }

    struct CreateParams {
        address token;
        Kind kind;
        PledgeMode pledgeMode;
        ReleaseRule releaseRule;
        address beneficiary;
        address treasurer;
        uint128 fixedPledge;
        uint128 lateFine;
        uint128 waiveCap;
        uint128 twoAdminAt;
        uint16 loanMultipleBps;
        uint16 interestBps;
        uint16 reserveBps;
        uint64 period;
        uint64 loanTerm;
        uint256 target;
    }

    struct Pool {
        address creator;
        address token;
        address beneficiary;
        address treasurer;
        Kind kind;
        PledgeMode pledgeMode;
        ReleaseRule releaseRule;
        uint128 fixedPledge;
        uint128 lateFine;
        uint128 waiveCap;
        uint128 twoAdminAt;
        uint16 loanMultipleBps;
        uint16 interestBps;
        uint16 reserveBps;
        uint64 period;
        uint64 loanTerm;
        uint256 target;
        uint256 shareTotal;
        uint256 profit;
        uint256 loanPrincipal;
        uint256 held;
        uint16 memberCount;
        bool closed;
        bool released;
        bool refundOpen;
        bool profitShared;
    }

    struct Seat {
        address account;
        uint256 shares;
        uint256 locked;
        uint128 pledge;
        uint256 fine;
        uint256 paidThisPeriod;
        uint64 nextDue;
        bool spendConsent;
        bool cancelConsent;
    }

    struct Loan {
        address borrower;
        address guarantor;
        uint256 principal;
        uint256 principalLeft;
        uint256 outstanding;
        uint256 borrowerLocked;
        uint256 guarantorLocked;
        uint64 dueAt;
        uint8 approvals;
        bool drawn;
        bool closed;
        bool guarantorOk;
    }

    struct PendingWaiver {
        WaiverKind kind;
        uint16 seat;
        uint256 loanId;
        uint256 amount;
        address firstAdmin;
        bool open;
    }

    ITokenAllowlist public immutable allowlist;
    uint256 public nextId = 1;

    mapping(uint256 id => Pool pool) internal _pools;
    mapping(uint256 id => Seat[] seats) internal _seats;
    mapping(uint256 id => Loan[] loans) internal _loans;
    mapping(uint256 id => mapping(address account => uint256 indexPlusOne)) internal _index;
    mapping(uint256 id => mapping(address account => bool admin)) public groupAdmin;
    mapping(uint256 id => mapping(uint256 loanId => mapping(address admin => bool voted))) public loanVote;
    mapping(uint256 id => PendingWaiver waiver) public pendingWaiver;
    mapping(address token => uint256 amount) public protocolFees;

    event PoolCreated(uint256 indexed id, address indexed creator, address indexed token, Kind kind);
    event Deposited(uint256 indexed id, address indexed account, uint256 amount, uint256 fee);
    event Withdrawn(uint256 indexed id, address indexed account, uint256 amount);
    event LateMarked(uint256 indexed id, address indexed account, uint256 fine);
    event FinePaid(uint256 indexed id, address indexed account, uint256 amount);
    event Waived(uint256 indexed id, WaiverKind kind, uint256 ref, uint256 amount, address indexed first, address indexed second);
    event LoanProposed(uint256 indexed id, uint256 indexed loanId, address indexed borrower, uint256 principal);
    event LoanDrawn(uint256 indexed id, uint256 indexed loanId, address indexed borrower, uint256 principal, uint256 interest);
    event LoanRepaid(uint256 indexed id, uint256 indexed loanId, uint256 principal, uint256 interest);
    event ProfitShared(uint256 indexed id, uint256 profit);
    event PoolClosed(uint256 indexed id);
    event JointPaid(uint256 indexed id, address indexed beneficiary, uint256 amount);
    event ProtocolFeeCharged(address indexed token, uint256 amount);
    event ProtocolFeeWithdrawn(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error TokenNotAllowed();
    error Paused();
    error BadParams();
    error BadState();
    error NotAdmin();
    error NotMember();
    error NotBorrower();
    error TooEarly();
    error FeeOnTransfer();
    error NotProtocolAdmin();

    constructor(address allowlist_, address initialOwner) Ownable(initialOwner) {
        if (allowlist_ == address(0) || initialOwner == address(0)) revert ZeroAddress();
        allowlist = ITokenAllowlist(allowlist_);
        _registerSuperTokenReceiver();
    }

    function contractVersion() public pure returns (uint256) {
        return 1;
    }

    function createPool(CreateParams calldata p) external returns (uint256 id) {
        if (allowlist.paused()) revert Paused();
        if (!allowlist.isAllowed(p.token)) revert TokenNotAllowed();
        if (p.period < MIN_PERIOD || p.period > MAX_PERIOD) revert BadParams();
        if (p.reserveBps > MAX_RESERVE_BPS) revert BadParams();
        if (p.kind == Kind.Joint) {
            if (p.target == 0 || p.beneficiary == address(0)) revert BadParams();
            if (p.releaseRule == ReleaseRule.Treasurer && p.treasurer == address(0)) revert BadParams();
        } else {
            if (p.target != 0 || p.beneficiary != address(0)) revert BadParams();
            if (p.loanMultipleBps < BPS || p.loanMultipleBps > MAX_MULTIPLE_BPS) revert BadParams();
            if (p.interestBps > MAX_INTEREST_BPS) revert BadParams();
            if (p.loanTerm < MIN_PERIOD || p.loanTerm > MAX_PERIOD) revert BadParams();
        }
        if (p.pledgeMode == PledgeMode.Fixed && p.fixedPledge == 0) revert BadParams();
        if (p.pledgeMode == PledgeMode.Individual && p.fixedPledge != 0) revert BadParams();

        id = nextId++;
        Pool storage pool = _pools[id];
        pool.creator = msg.sender;
        pool.token = p.token;
        pool.beneficiary = p.beneficiary;
        pool.treasurer = p.treasurer;
        pool.kind = p.kind;
        pool.pledgeMode = p.pledgeMode;
        pool.releaseRule = p.releaseRule;
        pool.fixedPledge = p.fixedPledge;
        pool.lateFine = p.lateFine;
        pool.waiveCap = p.waiveCap;
        pool.twoAdminAt = p.twoAdminAt;
        pool.loanMultipleBps = p.loanMultipleBps;
        pool.interestBps = p.interestBps;
        pool.reserveBps = p.reserveBps;
        pool.period = p.period;
        pool.loanTerm = p.loanTerm;
        pool.target = p.target;
        _seatIn(id, msg.sender);
        emit PoolCreated(id, msg.sender, p.token, p.kind);
    }

    function addMember(uint256 id, address account) external {
        Pool storage pool = _live(id);
        if (allowlist.paused()) revert Paused();
        if (!_admin(id, msg.sender)) revert NotAdmin();
        if (account == address(0) || _index[id][account] != 0) revert BadParams();
        if (pool.memberCount >= MAX_MEMBERS) revert BadParams();
        _seatIn(id, account);
    }

    function addAdmin(uint256 id, address account) external {
        _live(id);
        if (!_admin(id, msg.sender)) revert NotAdmin();
        if (_index[id][account] == 0 || account == _pools[id].creator) revert BadParams();
        groupAdmin[id][account] = true;
    }

    function setPledge(uint256 id, uint128 amount) external {
        Pool storage pool = _live(id);
        if (pool.pledgeMode != PledgeMode.Individual || amount == 0) revert BadParams();
        Seat storage seat = _seatOf(id, msg.sender);
        if (amount <= seat.pledge) revert BadParams();
        seat.pledge = amount;
    }

    /// @notice An admin sets a member's pledge. This is the only way to lower one.
    function setPledgeFor(uint256 id, address account, uint128 amount) external {
        Pool storage pool = _live(id);
        if (!_admin(id, msg.sender) || pool.pledgeMode != PledgeMode.Individual || amount == 0) revert BadParams();
        _seatOf(id, account).pledge = amount;
    }

    function deposit(uint256 id, uint256 amount) external nonReentrant {
        Pool storage pool = _live(id);
        if (allowlist.paused()) revert Paused();
        if (amount == 0) revert ZeroAmount();
        Seat storage seat = _seatOf(id, msg.sender);
        uint256 fee = (amount * PROTOCOL_FEE_BPS) / BPS;
        _pull(pool.token, amount + fee);
        if (fee != 0) {
            protocolFees[pool.token] += fee;
            emit ProtocolFeeCharged(pool.token, fee);
        }
        seat.shares += amount;
        seat.paidThisPeriod += amount;
        pool.shareTotal += amount;
        pool.held += amount;
        _advance(pool, seat);
        emit Deposited(id, msg.sender, amount, fee);
    }

    function markLate(uint256 id, address account) external {
        Pool storage pool = _live(id);
        Seat storage seat = _seatOf(id, account);
        uint256 owed = _owed(pool, seat);
        if (owed == 0 || block.timestamp < seat.nextDue || seat.paidThisPeriod >= owed) revert TooEarly();
        seat.fine += pool.lateFine;
        seat.paidThisPeriod = 0;
        seat.nextDue += pool.period;
        emit LateMarked(id, account, pool.lateFine);
    }

    function payFine(uint256 id, uint256 amount) external nonReentrant {
        Pool storage pool = _openBooks(id);
        if (amount == 0) revert ZeroAmount();
        Seat storage seat = _seatOf(id, msg.sender);
        if (amount > seat.fine) revert BadParams();
        _pull(pool.token, amount);
        seat.fine -= amount;
        pool.profit += amount;
        pool.held += amount;
        emit FinePaid(id, msg.sender, amount);
    }

    /// @notice Waive a fine (`kind` Fine, `ref` is the seat) or unpaid interest
    ///         (`kind` Interest, `ref` is the loan). Above `waiveCap`, a second admin repeats the call.
    function waive(uint256 id, WaiverKind kind, uint256 ref, uint256 amount) external {
        _openBooks(id);
        if (!_admin(id, msg.sender) || kind == WaiverKind.None || amount == 0) revert BadParams();
        _checkWaiver(id, kind, ref, amount);
        PendingWaiver storage pending = pendingWaiver[id];
        if (amount <= _pools[id].waiveCap) {
            _applyWaiver(id, kind, ref, amount, msg.sender, msg.sender);
            return;
        }
        if (!pending.open) {
            pending.open = true;
            pending.kind = kind;
            pending.seat = uint16(ref);
            pending.loanId = ref;
            pending.amount = amount;
            pending.firstAdmin = msg.sender;
            return;
        }
        if (
            pending.kind != kind || pending.amount != amount || pending.firstAdmin == msg.sender
                || (kind == WaiverKind.Fine ? pending.seat != ref : pending.loanId != ref)
        ) revert BadState();
        address first = pending.firstAdmin;
        delete pendingWaiver[id];
        _applyWaiver(id, kind, ref, amount, first, msg.sender);
    }

    function withdraw(uint256 id, uint256 amount) external nonReentrant {
        Pool storage pool = _openBooks(id);
        if (amount == 0) revert ZeroAmount();
        if (pool.kind == Kind.Joint && !pool.refundOpen) revert BadState();
        Seat storage seat = _seatOf(id, msg.sender);
        if (amount > seat.shares - seat.locked) revert BadParams();
        uint256 sharesAfter = pool.shareTotal - amount;
        uint256 heldAfter = pool.held - amount;
        if (heldAfter < (sharesAfter * pool.reserveBps) / BPS) revert BadState();
        seat.shares -= amount;
        pool.shareTotal = sharesAfter;
        pool.held = heldAfter;
        ISuperTokenMini(pool.token).transfer(msg.sender, amount);
        emit Withdrawn(id, msg.sender, amount);
    }

    function proposeLoan(uint256 id, uint256 principal, address guarantor) external returns (uint256 loanId) {
        Pool storage pool = _live(id);
        if (pool.kind != Kind.Club || principal == 0) revert BadParams();
        if (_loans[id].length >= MAX_LOANS) revert BadParams();
        Seat storage borrower = _seatOf(id, msg.sender);
        uint256 freeShares = borrower.shares - borrower.locked;
        if (principal > (freeShares * pool.loanMultipleBps) / BPS) revert BadParams();
        uint256 gap = principal > freeShares ? principal - freeShares : 0;
        if (gap == 0) {
            if (guarantor != address(0)) revert BadParams();
        } else {
            if (guarantor == address(0) || guarantor == msg.sender) revert BadParams();
            Seat storage backer = _seatOf(id, guarantor);
            if (gap > backer.shares - backer.locked) revert BadParams();
        }
        loanId = _loans[id].length;
        _loans[id].push(
            Loan({
                borrower: msg.sender,
                guarantor: guarantor,
                principal: principal,
                principalLeft: principal,
                outstanding: principal + (principal * pool.interestBps) / BPS,
                borrowerLocked: 0,
                guarantorLocked: 0,
                dueAt: 0,
                approvals: 0,
                drawn: false,
                closed: false,
                guarantorOk: false
            })
        );
        emit LoanProposed(id, loanId, msg.sender, principal);
    }

    function approveLoan(uint256 id, uint256 loanId) external {
        _live(id);
        if (!_admin(id, msg.sender)) revert NotAdmin();
        Loan storage loan = _loan(id, loanId);
        if (loan.drawn || loan.closed || loanVote[id][loanId][msg.sender]) revert BadState();
        loanVote[id][loanId][msg.sender] = true;
        if (msg.sender == loan.borrower || msg.sender == loan.guarantor) revert BadState();
        loan.approvals += 1;
    }

    /// @notice The named guarantor agrees to lock the gap. Drawing does this only after this call.
    function consentGuarantee(uint256 id, uint256 loanId) external {
        _live(id);
        Loan storage loan = _loan(id, loanId);
        if (loan.drawn || loan.closed || msg.sender != loan.guarantor) revert BadState();
        loan.guarantorOk = true;
    }

    function drawLoan(uint256 id, uint256 loanId) external nonReentrant {
        Pool storage pool = _live(id);
        if (allowlist.paused()) revert Paused();
        Loan storage loan = _loan(id, loanId);
        if (loan.drawn || loan.closed || loan.borrower != msg.sender) revert NotBorrower();
        uint8 needed = loan.principal > pool.twoAdminAt ? 2 : 1;
        if (loan.approvals < needed) revert BadState();
        uint256 reserve = (pool.shareTotal * pool.reserveBps) / BPS;
        if (loan.principal > pool.held || pool.held - loan.principal < reserve) revert BadState();

        Seat storage borrower = _seatOf(id, msg.sender);
        uint256 freeShares = borrower.shares - borrower.locked;
        if (loan.principal > (freeShares * pool.loanMultipleBps) / BPS) revert BadState();
        uint256 fromBorrower = loan.principal > freeShares ? freeShares : loan.principal;
        uint256 gap = loan.principal - fromBorrower;
        borrower.locked += fromBorrower;
        loan.borrowerLocked = fromBorrower;
        if (gap != 0) {
            if (!loan.guarantorOk) revert BadState();
            Seat storage backer = _seatOf(id, loan.guarantor);
            if (gap > backer.shares - backer.locked) revert BadState();
            backer.locked += gap;
            loan.guarantorLocked = gap;
        }
        loan.drawn = true;
        loan.dueAt = uint64(block.timestamp) + pool.loanTerm;
        pool.loanPrincipal += loan.principal;
        pool.held -= loan.principal;
        ISuperTokenMini(pool.token).transfer(msg.sender, loan.principal);
        emit LoanDrawn(id, loanId, msg.sender, loan.principal, loan.outstanding - loan.principal);
    }

    function repay(uint256 id, uint256 loanId, uint256 amount) external nonReentrant {
        Pool storage pool = _openBooks(id);
        Loan storage loan = _loan(id, loanId);
        if (!loan.drawn || loan.closed || amount == 0 || amount > loan.outstanding) revert BadParams();
        _pull(pool.token, amount);
        uint256 interestLeft = loan.outstanding - loan.principalLeft;
        uint256 toInterest = amount > interestLeft ? interestLeft : amount;
        uint256 toPrincipal = amount - toInterest;
        loan.outstanding -= amount;
        pool.held += amount;
        if (toInterest != 0) pool.profit += toInterest;
        if (toPrincipal != 0) {
            loan.principalLeft -= toPrincipal;
            pool.loanPrincipal -= toPrincipal;
            _unlockLoan(id, loan, toPrincipal);
        }
        if (loan.outstanding == 0) loan.closed = true;
        emit LoanRepaid(id, loanId, toPrincipal, toInterest);
    }

    /// @notice After the due date, seize the locked shares that covered the unpaid principal.
    ///         Other members can withdraw what is still in the pool.
    function recognizeDefault(uint256 id, uint256 loanId) external {
        Pool storage pool = _openBooks(id);
        Loan storage loan = _loan(id, loanId);
        if (!loan.drawn || loan.closed || block.timestamp < loan.dueAt) revert TooEarly();
        _seize(id, loan.borrower, loan.borrowerLocked);
        if (loan.guarantor != address(0)) _seize(id, loan.guarantor, loan.guarantorLocked);
        pool.loanPrincipal -= loan.principalLeft;
        loan.principalLeft = 0;
        loan.outstanding = 0;
        loan.borrowerLocked = 0;
        loan.guarantorLocked = 0;
        loan.closed = true;
    }

    function closePool(uint256 id) external {
        Pool storage pool = _live(id);
        if (pool.kind != Kind.Club || !_admin(id, msg.sender)) revert BadState();
        pool.closed = true;
        emit PoolClosed(id);
    }

    function shareProfit(uint256 id) external {
        Pool storage pool = _openBooks(id);
        if (pool.kind != Kind.Club || !pool.closed || pool.profitShared || !_admin(id, msg.sender)) revert BadState();
        _foldProfit(id);
    }

    function consent(uint256 id, bool spend) external {
        Pool storage pool = _live(id);
        if (pool.kind != Kind.Joint) revert BadState();
        Seat storage seat = _seatOf(id, msg.sender);
        if (spend) seat.spendConsent = true;
        else seat.cancelConsent = true;
    }

    function revokeConsent(uint256 id, bool spend) external {
        Pool storage pool = _live(id);
        if (pool.kind != Kind.Joint) revert BadState();
        Seat storage seat = _seatOf(id, msg.sender);
        if (spend) seat.spendConsent = false;
        else seat.cancelConsent = false;
    }

    /// @notice Remove a member who has not deposited. A zero-share seat cannot block a joint payout.
    function removeMember(uint256 id, address account) external {
        Pool storage pool = _live(id);
        if (!_admin(id, msg.sender) || account == pool.creator) revert BadState();
        uint256 indexPlus = _index[id][account];
        if (indexPlus == 0) revert NotMember();
        uint256 index = indexPlus - 1;
        Seat storage seat = _seats[id][index];
        if (seat.shares != 0 || seat.locked != 0 || seat.fine != 0) revert BadState();
        uint256 last = pool.memberCount - 1;
        if (index != last) {
            Seat memory moved = _seats[id][last];
            _seats[id][index] = moved;
            _index[id][moved.account] = indexPlus;
        }
        _seats[id].pop();
        _index[id][account] = 0;
        groupAdmin[id][account] = false;
        pool.memberCount -= 1;
    }

    function payBeneficiary(uint256 id) external nonReentrant {
        Pool storage pool = _live(id);
        if (pool.kind != Kind.Joint || pool.loanPrincipal != 0) revert BadState();
        uint256 due = pool.shareTotal + pool.profit;
        if (due < pool.target || due != pool.held) revert BadState();
        if (pool.releaseRule == ReleaseRule.Treasurer) {
            if (msg.sender != pool.treasurer) revert NotAdmin();
        } else if (!_all(id, true)) {
            revert BadState();
        }
        pool.released = true;
        pool.closed = true;
        pool.shareTotal = 0;
        pool.profit = 0;
        pool.held = 0;
        uint256 n = pool.memberCount;
        for (uint256 i; i < n; ++i) _seats[id][i].shares = 0;
        ISuperTokenMini(pool.token).transfer(pool.beneficiary, due);
        emit JointPaid(id, pool.beneficiary, due);
    }

    function openRefund(uint256 id) external {
        Pool storage pool = _live(id);
        if (pool.kind != Kind.Joint || !_all(id, false)) revert BadState();
        pool.closed = true;
        _foldProfit(id);
        pool.refundOpen = true;
    }

    function withdrawProtocolFees(address token, address to) external nonReentrant {
        if (msg.sender != owner()) revert NotProtocolAdmin();
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = protocolFees[token];
        if (amount == 0) revert ZeroAmount();
        protocolFees[token] = 0;
        ISuperTokenMini(token).transfer(to, amount);
        emit ProtocolFeeWithdrawn(token, to, amount);
    }

    function getPool(uint256 id) external view returns (Pool memory) {
        return _pools[id];
    }

    function getSeat(uint256 id, uint256 index) external view returns (Seat memory) {
        return _seats[id][index];
    }

    function getLoan(uint256 id, uint256 loanId) external view returns (Loan memory) {
        return _loans[id][loanId];
    }

    function books(uint256 id)
        external
        view
        returns (uint256 shares, uint256 profit, uint256 principal, uint256 held, uint256 reserve)
    {
        Pool storage pool = _pools[id];
        if (pool.creator == address(0)) revert BadState();
        shares = pool.shareTotal;
        profit = pool.profit;
        principal = pool.loanPrincipal;
        held = pool.held;
        reserve = (shares * pool.reserveBps) / BPS;
    }

    function _foldProfit(uint256 id) internal {
        Pool storage pool = _pools[id];
        uint256 profit = pool.profit;
        uint256 total = pool.shareTotal;
        if (profit != 0 && total != 0) {
            uint256 left = profit;
            uint256 n = pool.memberCount;
            uint256 last = n - 1;
            for (uint256 i; i < n; ++i) {
                if (_seats[id][i].shares != 0) last = i;
            }
            for (uint256 i; i < n; ++i) {
                if (_seats[id][i].shares == 0) continue;
                uint256 cut = i == last ? left : (profit * _seats[id][i].shares) / total;
                _seats[id][i].shares += cut;
                left -= cut;
            }
            pool.shareTotal += profit;
            pool.profit = 0;
        }
        pool.profitShared = true;
        emit ProfitShared(id, profit);
    }

    function _seatIn(uint256 id, address account) internal {
        _index[id][account] = _pools[id].memberCount + 1;
        _seats[id].push(
            Seat({
                account: account,
                shares: 0,
                locked: 0,
                pledge: 0,
                fine: 0,
                paidThisPeriod: 0,
                nextDue: uint64(block.timestamp) + _pools[id].period,
                spendConsent: false,
                cancelConsent: false
            })
        );
        _pools[id].memberCount += 1;
    }

    function _advance(Pool storage pool, Seat storage seat) internal {
        uint256 owed = _owed(pool, seat);
        if (owed == 0) return;
        uint256 steps = seat.paidThisPeriod / owed;
        uint256 maxSteps = (type(uint64).max - seat.nextDue) / pool.period;
        if (steps > maxSteps) steps = maxSteps;
        if (steps == 0) return;
        seat.paidThisPeriod -= steps * owed;
        seat.nextDue += uint64(pool.period * steps);
    }

    function _owed(Pool storage pool, Seat storage seat) internal view returns (uint256) {
        if (pool.pledgeMode == PledgeMode.Fixed) return pool.fixedPledge;
        return seat.pledge;
    }

    function _checkWaiver(uint256 id, WaiverKind kind, uint256 ref, uint256 amount) internal view {
        if (kind == WaiverKind.Fine) {
            if (ref >= _pools[id].memberCount || _seats[id][ref].fine != amount) revert BadParams();
            return;
        }
        Loan storage loan = _loan(id, ref);
        uint256 interestLeft = loan.outstanding - loan.principalLeft;
        if (!loan.drawn || loan.closed || amount > interestLeft) revert BadParams();
    }

    function _applyWaiver(uint256 id, WaiverKind kind, uint256 ref, uint256 amount, address first, address second) internal {
        if (kind == WaiverKind.Fine) {
            _seats[id][ref].fine = 0;
        } else {
            _loans[id][ref].outstanding -= amount;
            if (_loans[id][ref].outstanding == 0) _loans[id][ref].closed = true;
        }
        emit Waived(id, kind, ref, amount, first, second);
    }

    function _unlockLoan(uint256 id, Loan storage loan, uint256 principalPaid) internal {
        if (loan.principalLeft == 0) {
            _unlock(id, loan.borrower, loan.borrowerLocked);
            if (loan.guarantor != address(0)) _unlock(id, loan.guarantor, loan.guarantorLocked);
            loan.borrowerLocked = 0;
            loan.guarantorLocked = 0;
            return;
        }
        uint256 b = (loan.borrowerLocked * principalPaid) / loan.principal;
        uint256 g = (loan.guarantorLocked * principalPaid) / loan.principal;
        _unlock(id, loan.borrower, b);
        if (loan.guarantor != address(0)) _unlock(id, loan.guarantor, g);
        loan.borrowerLocked -= b;
        loan.guarantorLocked -= g;
    }

    function _seize(uint256 id, address account, uint256 amount) internal {
        if (amount == 0) return;
        Seat storage seat = _seatOf(id, account);
        uint256 take = amount > seat.shares ? seat.shares : amount;
        if (seat.locked >= take) seat.locked -= take;
        else seat.locked = 0;
        seat.shares -= take;
        Pool storage pool = _pools[id];
        pool.shareTotal = pool.shareTotal >= take ? pool.shareTotal - take : 0;
    }

    function _unlock(uint256 id, address account, uint256 amount) internal {
        if (amount == 0) return;
        Seat storage seat = _seatOf(id, account);
        seat.locked = seat.locked > amount ? seat.locked - amount : 0;
    }

    function _all(uint256 id, bool spend) internal view returns (bool) {
        uint256 n = _pools[id].memberCount;
        if (n == 0) return false;
        for (uint256 i; i < n; ++i) {
            if (_seats[id][i].shares == 0) continue;
            if (spend) {
                if (!_seats[id][i].spendConsent) return false;
            } else if (!_seats[id][i].cancelConsent) {
                return false;
            }
        }
        return true;
    }

    function _live(uint256 id) internal view returns (Pool storage pool) {
        pool = _pools[id];
        if (pool.creator == address(0) || pool.closed || pool.released) revert BadState();
    }

    function _openBooks(uint256 id) internal view returns (Pool storage pool) {
        pool = _pools[id];
        if (pool.creator == address(0) || pool.released) revert BadState();
    }

    function _admin(uint256 id, address account) internal view returns (bool) {
        return account == _pools[id].creator || groupAdmin[id][account];
    }

    function _seatOf(uint256 id, address account) internal view returns (Seat storage seat) {
        uint256 index = _index[id][account];
        if (index == 0) revert NotMember();
        seat = _seats[id][index - 1];
    }

    function _loan(uint256 id, uint256 loanId) internal view returns (Loan storage loan) {
        if (loanId >= _loans[id].length) revert BadParams();
        loan = _loans[id][loanId];
    }

    function _pull(address token, uint256 amount) internal {
        uint256 beforeBal = ISuperTokenMini(token).balanceOf(address(this));
        ISuperTokenMini(token).transferFrom(msg.sender, address(this), amount);
        if (ISuperTokenMini(token).balanceOf(address(this)) - beforeBal != amount) revert FeeOnTransfer();
    }
}

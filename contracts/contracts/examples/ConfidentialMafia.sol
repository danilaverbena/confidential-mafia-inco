// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {euint256, ebool, e} from "@inco/lightning/src/Lib.sol";
import {ConfidentialDeck} from "../kit/ConfidentialDeck.sol";

/// @title ConfidentialMafia - hidden roles + hidden night actions on Inco.
/// @notice Extends the template's Mafia.sol (private role dealing) with:
///           - a Doctor role
///           - uniform, encrypted night actions (every living player acts every
///             night, in the same call shape, so nobody can infer a role from
///             who called what)
///           - a two-step reveal->settle night resolution that discloses only
///             "who died, if anyone" -- never who voted for whom, in what role
///           - a public day-lynch vote (day votes are public in real Mafia)
///           - a win check that only learns "was the dead player Mafia?" at the
///             moment their role is revealed on death -- the same information a
///             human town would learn, no more.
/// @dev Hackathon-scope reference implementation, not audited. Role encoding:
///        value in [1, mafiaCount]        -> Mafia
///        value == mafiaCount + 1         -> Doctor
///        anything else                   -> Villager
///      Comparisons/selects follow the documented Inco Lightning library API
///      (e.eq/e.le/e.gt, e.select, e.add, e.or, e.asEuint256, e.verifyDecryption).
///      Every stored handle is allowThis()'d before use in a later tx, and the
///      shuffle fee is paid via deckFee(n) exactly like the base kit.
contract ConfidentialMafia is ConfidentialDeck {
    using e for *;

    // ── Config -----------------------------------------------------------
    uint16 public immutable mafiaCount; // public: "how many mafia", not who

    // ── Lobby / players ----------------------------------------------------
    address[] public players;
    mapping(address => bool) public seated;
    mapping(address => bool) public alive;
    mapping(address => euint256) private roleOf; // readable only by its owner
    mapping(address => uint8) public revealedRoleValue; // 0 = not revealed yet

    uint16 public aliveCount;
    uint16 public aliveMafiaCount; // starts at mafiaCount, decremented only
                                    // when a dead player's revealed role turns
                                    // out to be Mafia -- exactly what a human
                                    // town would learn, no earlier.

    uint256 public round;

    enum State {
        Joining,
        Assigned,
        Night,
        NightPendingReveal, // waiting on attested (victimIndex, dies)
        NightRoleReveal,    // waiting on attested role of the dead player
        Day,
        DayRoleReveal,      // waiting on attested role of the lynched player
        GameOver
    }
    State public state;

    enum Winner { None, Town, Mafia }
    Winner public winner;

    // ── Night action state (reset every night) ------------------------------
    mapping(address => bool) public hasSubmittedNight;
    uint16 public nightSubmissions;
    mapping(uint16 => euint256) private killWeight; // per player-index, encrypted
    mapping(uint16 => ebool) private protectFlag;    // per player-index, encrypted

    // Public so the frontend/orchestrator can read the handles to fetch
    // their attested reveal (@inco/lightning-js zap.attestedReveal) without
    // needing a bespoke view function or parsing the NightResolving/
    // DayLynchResolving event logs.
    euint256 public pendingVictimIndexHandle;
    euint256 public pendingDeathFlagHandle; // 0/1 as euint256 (see settleNight)
    address public pendingDeadPlayer;

    // ── Day vote state (reset every day) -------------------------------------
    mapping(address => bool) public hasVotedDay;
    mapping(address => uint16) public voteTally; // plain: day votes are public
    uint16 public dayVotesCast;

    // ── Events ---------------------------------------------------------------
    event Joined(address indexed player);
    event RolesAssigned(uint16 players, uint16 mafia);
    event NightStarted(uint256 round);
    event NightActionSubmitted(address indexed player, uint16 targetIndex);
    event NightResolving(bytes32 victimIndexHandle, bytes32 deathFlagHandle);
    event PlayerDied(address indexed player, bool wasMafia, string cause); // cause: "night" | "day"
    event NightSkipped(); // nobody died
    event DayStarted(uint256 round);
    event DayVoteCast(address indexed voter, address indexed target);
    event DayLynchResolving(address indexed target);
    event GameEnded(Winner winner);
    event NewRound(uint256 round);

    constructor(uint16 _mafiaCount) {
        require(_mafiaCount >= 1, "need mafia");
        mafiaCount = _mafiaCount;
    }

    // ── Lobby ------------------------------------------------------------------

    function join() external {
        require(state == State.Joining, "closed");
        require(!seated[msg.sender], "already joined");
        seated[msg.sender] = true;
        players.push(msg.sender);
        emit Joined(msg.sender);
    }

    /// @notice Shuffle and deal a private role to each seat, then open night 1.
    /// @dev Needs >= mafiaCount + 2 players (mafia + doctor + at least one more).
    function assignRoles() external {
        require(state == State.Joining, "already assigned");
        uint16 n = uint16(players.length);
        require(n >= mafiaCount + 2, "too few players");
        require(address(this).balance >= deckFee(n), "fund shuffle fee first");

        _newShuffledDeck(n); // KIT: shuffle roles 1..n
        for (uint256 i = 0; i < n; i++) {
            address p = players[i];
            roleOf[p] = _dealTo(p); // KIT: only this player reads their role
            alive[p] = true;
        }
        aliveCount = n;
        aliveMafiaCount = mafiaCount;
        state = State.Assigned;
        emit RolesAssigned(n, mafiaCount);

        _beginNight();
    }

    /// @notice Your role handle. Decrypt client-side with peekMyCards.
    function myRoleHandle() external view returns (bytes32) {
        return euint256.unwrap(roleOf[msg.sender]);
    }

    /// @notice A seat's role handle -- opaque to everyone until that role is
    /// actually revealed (on death). Needed so the frontend/orchestrator can
    /// fetch the attested reveal for a dead player's role by handle; reading
    /// this for a LIVING player's address returns a handle nobody but that
    /// player can decrypt, same as before.
    function roleHandleOf(address who) external view returns (bytes32) {
        return euint256.unwrap(roleOf[who]);
    }

    function playerCount() external view returns (uint256) {
        return players.length;
    }

    // ── Night: everyone acts, in the same shape -------------------------------

    function _beginNight() internal {
        // euint256/ebool are user-defined value types wrapping a ciphertext
        // handle; `delete` is not defined for them, so we reset every living
        // seat's accumulator to a fresh trivially-encrypted zero/false handle
        // instead. Trivial encryption (asEuint256) costs no shuffle fee.
        euint256 zero = e.asEuint256(0);
        zero.allowThis();
        ebool falseFlag = e.eq(e.asEuint256(0), e.asEuint256(1)); // always false
        falseFlag.allowThis();

        for (uint256 i = 0; i < players.length; i++) {
            if (!alive[players[i]]) continue;
            killWeight[uint16(i)] = zero;
            protectFlag[uint16(i)] = falseFlag;
            hasSubmittedNight[players[i]] = false;
        }
        nightSubmissions = 0;
        state = State.Night;
        emit NightStarted(round);
    }

    /// @notice Every living player calls this once per night, choosing a
    /// target index. The call shape is IDENTICAL for Mafia, Doctor, and
    /// Villager -- the contract, not the caller, decides what the action means.
    function submitNightAction(uint16 targetIndex) external {
        require(state == State.Night, "not night");
        require(alive[msg.sender], "not alive");
        require(!hasSubmittedNight[msg.sender], "already acted");
        require(targetIndex < players.length, "bad target");
        require(alive[players[targetIndex]], "target not alive");

        euint256 role = roleOf[msg.sender];
        ebool isMafia = e.le(role, e.asEuint256(uint256(mafiaCount)));
        ebool isDoctor = e.eq(role, e.asEuint256(uint256(mafiaCount) + 1));

        euint256 weight = e.select(isMafia, e.asEuint256(1), e.asEuint256(0));
        euint256 newWeight = e.add(killWeight[targetIndex], weight);
        newWeight.allowThis();
        killWeight[targetIndex] = newWeight;

        ebool newProtect = e.or(protectFlag[targetIndex], isDoctor);
        newProtect.allowThis();
        protectFlag[targetIndex] = newProtect;

        hasSubmittedNight[msg.sender] = true;
        nightSubmissions += 1;
        emit NightActionSubmitted(msg.sender, targetIndex);
    }

    /// @notice Once every living player has acted, fold the encrypted votes
    /// into a single (victimIndex, dies) pair and reveal only that pair.
    /// No individual vote or role is ever disclosed.
    function resolveNightStep1() external {
        require(state == State.Night, "not night");
        require(nightSubmissions == aliveCount, "waiting on players");

        euint256 bestVotes;
        euint256 bestIndex;
        ebool bestProtected;
        bool started;

        for (uint256 i = 0; i < players.length; i++) {
            if (!alive[players[i]]) continue;
            uint16 idx = uint16(i);
            if (!started) {
                bestVotes = killWeight[idx];
                bestIndex = e.asEuint256(idx);
                bestProtected = protectFlag[idx];
                started = true;
                continue;
            }
            ebool isGreater = e.gt(killWeight[idx], bestVotes);
            bestVotes = e.select(isGreater, killWeight[idx], bestVotes);
            bestIndex = e.select(isGreater, e.asEuint256(idx), bestIndex);
            bestProtected = e.select(isGreater, protectFlag[idx], bestProtected);
        }

        ebool noVotes = e.eq(bestVotes, e.asEuint256(0));
        ebool dies = e.and(e.not(noVotes), e.not(bestProtected));
        euint256 diesAsInt = e.asEuint256(dies);

        bestIndex.allowThis();
        diesAsInt.allowThis();
        e.reveal(bestIndex);
        e.reveal(diesAsInt);

        pendingVictimIndexHandle = bestIndex;
        pendingDeathFlagHandle = diesAsInt;
        state = State.NightPendingReveal;
        emit NightResolving(euint256.unwrap(bestIndex), euint256.unwrap(diesAsInt));
    }

    /// @notice Settle the attested (victimIndex, dies) pair from the frontend.
    function settleNight(
        uint256 victimIndexValue,
        bytes[] calldata victimSigs,
        uint256 diesValue,
        bytes[] calldata diesSigs
    ) external {
        require(state == State.NightPendingReveal, "not pending");
        require(e.verifyDecryption(pendingVictimIndexHandle, victimIndexValue, victimSigs), "bad victim attestation");
        require(e.verifyDecryption(pendingDeathFlagHandle, diesValue, diesSigs), "bad death-flag attestation");
        require(diesValue == 0 || diesValue == 1, "bad death flag");

        if (diesValue == 0) {
            emit NightSkipped();
            _advanceToDay();
            return;
        }

        address victim = players[victimIndexValue];
        pendingDeadPlayer = victim;
        alive[victim] = false;
        aliveCount -= 1;

        // Reveal the dead player's role -- same disclosure a human town gets.
        euint256 role = roleOf[victim];
        role.allowThis();
        e.reveal(role);
        state = State.NightRoleReveal;
    }

    /// @notice Settle the attested role of the player who died overnight.
    function settleNightRole(uint256 roleValue, bytes[] calldata sigs) external {
        require(state == State.NightRoleReveal, "not pending");
        address victim = pendingDeadPlayer;
        require(e.verifyDecryption(roleOf[victim], roleValue, sigs), "bad role attestation");

        revealedRoleValue[victim] = uint8(roleValue);
        bool wasMafia = roleValue <= mafiaCount;
        if (wasMafia) {
            aliveMafiaCount -= 1;
        }
        pendingDeadPlayer = address(0);
        emit PlayerDied(victim, wasMafia, "night");

        if (_checkWin()) return;
        _advanceToDay();
    }

    // ── Day: public discussion + public lynch vote -----------------------------

    function _advanceToDay() internal {
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            hasVotedDay[p] = false;
            voteTally[p] = 0;
        }
        dayVotesCast = 0;
        state = State.Day;
        emit DayStarted(round);
    }

    function castDayVote(address target) external {
        require(state == State.Day, "not day");
        require(alive[msg.sender], "not alive");
        require(alive[target], "target not alive");
        require(!hasVotedDay[msg.sender], "already voted");

        hasVotedDay[msg.sender] = true;
        voteTally[target] += 1;
        dayVotesCast += 1;
        emit DayVoteCast(msg.sender, target);
    }

    /// @notice Once everyone alive has voted, reveal the plurality target's role.
    function resolveDayVote() external {
        require(state == State.Day, "not day");
        require(dayVotesCast == aliveCount, "waiting on players");

        address top;
        uint16 topVotes;
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (!alive[p]) continue;
            if (voteTally[p] > topVotes) {
                topVotes = voteTally[p];
                top = p;
            }
        }
        require(top != address(0), "no votes");

        pendingDeadPlayer = top;
        alive[top] = false;
        aliveCount -= 1;

        euint256 role = roleOf[top];
        role.allowThis();
        e.reveal(role);
        state = State.DayRoleReveal;
        emit DayLynchResolving(top);
    }

    function settleDayRole(uint256 roleValue, bytes[] calldata sigs) external {
        require(state == State.DayRoleReveal, "not pending");
        address lynched = pendingDeadPlayer;
        require(e.verifyDecryption(roleOf[lynched], roleValue, sigs), "bad role attestation");

        revealedRoleValue[lynched] = uint8(roleValue);
        bool wasMafia = roleValue <= mafiaCount;
        if (wasMafia) {
            aliveMafiaCount -= 1;
        }
        pendingDeadPlayer = address(0);
        emit PlayerDied(lynched, wasMafia, "day");

        if (_checkWin()) return;
        round += 1;
        _beginNight();
    }

    // ── Win condition ------------------------------------------------------------

    function _checkWin() internal returns (bool over) {
        if (aliveMafiaCount == 0) {
            winner = Winner.Town;
            state = State.GameOver;
            emit GameEnded(winner);
            return true;
        }
        if (aliveMafiaCount * 2 >= aliveCount) {
            winner = Winner.Mafia;
            state = State.GameOver;
            emit GameEnded(winner);
            return true;
        }
        return false;
    }

    /// @notice Reopen joining for a fresh game. Anyone can call once game over.
    function reset() external {
        require(state == State.GameOver, "game not over");
        for (uint256 i = 0; i < players.length; i++) {
            seated[players[i]] = false;
            alive[players[i]] = false;
        }
        delete players;
        round += 1;
        winner = Winner.None;
        state = State.Joining;
        emit NewRound(round);
    }

    /// @notice Anyone can pre-fund the shuffle fee.
    receive() external payable {}
}

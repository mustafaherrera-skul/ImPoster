export const TALK_MS = 120000;
export const MAX_PLAYERS = 20;

export function createInitial() {
  return {
    players: [],
    impostorCount: 1,
    deckId: "standard",
    phase: "lobby",
    word: null,
    hint: null,
    cardIndex: 0,
    passing: false,
    round: 1,
    starterId: null,
    countdownStartedAt: null,
    suspenseStartedAt: null,
    talkStartedAt: null,
    voteId: null,
    confirming: false,
    eliminated: [],
    winner: null,
    impostorsRemain: false,
    matchId: null,
  };
}

export function normalizeName(raw) {
  return raw.trim().replace(/\s+/g, " ").slice(0, 18);
}

export function maxImpostors(playerCount) {
  if (playerCount < 3) return 1;
  return Math.max(1, Math.floor((playerCount - 1) / 2));
}

function clampImpostors(count, playerCount) {
  return Math.min(Math.max(1, count), maxImpostors(playerCount));
}

export function canStart(state) {
  const count = state.players.length;
  if (count < 3 || count > MAX_PLAYERS) return false;
  const names = state.players.map((player) => player.name.toLocaleLowerCase("es"));
  if (names.some((name) => name.length === 0)) return false;
  return new Set(names).size === names.length;
}

export function startBlockReason(state) {
  if (state.players.length < 3) return "Sumá al menos 3 jugadores.";
  if (state.players.length > MAX_PLAYERS) return "Demasiados jugadores.";
  return null;
}

export function nextAliveId(players, afterId) {
  const start = Math.max(0, players.findIndex((player) => player.id === afterId));
  for (let step = 1; step <= players.length; step += 1) {
    const player = players[(start + step) % players.length];
    if (player?.alive) return player.id;
  }
  return players.find((player) => player.alive)?.id ?? afterId;
}

export function speakingOrder(players, starterId) {
  const start = Math.max(0, players.findIndex((player) => player.id === starterId));
  const rotated = [...players.slice(start), ...players.slice(0, start)];
  return rotated.filter((player) => player.alive);
}

export function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swap];
    copy[swap] = current;
  }
  return copy;
}

export function formatTime(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function sameName(a, b) {
  return a.toLocaleLowerCase("es") === b.toLocaleLowerCase("es");
}

export function reducer(state, action) {
  switch (action.type) {
    case "add": {
      if (state.phase !== "lobby") return state;
      const name = normalizeName(action.name);
      if (!name || state.players.length >= MAX_PLAYERS) return state;
      if (state.players.some((player) => sameName(player.name, name))) return state;
      const players = [...state.players, { id: action.id, name, role: null, alive: true }];
      return { ...state, players, impostorCount: clampImpostors(state.impostorCount, players.length) };
    }
    case "rename": {
      if (state.phase !== "lobby") return state;
      const name = normalizeName(action.name);
      if (!name) return state;
      if (state.players.some((player) => player.id !== action.id && sameName(player.name, name))) return state;
      return { ...state, players: state.players.map((player) => (player.id === action.id ? { ...player, name } : player)) };
    }
    case "remove": {
      if (state.phase !== "lobby") return state;
      const players = state.players.filter((player) => player.id !== action.id);
      return { ...state, players, impostorCount: clampImpostors(state.impostorCount, players.length) };
    }
    case "move": {
      if (state.phase !== "lobby") return state;
      const next = action.index + action.dir;
      if (next < 0 || next >= state.players.length) return state;
      const players = [...state.players];
      const current = players[action.index];
      const target = players[next];
      if (!current || !target) return state;
      players[action.index] = target;
      players[next] = current;
      return { ...state, players };
    }
    case "reorder": {
      if (state.phase !== "lobby") return state;
      const { from, to } = action;
      if (from < 0 || from >= state.players.length || to < 0 || to >= state.players.length || from === to) return state;
      const players = [...state.players];
      const [moved] = players.splice(from, 1);
      players.splice(to, 0, moved);
      return { ...state, players };
    }
    case "setImpostors":
      if (state.phase !== "lobby") return state;
      return { ...state, impostorCount: clampImpostors(action.count, state.players.length) };
    case "setDeck":
      if (state.phase !== "lobby") return state;
      return { ...state, deckId: action.deckId || "standard" };
    case "deal": {
      if (!canStart(state)) return state;
      const impostors = new Set(action.impostorIds);
      return {
        ...createInitial(),
        deckId: state.deckId || "standard",
        players: state.players.map((player) => ({
          ...player,
          alive: true,
          role: impostors.has(player.id) ? "impostor" : "innocent",
        })),
        impostorCount: action.impostorCount ?? state.impostorCount,
        phase: "cards",
        word: action.word,
        hint: action.hint,
        starterId: action.starterId,
        matchId: action.matchId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "m_" + Date.now()),
        round: 1,
      };
    }
    case "hideCard":
      if (state.phase !== "cards") return state;
      if (state.cardIndex >= state.players.length - 1) {
        return {
          ...state,
          phase: "countdown",
          passing: false,
          countdownStartedAt: action.now || Date.now(),
        };
      }
      return { ...state, passing: false, cardIndex: state.cardIndex + 1 };
    case "armNext":
      if (state.phase !== "cards") return state;
      return { ...state, passing: false, cardIndex: Math.min(state.players.length - 1, state.cardIndex + 1) };
    case "rerollStarter":
      if (state.phase !== "briefing") return state;
      return { ...state, starterId: action.starterId };
    case "beginCountdown":
      if (state.phase !== "briefing") return state;
      return { ...state, phase: "countdown", countdownStartedAt: action.now };
    case "beginTalk":
      if (state.phase !== "countdown") return state;
      return { ...state, phase: "talk", talkStartedAt: action.now };
    case "toVote":
      if (state.phase !== "talk") return state;
      return { ...state, phase: "vote", voteId: null, confirming: false };
    case "backToTalk":
      if (state.phase !== "vote") return state;
      return { ...state, phase: "talk", voteId: null, confirming: false };
    case "selectVote": {
      if (state.phase !== "vote") return state;
      const target = state.players.find((player) => player.id === action.id && player.alive);
      if (!target) return state;
      return { ...state, voteId: action.id, confirming: false };
    }
    case "askConfirm":
      if (state.phase !== "vote" || !state.voteId) return state;
      return { ...state, confirming: true };
    case "cancelConfirm":
      return { ...state, confirming: false };
    case "beginSuspense":
      if (state.phase !== "vote" || !state.voteId) return state;
      return { ...state, phase: "suspense", suspenseStartedAt: action.now || Date.now(), confirming: false };
    case "confirmEliminate": {
      if ((state.phase !== "vote" && state.phase !== "suspense") || !state.voteId) return state;
      const target = state.players.find((player) => player.id === state.voteId && player.alive);
      if (!target?.role) return state;
      const players = state.players.map((player) => (player.id === target.id ? { ...player, alive: false } : player));
      const alive = players.filter((player) => player.alive);
      const impostors = alive.filter((player) => player.role === "impostor").length;
      const innocents = alive.length - impostors;
      let winner = null;
      if (impostors === 0) winner = "innocents";
      else if (impostors >= innocents) winner = "impostors";
      return {
        ...state,
        players,
        phase: "reveal",
        confirming: false,
        voteId: null,
        suspenseStartedAt: null,
        eliminated: [...state.eliminated, { id: target.id, name: target.name, role: target.role, round: state.round }],
        winner,
        impostorsRemain: winner === null && target.role === "impostor",
      };
    }
    case "nextRound": {
      if (state.phase !== "reveal" || state.winner) return state;
      const alive = state.players.filter((p) => p.alive);
      if (!alive.length) return state;
      const others = alive.filter((p) => p.id !== state.starterId);
      const pool = others.length ? others : alive;
      const nextStarter = pool[Math.floor(Math.random() * pool.length)].id;
      return {
        ...state,
        phase: "countdown",
        round: state.round + 1,
        starterId: nextStarter,
        countdownStartedAt: action.now || Date.now(),
        talkStartedAt: null,
        confirming: false,
        voteId: null,
        impostorsRemain: false,
      };
    }
    case "voteAgain":
      if (state.phase !== "reveal" || state.winner) return state;
      return { ...state, phase: "vote", voteId: null, confirming: false };
    case "toLeaderboard":
      return { ...state, phase: "leaderboard" };
    case "toLobby":
      return {
        ...createInitial(),
        deckId: state.deckId || "standard",
        players: state.players.map((player) => ({ ...player, role: null, alive: true })),
        impostorCount: clampImpostors(state.impostorCount, state.players.length),
      };
    default:
      return state;
  }
}

export function calculateGameScores(state) {
  if (!state.winner) return {};
  const scores = {};

  state.players.forEach((player) => {
    const elimRecord = state.eliminated.find((e) => e.id === player.id);
    const wasEliminated = !!elimRecord;
    const elimRound = elimRecord ? elimRecord.round || 1 : null;
    const isImpostor = player.role === "impostor";
    const breakdown = [];

    if (state.winner === "innocents") {
      if (!isImpostor) {
        if (!wasEliminated) {
          breakdown.push({ label: "Victoria Inocente", pts: 120 });
        } else {
          breakdown.push({ label: "Victoria de equipo (sacrificio)", pts: 70 });
        }
      } else {
        // Impostor perdió
        if (wasEliminated) {
          if (elimRound <= 1) {
            breakdown.push({ label: "Eliminado en 1ª ronda", pts: 0 });
          } else {
            const survivalRounds = elimRound - 1;
            const survivalPts = survivalRounds * 50;
            breakdown.push({
              label: `Sobrevivió ${survivalRounds} ronda${survivalRounds > 1 ? "s" : ""}`,
              pts: survivalPts,
            });
          }
        } else {
          breakdown.push({ label: "Sobrevivió hasta el final", pts: 100 });
        }
      }
    } else if (state.winner === "impostors") {
      if (isImpostor) {
        breakdown.push({ label: "Victoria Impostor 🎭", pts: 260 });
        if (!wasEliminated) {
          breakdown.push({ label: "Infiltración perfecta (no detectado)", pts: 120 });
        } else {
          if (elimRound <= 1) {
            breakdown.push({ label: "Eliminado en 1ª ronda", pts: 0 });
          } else {
            const survivalRounds = elimRound - 1;
            const survivalPts = survivalRounds * 50;
            breakdown.push({
              label: `Sobrevivió ${survivalRounds} ronda${survivalRounds > 1 ? "s" : ""}`,
              pts: survivalPts,
            });
          }
        }
      } else {
        // Inocente perdió
        breakdown.push({ label: "Premio consuelo / Participación", pts: 20 });
      }
    }

    const total = breakdown.reduce((sum, item) => sum + item.pts, 0);
    scores[player.id] = {
      playerId: player.id,
      name: player.name,
      role: player.role,
      wasEliminated,
      elimRound,
      total,
      breakdown,
    };
  });

  return scores;
}

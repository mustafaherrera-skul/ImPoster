export const TALK_MS = 120000;
export const MAX_PLAYERS = 20;

export function createInitial() {
  return {
    players: [],
    impostorCount: 1,
    phase: "lobby",
    word: null,
    hint: null,
    cardIndex: 0,
    passing: false,
    round: 1,
    starterId: null,
    countdownStartedAt: null,
    talkStartedAt: null,
    voteId: null,
    confirming: false,
    eliminated: [],
    winner: null,
    impostorsRemain: false,
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
    case "setImpostors":
      if (state.phase !== "lobby") return state;
      return { ...state, impostorCount: clampImpostors(action.count, state.players.length) };
    case "deal": {
      if (!canStart(state)) return state;
      const impostors = new Set(action.impostorIds);
      return {
        ...createInitial(),
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
        round: 1,
      };
    }
    case "hideCard":
      if (state.phase !== "cards" || state.passing) return state;
      if (state.cardIndex >= state.players.length - 1) return { ...state, phase: "briefing", passing: false };
      return { ...state, passing: false, cardIndex: state.cardIndex + 1 };
    case "armNext":
      if (state.phase !== "cards" || !state.passing) return state;
      return { ...state, passing: false, cardIndex: state.cardIndex + 1 };
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
    case "confirmEliminate": {
      if (state.phase !== "vote" || !state.voteId) return state;
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
        eliminated: [...state.eliminated, { id: target.id, name: target.name, role: target.role }],
        winner,
        impostorsRemain: winner === null && target.role === "impostor",
      };
    }
    case "nextRound": {
      if (state.phase !== "reveal" || state.winner || !state.starterId) return state;
      return {
        ...state,
        phase: "countdown",
        round: state.round + 1,
        starterId: nextAliveId(state.players, state.starterId),
        countdownStartedAt: action.now,
        talkStartedAt: null,
        confirming: false,
        voteId: null,
        impostorsRemain: false,
      };
    }
    case "toLobby":
      return {
        ...createInitial(),
        players: state.players.map((player) => ({ ...player, role: null, alive: true })),
        impostorCount: clampImpostors(state.impostorCount, state.players.length),
      };
    default:
      return state;
  }
}

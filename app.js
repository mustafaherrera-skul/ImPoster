import { DECKS, WORDS } from "./words.js";
import {
  TALK_MS,
  canStart,
  createInitial,
  formatTime,
  maxImpostors,
  normalizeName,
  reducer,
  shuffle,
  speakingOrder,
  startBlockReason,
  calculateGameScores,
} from "./engine.js";

export const APP_VERSION = "1.2.0";

const KEY_PLAYERS = "el-impostor-players-v3";
const KEY_TOURNAMENT = "el-impostor-tournament-v3";
const KEY_IMPOSTOR_CFG = "el-impostor-config-v3";
const KEY_LEGACY = "el-impostor-pages-v1";
const KEY_ROOMS_OLD = "el-impostor-rooms-v2";
const root = document.querySelector("#app");

// Inicialización de estado y persistencia (sin salas, jugadores directos)
let players = loadPlayers();
let tournamentStats = loadTournamentStats();
let impostorConfig = loadImpostorConfig();
let state = loadGameState();

// Estados de interfaz y modales
let draft = "";
let editId = null;
let editDraft = "";
let error = "";
let cardOpen = false;
let cancelAsk = false;
let frame = 0;
let showLeaderboardModal = false;
let showTournamentWinner = false;
let showResetConfirm = false;
let showBreakdown = false;
let leaderboardAnimTimer = null;
let leaderboardAnimPlayed = false;
let updateAvailableVersion = null;
let updateDismissed = false;
let fullscreenPreference = localStorage.getItem("el-impostor-fullscreen-pref") !== "false";
let theme = localStorage.getItem("el-impostor-theme") || "dark";
document.documentElement.setAttribute("data-theme", theme);

// ==========================================================================
// UTILIDADES DE PANTALLA COMPLETA ROBUSTA
// ==========================================================================

function isFsActive() {
  return typeof document !== "undefined" && !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

function requestAppFullscreen() {
  const docEl = document.documentElement;
  const fn = docEl.requestFullscreen ||
             docEl.webkitRequestFullscreen ||
             docEl.mozRequestFullScreen ||
             docEl.msRequestFullscreen;
  if (fn) {
    try {
      const p = fn.call(docEl);
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }
}

function exitAppFullscreen() {
  const fn = document.exitFullscreen ||
             document.webkitExitFullscreen ||
             document.mozCancelFullScreen ||
             document.msExitFullscreen;
  if (fn) {
    try {
      const p = fn.call(document);
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }
}

function toggleAppFullscreen() {
  if (!isFsActive()) {
    fullscreenPreference = true;
    localStorage.setItem("el-impostor-fullscreen-pref", "true");
    requestAppFullscreen();
  } else {
    fullscreenPreference = false;
    localStorage.setItem("el-impostor-fullscreen-pref", "false");
    exitAppFullscreen();
  }
  updateFullscreenUi();
}

function ensureFullscreenIfPreferred() {
  if (fullscreenPreference && !isFsActive()) {
    requestAppFullscreen();
  }
}

function updateFullscreenUi() {
  const isFs = isFsActive();
  const fsBtns = document.querySelectorAll("[data-fullscreen]");
  fsBtns.forEach((btn) => {
    btn.innerHTML = getFullscreenSvg(isFs);
    btn.setAttribute("aria-label", isFs ? "Salir de pantalla completa" : "Pantalla completa");
    btn.setAttribute("title", isFs ? "Salir de pantalla completa" : "Pantalla completa");
    if (isFs) btn.classList.add("active");
    else btn.classList.remove("active");
  });
  if (isFs) {
    document.body.classList.add("fullscreen-active");
  } else {
    document.body.classList.remove("fullscreen-active");
  }
}

// ==========================================================================
// ACTUALIZACIÓN AUTOMÁTICA Y RESGUARDO DE DATOS
// ==========================================================================

function showToast(message, duration = 3000) {
  let toast = document.querySelector(".app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

async function checkAppVersion(isManual = false) {
  if (typeof window !== "undefined" && window.location && window.location.protocol === "file:") {
    if (isManual) showToast("Versión local v" + APP_VERSION);
    return;
  }
  try {
    const res = await fetch("./version.json?t=" + Date.now(), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
    if (!res.ok) {
      if (isManual) showToast("No se pudo comprobar la versión");
      return;
    }
    const data = await res.json();
    if (data && data.version && data.version !== APP_VERSION) {
      updateAvailableVersion = data.version;
      render();
    } else if (isManual) {
      showToast("✓ Tenés la última versión instalada (v" + APP_VERSION + ")");
    }
  } catch {
    if (isManual) showToast("No se pudo comprobar la conexión");
  }
}

function exportTournamentData() {
  const data = {
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    players,
    tournamentStats,
    impostorConfig,
  };
  const jsonStr = JSON.stringify(data, null, 2);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(jsonStr)
      .then(() => showToast("✓ Copia guardada en portapapeles"))
      .catch(() => prompt("Copia tus datos:", jsonStr));
  } else {
    prompt("Copia tus datos:", jsonStr);
  }
}

function importTournamentData() {
  const raw = prompt("Pegá aquí el JSON de tu copia de seguridad:");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.players)) {
      alert("Formato no válido: no se encontraron jugadores.");
      return;
    }
    players = data.players;
    if (data.tournamentStats) tournamentStats = data.tournamentStats;
    if (data.impostorConfig) impostorConfig = data.impostorConfig;
    savePlayers();
    saveTournamentStats();
    saveImpostorConfig();
    showToast("✓ ¡Datos restaurados exitosamente!");
    render();
  } catch {
    alert("Error al importar datos: JSON no válido.");
  }
}


// ==========================================================================
// GESTIÓN DE JUGADORES Y TORNEO
// ==========================================================================

function loadPlayers() {
  try {
    const raw = localStorage.getItem(KEY_PLAYERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { }

  // Migración desde versión anterior de salas si existía
  try {
    const roomsRaw = localStorage.getItem(KEY_ROOMS_OLD);
    if (roomsRaw) {
      const parsedRooms = JSON.parse(roomsRaw);
      if (Array.isArray(parsedRooms) && parsedRooms.length > 0) {
        const firstWithPlayers = parsedRooms.find((r) => r.players && r.players.length > 0) || parsedRooms[0];
        if (firstWithPlayers?.players?.length > 0) {
          savePlayers(firstWithPlayers.players);
          return firstWithPlayers.players;
        }
      }
    }
  } catch { }

  // Migración desde versión legacy si existía
  try {
    const legacyRaw = localStorage.getItem(KEY_LEGACY);
    if (legacyRaw) {
      const legacyData = JSON.parse(legacyRaw);
      if (Array.isArray(legacyData?.players) && legacyData.players.length > 0) {
        const initial = legacyData.players.map((p) => ({
          id: p.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "p_" + Date.now()),
          name: p.name,
          score: 0,
          gamesPlayed: 0,
          wins: 0,
          impostorWins: 0,
          innocentWins: 0,
        }));
        savePlayers(initial);
        return initial;
      }
    }
  } catch { }

  return [];
}

function savePlayers(customList) {
  const toSave = customList || players;
  try {
    localStorage.setItem(KEY_PLAYERS, JSON.stringify(toSave));
  } catch (err) {
    console.error("Error guardando jugadores:", err);
  }
}

function loadTournamentStats() {
  try {
    const raw = localStorage.getItem(KEY_TOURNAMENT);
    if (raw) return JSON.parse(raw);
  } catch { }
  return {
    gamesCount: 0,
    lastAwardedMatchId: null,
    lastGameResults: null,
  };
}

function saveTournamentStats() {
  try {
    localStorage.setItem(KEY_TOURNAMENT, JSON.stringify(tournamentStats));
  } catch (err) {
    console.error("Error guardando estadísticas de torneo:", err);
  }
}

function loadImpostorConfig() {
  try {
    const raw = localStorage.getItem(KEY_IMPOSTOR_CFG);
    if (raw) return JSON.parse(raw);
  } catch { }
  return { mode: "random", count: 1 };
}

function saveImpostorConfig() {
  try {
    localStorage.setItem(KEY_IMPOSTOR_CFG, JSON.stringify(impostorConfig));
  } catch (err) {
    console.error("Error guardando config de impostores:", err);
  }
}

function resetTournamentScores() {
  players.forEach((p) => {
    p.score = 0;
    p.gamesPlayed = 0;
    p.wins = 0;
    p.impostorWins = 0;
    p.innocentWins = 0;
  });
  tournamentStats.gamesCount = 0;
  tournamentStats.lastGameResults = null;
  tournamentStats.lastAwardedMatchId = null;
  savePlayers();
  saveTournamentStats();

  state.players.forEach((sp) => {
    sp.score = 0;
    sp.gamesPlayed = 0;
    sp.wins = 0;
    sp.impostorWins = 0;
    sp.innocentWins = 0;
  });
  save();
  showTournamentWinner = false;
  showResetConfirm = false;
  render();
}

function loadGameState() {
  try {
    const raw = localStorage.getItem(KEY_LEGACY);
    if (!raw) return buildStateFromPlayers();
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.players)) return buildStateFromPlayers();
    let deckId = data.deckId || "standard";
    if (deckId === "test") deckId = "custom";
    if (!DECKS[deckId]) deckId = "standard";

    const synchronizedPlayers = data.players.map((sp) => {
      const p = players.find((x) => x.id === sp.id);
      return {
        ...sp,
        score: p?.score ?? sp.score ?? 0,
        gamesPlayed: p?.gamesPlayed ?? 0,
        wins: p?.wins ?? 0,
        impostorWins: p?.impostorWins ?? 0,
        innocentWins: p?.innocentWins ?? 0,
      };
    });

    return {
      ...createInitial(),
      ...data,
      deckId,
      players: synchronizedPlayers,
      eliminated: data.eliminated || [],
    };
  } catch {
    return buildStateFromPlayers();
  }
}

function buildStateFromPlayers() {
  return {
    ...createInitial(),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score || 0,
      gamesPlayed: p.gamesPlayed || 0,
      wins: p.wins || 0,
      impostorWins: p.impostorWins || 0,
      innocentWins: p.innocentWins || 0,
      role: null,
      alive: true,
    })),
  };
}

function save() {
  const copy = { ...state };
  try {
    localStorage.setItem(KEY_LEGACY, JSON.stringify(copy));
  } catch (err) {
    console.error("Error guardando estado:", err);
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function dispatch(action) {
  const next = reducer(state, action);
  if (next === state) return;
  if (next.phase !== state.phase || next.cardIndex !== state.cardIndex || next.passing !== state.passing) {
    cardOpen = false;
  }
  if (next.phase !== "leaderboard") {
    leaderboardAnimPlayed = false;
  }
  state = next;
  cancelAsk = false;
  save();
  render();
}

// ==========================================================================
// CÁLCULO Y ADJUDICACIÓN DE PUNTUACIONES
// ==========================================================================

function checkAndAwardMatchPoints() {
  if (!state.winner || !state.matchId) return;
  if (tournamentStats.lastAwardedMatchId === state.matchId) return;

  const deltas = calculateGameScores(state);

  // Capturamos el ranking ANTES de aplicar los puntos
  const beforeStandings = players
    .map((p) => {
      const sp = state.players.find((s) => s.id === p.id);
      return {
        id: p.id,
        name: p.name,
        score: p.score || 0,
        role: sp?.role || null,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Aplicamos los puntos y actualizamos estadísticas
  players.forEach((player) => {
    const d = deltas[player.id];
    const pts = d ? d.total : 0;
    player.score = (player.score || 0) + pts;
    player.gamesPlayed = (player.gamesPlayed || 0) + 1;
    if (
      (state.winner === "innocents" && d?.role === "innocent") ||
      (state.winner === "impostors" && d?.role === "impostor")
    ) {
      player.wins = (player.wins || 0) + 1;
      if (d?.role === "impostor") {
        player.impostorWins = (player.impostorWins || 0) + 1;
      } else {
        player.innocentWins = (player.innocentWins || 0) + 1;
      }
    }
  });

  // Capturamos el ranking DESPUÉS de aplicar los puntos
  const afterStandings = players
    .map((p) => {
      const sp = state.players.find((s) => s.id === p.id);
      return {
        id: p.id,
        name: p.name,
        score: p.score || 0,
        role: sp?.role || null,
      };
    })
    .sort((a, b) => b.score - a.score);

  tournamentStats.gamesCount = (tournamentStats.gamesCount || 0) + 1;
  tournamentStats.lastAwardedMatchId = state.matchId;
  tournamentStats.lastGameResults = {
    matchId: state.matchId,
    winner: state.winner,
    word: state.word,
    deltas,
    beforeStandings,
    afterStandings,
    timestamp: Date.now(),
  };

  savePlayers();
  saveTournamentStats();

  // Sincronizamos las puntuaciones en state.players
  state.players.forEach((sp) => {
    const p = players.find((x) => x.id === sp.id);
    if (p) sp.score = p.score;
  });
  save();
}

// ==========================================================================
// LÓGICA DE PARTIDA (DEAL, WORDS, PLAYERS)
// ==========================================================================

function pickWord() {
  const currentDeckId = state.deckId || "standard";
  const deck = DECKS[currentDeckId] || DECKS.standard;
  const wordList = deck.words && deck.words.length ? deck.words : WORDS;

  let recent = [];
  const storageKey = `el-impostor-pages-recent-${currentDeckId}`;
  try {
    recent = JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    recent = [];
  }
  const skip = new Set(recent);
  const pool = wordList.filter((entry) => !skip.has(entry.word));
  const list = pool.length ? pool : wordList;
  const entry = list[Math.floor(Math.random() * list.length)];
  localStorage.setItem(storageKey, JSON.stringify([entry.word, ...recent.filter((word) => word !== entry.word)].slice(0, 80)));

  const hints = Array.isArray(entry.hints) && entry.hints.length
    ? entry.hints
    : (entry.hint ? [entry.hint] : ["Secreto"]);
  const hint = hints[Math.floor(Math.random() * hints.length)];

  return { word: entry.word, hint };
}

function deal() {
  if (!canStart(state)) return;
  const entry = pickWord();
  const maxImp = maxImpostors(state.players.length);

  // Cantidad de impostores: manual o al azar
  let impostorCount;
  if (impostorConfig.mode === "manual") {
    impostorCount = Math.min(Math.max(1, impostorConfig.count || 1), maxImp);
  } else {
    impostorCount = 1 + Math.floor(Math.random() * maxImp);
  }

  const impostorIds = shuffle(state.players.map((player) => player.id)).slice(0, impostorCount);
  const starter = state.players[Math.floor(Math.random() * state.players.length)];
  const matchId = "m_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  dispatch({
    type: "deal",
    word: entry.word,
    hint: entry.hint,
    impostorIds,
    starterId: starter.id,
    impostorCount,
    matchId,
  });
}

function addPlayer() {
  const name = normalizeName(draft);
  if (!name) return setError("Escribí un nombre.");
  if (state.players.some((player) => player.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"))) {
    return setError("Ese nombre ya está.");
  }
  if (state.players.length >= 20) return setError("Máximo 20 jugadores.");
  error = "";
  draft = "";

  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "p_" + Date.now();
  players.push({
    id,
    name,
    score: 0,
    gamesPlayed: 0,
    wins: 0,
    impostorWins: 0,
    innocentWins: 0,
  });
  savePlayers();

  dispatch({ type: "add", id, name });
  const input = root.querySelector("#name");
  if (input) input.focus();
}

function setError(message) {
  error = message;
  render();
}

function starterName() {
  return state.players.find((player) => player.id === state.starterId)?.name || "Alguien";
}

// ==========================================================================
// RENDERIZADO PRINCIPAL
// ==========================================================================

function render() {
  cancelAnimationFrame(frame);
  if (leaderboardAnimTimer) {
    clearTimeout(leaderboardAnimTimer);
    leaderboardAnimTimer = null;
  }
  const canvas = document.querySelector("#confetti");
  if (canvas) canvas.style.display = "none";

  root.innerHTML = screen();

  const cardNode = root.querySelector("[data-card]");
  if (cardNode) {
    cardNode.addEventListener("pointerdown", onSwipeStart);
  }

  if (editId) {
    const editInput = root.querySelector("[data-edit]");
    if (editInput) {
      editInput.focus();
      editInput.select();
    }
  }

  if (state.phase === "countdown" || state.phase === "talk" || state.phase === "suspense") {
    clock();
  }

  // Animación del leaderboard si venimos de una partida recién concluida
  if (state.phase === "leaderboard") {
    if (tournamentStats.lastGameResults && !leaderboardAnimPlayed) {
      leaderboardAnimPlayed = true;
      triggerLeaderboardAnimation(tournamentStats.lastGameResults);
    }
  }
}

function updateBanner() {
  if (state.phase !== "lobby" || !updateAvailableVersion || updateDismissed) return "";
  return `<div class="update-banner" id="app-update-banner">
    <div class="update-banner-content">
      <span>🚀 ¡Nueva versión disponible (v${esc(updateAvailableVersion)})!</span>
    </div>
    <div class="update-banner-actions">
      <button type="button" class="btn-update-apply" data-apply-update>Actualizar</button>
      <button type="button" class="btn-update-dismiss" data-dismiss-update aria-label="Descartar">✕</button>
    </div>
  </div>`;
}

function topActions() {
  if (state.phase !== "lobby") return "";
  const isDark = theme === "dark";
  const isFs = isFsActive();

  return `<div class="top-actions">
    <button type="button" class="leaderboard-toggle-btn" data-open-leaderboard aria-label="Ver Tabla de Posiciones" title="Tabla de Posiciones">
      🏆 <span>Ranking</span>
    </button>
    <button class="fullscreen-toggle ${isFs ? "active" : ""}" data-fullscreen aria-label="${isFs ? "Salir de pantalla completa" : "Pantalla completa"}" title="${isFs ? "Salir de pantalla completa" : "Pantalla completa"}">${getFullscreenSvg(isFs)}</button>
    <button class="theme-toggle" data-theme aria-label="Cambiar tema" title="Cambiar tema">${getThemeSvg(isDark)}</button>
  </div>`;
}

function screen() {
  let content = "";
  if (state.phase === "lobby") content = lobby();
  else if (state.phase === "cards") content = card();
  else if (state.phase === "briefing") content = briefing();
  else if (state.phase === "countdown") content = countdown();
  else if (state.phase === "talk") content = talk();
  else if (state.phase === "vote") content = vote();
  else if (state.phase === "suspense") content = suspense();
  else if (state.phase === "reveal") content = reveal();
  else if (state.phase === "leaderboard") content = leaderboardScreen();
  else content = lobby();

  // Modales superpuestos
  let overlay = "";
  if (showLeaderboardModal) overlay += standAloneLeaderboardModal();
  if (showTournamentWinner) overlay += tournamentWinnerModal();
  if (showResetConfirm) overlay += resetConfirmModal();

  return updateBanner() + topActions() + content + overlay;
}

// ==========================================================================
// PANTALLAS DEL JUEGO
// ==========================================================================

function getFullscreenSvg(isFs) {
  if (isFs) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 9h3a2 2 0 0 0 2-2V4m6 0v3a2 2 0 0 0 2 2h3M4 15h3a2 2 0 0 1 2 2v3m6 0v-3a2 2 0 0 1 2-2h3"/>
    </svg>`;
  }
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 8V6a2 2 0 0 1 2-2h2m8 0h2a2 2 0 0 1 2 2v2m0 8v2a2 2 0 0 1-2 2h-2m-8 0H6a2 2 0 0 1-2-2v-2"/>
  </svg>`;
}

function getThemeSvg(isDark) {
  if (isDark) {
    return `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="12,2.5 13.37,5.14 15.64,3.24 16.27,6.46 18.72,5.28 18.47,8.41 20.78,8.36 19.46,10.63 21.5,12 19.46,13.37 20.78,15.64 18.47,15.59 18.72,18.72 16.27,17.54 15.64,20.76 13.37,18.86 12,21.5 10.63,18.86 8.36,20.76 7.73,17.54 5.28,18.72 5.53,15.59 3.22,15.64 4.54,13.37 2.5,12 4.54,10.63 3.22,8.36 5.53,8.41 5.28,5.28 7.73,6.46 8.36,3.24 10.63,5.14" fill="#ffd000" stroke="#000000" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>`;
  }
  return `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#ffd000" stroke="#000000" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`;
}

function lobby() {
  const currentDeckId = state.deckId || "standard";
  const activeDeck = DECKS[currentDeckId] || DECKS.standard;
  const maxImp = maxImpostors(state.players.length);
  const reason = startBlockReason(state);

  const playersList = state.players.map((player, index) => {
    const editing = editId === player.id;
    const pRecord = players.find((p) => p.id === player.id);
    const score = pRecord?.score ?? player.score ?? 0;

    return `<li class="player" data-player-id="${player.id}" data-index="${index}">
      <button type="button" class="drag-handle" data-drag-handle aria-label="Arrastrar para mover">
        <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="3" r="1.8"/>
          <circle cx="11" cy="3" r="1.8"/>
          <circle cx="3" cy="8" r="1.8"/>
          <circle cx="11" cy="8" r="1.8"/>
          <circle cx="3" cy="13" r="1.8"/>
          <circle cx="11" cy="13" r="1.8"/>
        </svg>
      </button>
      <span class="seat">${index + 1}</span>
      ${editing
        ? `<input class="field" data-edit value="${esc(editDraft)}" maxlength="18" aria-label="Editar ${esc(player.name)}" />
             <button class="icon" data-save="${player.id}" aria-label="Guardar">✓</button>`
        : `<span class="name">${esc(player.name)}</span>
             <span class="player-score-badge" title="Puntaje acumulado">⭐ ${score}</span>
             <button class="icon" data-rename="${player.id}" aria-label="Editar ${esc(player.name)}">✎</button>`
      }
      <button class="icon" data-remove="${player.id}" aria-label="Borrar ${esc(player.name)}">✕</button>
    </li>`;
  }).join("");

  const deckCards = Object.values(DECKS).map((deck) => {
    const isSelected = deck.id === currentDeckId;
    return `<button type="button" class="deck-card ${isSelected ? "selected" : ""}" data-set-deck="${deck.id}">
      <div class="row" style="justify-content:space-between;width:100%">
        <span class="deck-icon">${deck.icon}</span>
        <span class="deck-badge ${isSelected ? "active" : ""}">${isSelected ? "✓ Activo" : deck.badge}</span>
      </div>
      <div class="deck-info">
        <span class="deck-title">${esc(deck.name)}</span>
        <span class="deck-count">${deck.words.length} palabras</span>
      </div>
      <p class="deck-desc">${esc(deck.description)}</p>
    </button>`;
  }).join("");

  // Ajustar count si excede maxImp
  const activeCount = Math.min(Math.max(1, impostorConfig.count || 1), maxImp);

  return `<header class="stack" style="margin-top:0.5rem">
      <p class="eyebrow">Para la mesa</p>
      <h1 style="font-size:3.2rem">El Impostor</h1>
      <p class="lede">Una palabra. Una pantalla. Alguien miente. 🎭</p>
    </header>

    <form class="stack" data-add>
      <label class="mute" for="name">Jugadores, en el orden de la mesa</label>
      <div class="row">
        <input id="name" class="field" maxlength="18" placeholder="Nombre" value="${esc(draft)}" autocomplete="off" />
        <button class="icon" type="submit" aria-label="Sumar jugador">+</button>
      </div>
      ${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ""}
    </form>

    ${playersList ? `<ul class="stack" style="list-style:none;padding:0;margin:0">${playersList}</ul>` : `<p class="panel mute">Sumá a quienes están sentados. Las puntuaciones se acumulan automáticamente a lo largo de las partidas.</p>`}
    
    <!-- Configuración de Impostores (Aleatorio vs Manual) -->
    <section class="panel stack">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="font-family:var(--display);font-size:1.4rem">Impostores</h2>
        <span class="tiny" style="color:var(--accent);font-weight:700">Máximo: ${maxImp}</span>
      </div>

      <div class="impostor-mode-tabs">
        <button type="button" class="mode-tab ${impostorConfig.mode === "random" ? "active" : ""}" data-impostor-mode="random">
          🎲 Aleatorio (1 a ${maxImp})
        </button>
        <button type="button" class="mode-tab ${impostorConfig.mode === "manual" ? "active" : ""}" data-impostor-mode="manual">
          🎯 Manual
        </button>
      </div>

      ${impostorConfig.mode === "manual"
      ? `<div class="impostor-count-selector">
              <span class="eyebrow" style="margin-bottom:0.15rem">Cantidad fija de impostores:</span>
              <div class="row" style="gap:0.5rem;flex-wrap:wrap">
                ${Array.from({ length: maxImp }, (_, i) => i + 1).map((n) => `
                  <button type="button" class="count-btn ${activeCount === n ? "active" : ""}" data-impostor-count="${n}">
                    ${n} 🎭
                  </button>
                `).join("")}
              </div>
            </div>`
      : `<p class="mute" style="font-size:0.95rem">
              En cada partida saldrán al azar entre <strong>1 y ${maxImp}</strong> impostores. ¡Nadie sabrá cuántos hay!
            </p>`
    }

      <p class="tiny" style="margin-top:0.25rem">⭐ <strong>Puntos:</strong> Victoria Inocente (+120 pts). Victoria Impostor (+260 pts). Infiltración perfecta (+120 pts solo si hay 2+ impostores).</p>
    </section>

    <!-- Mazo -->
    <section class="panel stack">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="font-family:var(--display);font-size:1.4rem">Elegir mazo</h2>
        <span class="tiny" style="color:var(--accent);font-weight:700">${activeDeck.words.length} palabras</span>
      </div>
      <div class="deck-grid">
        ${deckCards}
      </div>
    </section>
    
    <div class="grow stack">
      ${reason ? `<p class="tiny">${esc(reason)}</p>` : ""}
      <button class="btn" data-deal ${canStart(state) ? "" : "disabled"}>Repartir cartas 🎲</button>
      <p class="tiny">Mazo ${esc(activeDeck.name)} · ${activeDeck.words.length} palabras</p>
    </div>

    <footer class="app-footer">
      <span class="tiny mute">El Impostor v${APP_VERSION}</span>
      <button type="button" class="link-btn tiny" data-check-updates>Buscar actualización 🔄</button>
      <div class="footer-credits">
        Creado por <strong>Mustafa Herrera</strong> · Colaboradores: <em>Guillermo Rok (G. Rok)</em> & <em>Emanuel Géminis</em>
      </div>
      <div class="footer-repo">
        <a href="https://github.com/mustafaherrera-skul/Juego-del-Impostor" target="_blank" rel="noopener noreferrer" class="link-btn" style="display:inline-flex;align-items:center;gap:0.35rem;text-decoration:none;font-size:0.8rem">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          <span>Repositorio en GitHub ➔</span>
        </a>
      </div>
    </footer>`;
}

function card() {
  const player = state.players[state.cardIndex];
  const isLast = state.cardIndex >= state.players.length - 1;
  const impostor = player.role === "impostor";
  const nextPlayer = !isLast ? state.players[state.cardIndex + 1] : null;

  const secretContent = impostor
    ? `<div class="stack">
        <span class="role-badge blood">🎭 Impostor</span>
        <p class="mute">No sabés la palabra. Tu pista es:</p>
        <h1 class="word blood">${esc(state.hint)}</h1>
        <p class="lede">No digas esta pista tal cual. Disimulá y escuchá al resto.</p>
      </div>`
    : `<div class="stack">
        <span class="role-badge innocent">🛡️ Inocente</span>
        <p class="mute">La palabra secreta es</p>
        <h1 class="word innocent-word">${esc(state.word)}</h1>
        <p class="lede">Decí algo relacionado, sin dejarla servida.</p>
      </div>`;

  const coverContent = `
    <div class="stack">
      <p class="eyebrow">Tu carta</p>
      <h1 style="font-size:3.2rem">${esc(player.name)}</h1>
      <p class="lede">Mantené presionado y deslizá hacia arriba para ver tu rol.</p>
      <span class="arrow" aria-hidden>↑</span>
    </div>`;

  const nextBtnLabel = isLast
    ? "Listo, empezar la ronda ➔"
    : `Listo, pasar a ${esc(nextPlayer?.name || "siguiente")} ➔`;

  const btnLabel = cardOpen ? nextBtnLabel : "Deslizá arriba para ver tu rol 🔒";

  return `<p class="eyebrow">Carta ${state.cardIndex + 1} de ${state.players.length}</p>
    <div class="card-wrap">
      <div class="card secret-card">${secretContent}</div>
      <div class="card cover-card back" data-card>${coverContent}</div>
    </div>
    <div class="stack">
      <button class="btn paper ${cardOpen ? "" : "locked"}" data-hide ${cardOpen ? "" : "disabled"} data-next-label="${esc(nextBtnLabel)}">${btnLabel}</button>
      ${cancel()}
    </div>`;
}

function briefing() {
  return `<header class="stack">
      <p class="eyebrow">Todos vieron su carta</p>
      <h1 style="font-size:2.5rem">Empieza la ronda</h1>
      <p class="lede">Van a decir palabras relacionadas. Dos minutos de referencia, sin apuro para votar.</p>
    </header>
    <section class="panel row" style="justify-content:space-between;align-items:center">
      <div>
        <p class="eyebrow">Empieza</p>
        <p class="word" style="font-size:2.4rem">${esc(starterName())}</p>
      </div>
      <button class="icon" data-reroll aria-label="Cambiar quién empieza">↻</button>
    </section>
    <div class="grow stack">
      <button class="btn" data-begin>Empezar la ronda</button>
      ${cancel()}
    </div>`;
}

function countdown() {
  const started = state.countdownStartedAt || Date.now();
  const number = Math.max(1, 3 - Math.floor((Date.now() - started) / 1000));
  return `<div class="countdown-overlay">
    <div class="countdown-card">
      <p class="eyebrow" style="letter-spacing:0.18em">Empieza hablando</p>
      <h1 class="countdown-starter">${esc(starterName())}</h1>
      <p class="count pulse" data-count>${number}</p>
      <p class="tiny" style="letter-spacing:0.06em">¡Abran bien los oídos!</p>
    </div>
  </div>`;
}

function talk() {
  const started = state.talkStartedAt || Date.now();
  const remaining = Math.max(0, TALK_MS - (Date.now() - started));
  const timeUp = remaining === 0;
  const alivePlayers = speakingOrder(state.players, state.starterId);
  const gone = state.eliminated.map((player) => player.name);

  return `<header class="row" style="justify-content:space-between;align-items:center">
      <p class="eyebrow" style="font-size:0.85rem">Ronda ${state.round}</p>
      <span class="active-badge" style="font-size:0.95rem;font-weight:700;color:var(--accent-2)">${alivePlayers.length} en juego</span>
    </header>
    
    <section class="center" style="margin:0.2rem 0">
      <p class="eyebrow" style="font-size:0.8rem">Empieza hablando</p>
      <h1 style="font-size:3.2rem;line-height:1.1">${esc(starterName())}</h1>
    </section>
    
    <section class="stack" style="gap:0.65rem">
      <p class="clock ${timeUp ? "blood" : ""}" data-clock>${formatTime(remaining)}</p>
      <div class="bar"><span data-bar style="width:${(remaining / TALK_MS) * 100}%"></span></div>
      ${timeUp ? `<p class="center blood" role="status" style="font-size:1.15rem;font-weight:700">¡Se acabó el tiempo!</p>` : `<p class="talk-instruction">Tiempo de referencia. Pueden votar cuando todos hayan hablado.</p>`}
    </section>
    
    <!-- Orden para hablar destacado y legible -->
    <section class="speaking-order-card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <span class="eyebrow" style="font-size:0.8rem">🗣️ Orden para hablar</span>
        <span style="font-size:0.85rem;color:var(--text-mute);font-weight:600">Sentido de la mesa</span>
      </div>
      <div class="speaking-order-chips">
        ${alivePlayers.map((player, i) => `
          <span class="speaking-chip ${player.id === state.starterId ? "starter" : ""}">
            <strong class="chip-num">${i + 1}</strong>
            <span class="chip-name">${esc(player.name)}</span>
          </span>
        `).join('<span class="chip-arrow">→</span>')}
      </div>
    </section>

    ${gone.length ? `
      <div class="eliminated-summary-panel">
        <span class="eyebrow" style="color:var(--blood)">❌ Eliminados:</span>
        <span style="font-size:0.95rem">${esc(gone.join(", "))}</span>
      </div>
    ` : ""}

    <div class="grow stack" style="margin-top:1rem">
      <button class="btn" data-vote>Pasar a votar</button>
      ${cancel()}
    </div>`;
}

function vote() {
  const alive = state.players.filter((player) => player.alive);
  const selected = alive.find((player) => player.id === state.voteId);
  const choices = alive.map((player) => `
    <button type="button" class="choice ${player.id === state.voteId ? "on" : ""}" data-pick="${player.id}" aria-pressed="${player.id === state.voteId}">
      <span>${esc(player.name)}</span>
      ${player.id === state.voteId ? "<span>✓</span>" : ""}
    </button>
  `).join("");

  const confirm = state.confirming && selected
    ? `<div class="panel stack">
        <p class="center" style="font-size:1.15rem;font-weight:700">¿Sacan a ${esc(selected.name)} de la partida?</p>
        <div class="row">
          <button class="btn ghost" data-backconfirm>No, volver</button>
          <button class="btn blood" data-eliminate>Sí, sacarlo</button>
        </div>
      </div>`
    : `<button class="btn" data-ask ${selected ? "" : "disabled"}>${selected ? `Eliminar a ${esc(selected.name)}` : "Elegí a alguien"}</button>`;

  return `<header class="stack">
      <p class="eyebrow">Votación · ronda ${state.round}</p>
      <h1 style="font-size:2.4rem">¿Quién tuvo más votos?</h1>
      <p class="lede">Voten entre ustedes. Después toquen al que quedó elegido.</p>
    </header>
    <div class="stack">${choices}</div>
    <div class="grow stack">
      ${confirm}
      <button class="btn ghost" data-backtalk>Volver a la ronda</button>
    </div>`;
}

function suspense() {
  const started = state.suspenseStartedAt || Date.now();
  const elapsed = Date.now() - started;
  if (elapsed >= 3000) {
    return `<div class="countdown-overlay"></div>`;
  }
  const target = state.players.find((player) => player.id === state.voteId);
  const number = Math.max(1, 3 - Math.floor(elapsed / 1000));
  return `<div class="countdown-overlay">
    <div class="countdown-card">
      <p class="eyebrow" style="letter-spacing:0.18em">Revelando identidad...</p>
      <p class="mute" style="font-size:0.95rem;margin-bottom:-0.3rem">Se votó a</p>
      <h1 class="countdown-starter">${esc(target?.name || "Jugador")}</h1>
      <p class="count pulse" data-suspense-count>${number}</p>
      <p class="tiny" style="letter-spacing:0.06em">¿Será impostor o inocente?</p>
    </div>
  </div>`;
}

function reveal() {
  if (state.winner) {
    checkAndAwardMatchPoints();
  }

  const last = state.eliminated[state.eliminated.length - 1];
  const impostor = last?.role === "impostor";
  const aliveImpostors = state.players.filter((p) => p.alive && p.role === "impostor").length;
  const aliveInnocents = state.players.filter((p) => p.alive && p.role === "innocent").length;
  const totalAlive = aliveImpostors + aliveInnocents;

  const roleBadge = impostor
    ? `<span class="role-badge blood" style="font-size:1.05rem;padding:0.45rem 1.25rem">🎭 Era Impostor</span>`
    : `<span class="role-badge innocent" style="font-size:1.05rem;padding:0.45rem 1.25rem">🛡️ Era Inocente</span>`;

  let outcomeHtml = "";
  if (state.winner === "innocents") {
    outcomeHtml = `<div class="reveal-banner gold-banner">
      <p class="reveal-result-title gold">🏆 ¡Los inocentes ganan!</p>
      <p class="mute">Descubrieron a todos los impostores.</p>
    </div>`;
  } else if (state.winner === "impostors") {
    outcomeHtml = `<div class="reveal-banner blood-banner">
      <p class="reveal-result-title blood">💀 Los impostores ganan</p>
      <p class="mute">Quedaron la misma cantidad de impostores que de inocentes.</p>
    </div>`;
  } else if (impostor) {
    outcomeHtml = `<div class="reveal-banner ongoing-banner">
      <p class="reveal-result-title blood">¡Acertaron! Era impostor 🎭</p>
      <p class="reveal-sub"><strong>¡Ojo! Todavía quedan impostores en juego.</strong></p>
      <p class="tiny" style="margin-top:0.35rem">Quedan ${totalAlive} jugadores en la mesa. ¡A no confiarse!</p>
    </div>`;
  } else {
    outcomeHtml = `<div class="reveal-banner innocent-banner">
      <p class="reveal-result-title blood">¡Se equivocaron! No era impostor 🛡️</p>
      <p class="reveal-sub"><strong>¡Aún faltan impostores por descubrir!</strong></p>
      <p class="tiny" style="margin-top:0.35rem">Sigue la partida entre los ${totalAlive} jugadores que quedan activos.</p>
    </div>`;
  }

  const wordHtml = state.winner && state.word
    ? `<div class="paper stack" style="margin-top:0.5rem">
        <p class="secret">La palabra secreta era</p>
        <p class="word gold" style="font-size:clamp(2rem, 7vw, 3rem)">${esc(state.word)}</p>
      </div>`
    : "";

  let actionBtn = "";
  if (state.winner) {
    actionBtn = `<button class="btn" data-to-leaderboard>Ver Tabla de Posiciones 🏆</button>`;
  } else {
    actionBtn = `<button class="btn paper" data-next>Siguiente ronda ➔</button>
      <button class="btn ghost" data-revote style="font-weight:700">Hacer otra votación 🗳️</button>`;
  }

  return `<header class="stack">
      <p class="eyebrow">Resultado de la votación</p>
    </header>
    <div class="reveal-card ${impostor ? "impostor-caught" : "innocent-lost"}">
      <div class="stack" style="align-items:center;gap:0.85rem;width:100%">
        ${roleBadge}
        <h1 class="reveal-name">${esc(last?.name || "")}</h1>
        ${outcomeHtml}
      </div>
    </div>
    ${wordHtml}
    <div class="grow stack" style="margin-top:0.5rem">
      ${actionBtn}
    </div>`;
}

// ==========================================================================
// PANTALLA DE LEADERBOARD POST-PARTIDA (CON ANIMACIÓN DE PUNTOS)
// ==========================================================================

function leaderboardScreen() {
  const results = tournamentStats.lastGameResults;

  if (!results) {
    return standAloneLeaderboardView();
  }

  const { winner, word, deltas, beforeStandings, afterStandings } = results;
  const sourceStandings = leaderboardAnimPlayed ? afterStandings : beforeStandings;

  const rowsHtml = sourceStandings.map((player, index) => {
    const deltaInfo = deltas[player.id];
    const ptsWon = deltaInfo ? deltaInfo.total : 0;
    const isImpostor = deltaInfo?.role === "impostor";
    const roleIcon = isImpostor ? "🎭" : "🛡️";

    let reasonText = "";
    if (deltaInfo?.breakdown?.length) {
      reasonText = deltaInfo.breakdown.map((b) => `${b.label}: +${b.pts}`).join(" · ");
    }

    const oldIndex = beforeStandings.findIndex((p) => p.id === player.id);
    const newIndex = afterStandings.findIndex((p) => p.id === player.id);
    const scoreToShow = leaderboardAnimPlayed
      ? afterStandings.find((p) => p.id === player.id)?.score ?? player.score
      : player.score;

    let rankLabel = `${index + 1}°`;
    let rowClasses = "lb-row";
    let overtakeTagStyle = "display:none";
    let overtakeTagContent = "";

    if (leaderboardAnimPlayed) {
      if (index === 0) {
        rankLabel = "🥇";
        rowClasses += " first-place";
      } else if (index === 1) {
        rankLabel = "🥈";
        rowClasses += " second-place";
      } else if (index === 2) {
        rankLabel = "🥉";
        rowClasses += " third-place";
      }

      if (newIndex < oldIndex) {
        const jump = oldIndex - newIndex;
        rowClasses += " climbed";
        overtakeTagStyle = "display:inline-flex";
        overtakeTagContent = `▲ +${jump} puesto${jump > 1 ? "s" : ""}!`;
      } else if (newIndex > oldIndex) {
        const drop = newIndex - oldIndex;
        overtakeTagStyle = "display:inline-flex; border-color:var(--blood); color:var(--blood)";
        overtakeTagContent = `▼ -${drop}`;
      }
    }

    return `<div class="${rowClasses}" data-player-row="${player.id}" data-old-index="${oldIndex}">
      <div class="lb-rank" data-rank-display>${rankLabel}</div>
      <div class="lb-avatar">
        ${esc(player.name.slice(0, 1).toUpperCase())}
        <span class="lb-role-icon">${roleIcon}</span>
      </div>
      <div class="lb-player-info">
        <div class="lb-name-row">
          <span class="lb-name">${esc(player.name)}</span>
          <span class="lb-overtake-badge" data-overtake-tag style="${overtakeTagStyle}">${overtakeTagContent}</span>
        </div>
        <span class="lb-reason">${esc(reasonText)}</span>
      </div>
      <div class="lb-score-col">
        <span class="lb-total-score" data-score-num="${player.id}">${scoreToShow} pts</span>
        <span class="lb-delta-badge ${leaderboardAnimPlayed ? "show" : ""} ${ptsWon === 0 ? "zero" : ""}" data-delta-tag="${player.id}">
          +${ptsWon} pts
        </span>
      </div>
    </div>`;
  }).join("");

  const breakdownRows = Object.values(deltas).map((d) => {
    const items = d.breakdown.map((item) => `
      <div class="lb-breakdown-item">
        <span>${esc(item.label)}</span>
        <strong>+${item.pts} pts</strong>
      </div>
    `).join("");

    return `<div class="stack" style="gap:0.25rem">
      <div class="row" style="justify-content:space-between">
        <strong style="color:var(--text)">${esc(d.name)} (${d.role === "impostor" ? "🎭 Impostor" : "🛡️ Inocente"})</strong>
        <strong style="color:var(--gold)">+${d.total} pts</strong>
      </div>
      <div style="padding-left:0.5rem">${items}</div>
    </div>`;
  }).join("");

  return `<div class="leaderboard-stage">
    <div class="lb-header-box">
      <span class="eyebrow">Partida finalizada</span>
      <h1 style="font-size:2.2rem">Tabla de Posiciones 🏆</h1>
      <div class="lb-match-badge ${winner}">
        ${winner === "innocents" ? "🛡️ Ganaron los Inocentes" : "🎭 Ganaron los Impostores"}
      </div>
      ${word ? `<p class="tiny" style="margin-top:0.25rem">Palabra secreta: <strong style="color:var(--gold)">${esc(word)}</strong></p>` : ""}
    </div>

    <!-- Lista de Posiciones -->
    <div class="lb-list" id="lb-list">
      ${rowsHtml}
    </div>

    <div class="stack" style="margin-top:0.25rem">
      <button type="button" class="btn ghost" data-toggle-breakdown style="min-height:2.6rem;font-size:0.85rem">
        Ver desglose detallado de puntos ▼
      </button>
      <div class="lb-breakdown-details" id="lb-breakdown-panel" style="display:none">
        ${breakdownRows}
      </div>
    </div>

    <!-- Opciones de Torneo -->
    <div class="row" style="gap:0.5rem;margin-top:0.5rem">
      <button type="button" class="btn tournament-btn" data-finish-tournament>🏆 Terminar Torneo</button>
      <button type="button" class="btn ghost danger-text" data-ask-reset-scores>↺ Reiniciar Puntos</button>
    </div>

    <div class="grow stack" style="margin-top:0.75rem">
      <button class="btn" data-deal-next>Otra partida 🎲</button>
      <button class="link" data-replay-anim style="margin-top:-0.25rem">↺ Repetir animación de puntos</button>
      <button class="btn ghost" data-lobby style="margin-top:0.25rem">Volver a la mesa 🏠</button>
    </div>
  </div>`;
}

function triggerLeaderboardAnimation(results) {
  if (leaderboardAnimTimer) clearTimeout(leaderboardAnimTimer);

  const listNode = root.querySelector("#lb-list");
  if (!listNode) return;

  const rows = Array.from(listNode.querySelectorAll(".lb-row"));
  if (!rows.length) return;

  // Fase 1: Revelación de nuevos puntos y conteo numérico (t = 450ms)
  leaderboardAnimTimer = setTimeout(() => {
    // Aparecen los badges con rebote
    root.querySelectorAll("[data-delta-tag]").forEach((badge) => {
      badge.classList.add("show");
    });

    // Contador ascendente de puntuación
    const duration = 950;
    const start = performance.now();

    const animateCount = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease out

      results.beforeStandings.forEach((bp) => {
        const ap = results.afterStandings.find((p) => p.id === bp.id);
        const targetScore = ap ? ap.score : bp.score;
        const current = Math.round(bp.score + (targetScore - bp.score) * ease);
        const node = root.querySelector(`[data-score-num="${bp.id}"]`);
        if (node) node.textContent = `${current} pts`;
      });

      if (progress < 1) {
        requestAnimationFrame(animateCount);
      }
    };
    requestAnimationFrame(animateCount);
  }, 450);

  // Fase 2: FLIP Reorder perfecto (First, Last, Invert, Play) sin superposiciones (t = 1650ms)
  setTimeout(() => {
    const currentList = root.querySelector("#lb-list");
    if (!currentList) return;
    const currentRows = Array.from(currentList.querySelectorAll(".lb-row"));
    if (currentRows.length < 2) return;

    // 1. FIRST: Medir la posición 'top' real de cada elemento antes de moverlo en el DOM
    const firstTops = new Map();
    currentRows.forEach((el) => {
      firstTops.set(el.dataset.playerRow, el.getBoundingClientRect().top);
    });

    // 2. REORDER DOM: Reordenar los elementos físicamente en el DOM según afterStandings
    let overtookAny = false;
    results.afterStandings.forEach((ap, newIndex) => {
      const el = currentList.querySelector(`[data-player-row="${ap.id}"]`);
      if (!el) return;
      currentList.appendChild(el);

      const oldIndex = results.beforeStandings.findIndex((p) => p.id === ap.id);

      // Actualizar medalla y puesto
      const rankNode = el.querySelector("[data-rank-display]");
      if (rankNode) {
        let label = `${newIndex + 1}°`;
        el.classList.remove("first-place", "second-place", "third-place");
        if (newIndex === 0) {
          label = "🥇";
          el.classList.add("first-place");
        } else if (newIndex === 1) {
          label = "🥈";
          el.classList.add("second-place");
        } else if (newIndex === 2) {
          label = "🥉";
          el.classList.add("third-place");
        }
        rankNode.textContent = label;
      }

      // Mostrar indicadores de superación o caída
      const tag = el.querySelector("[data-overtake-tag]");
      if (tag) {
        if (newIndex < oldIndex) {
          overtookAny = true;
          const jump = oldIndex - newIndex;
          el.classList.add("climbed");
          tag.style.display = "inline-flex";
          tag.textContent = `▲ +${jump} puesto${jump > 1 ? "s" : ""}!`;
        } else if (newIndex > oldIndex) {
          const drop = newIndex - oldIndex;
          tag.style.display = "inline-flex";
          tag.style.borderColor = "var(--blood)";
          tag.style.color = "var(--blood)";
          tag.textContent = `▼ -${drop}`;
        }
      }
    });

    // 3. LAST & INVERT: Medir la nueva posición y colocar el transform inverso
    currentRows.forEach((el) => {
      const id = el.dataset.playerRow;
      const firstTop = firstTops.get(id);
      const lastTop = el.getBoundingClientRect().top;
      const deltaY = firstTop - lastTop;

      if (deltaY !== 0) {
        el.style.transition = "none";
        el.style.transform = `translateY(${deltaY}px)`;
        el.style.zIndex = deltaY > 0 ? "10" : "1";
      }
    });

    // 4. Forzar reflow para registrar las posiciones invertidas
    void currentList.offsetHeight;

    // 5. PLAY: Animar suavemente hasta su posición natural (translateY 0)
    requestAnimationFrame(() => {
      currentRows.forEach((el) => {
        el.style.transition = "transform 0.75s cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 0.3s";
        el.style.transform = "translateY(0px)";
      });
    });

    // Limpiar estilos inline al finalizar la animación
    setTimeout(() => {
      currentRows.forEach((el) => {
        el.style.transform = "";
        el.style.transition = "";
        el.style.zIndex = "";
      });
    }, 850);

    if (overtookAny) {
      burst();
    }
  }, 1650);
}

function standAloneLeaderboardView() {
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

  const rows = sorted.map((player, index) => {
    let rankBadge = `${index + 1}°`;
    let rowClass = "";
    if (index === 0 && player.score > 0) {
      rankBadge = "🥇";
      rowClass = "first-place";
    } else if (index === 1 && player.score > 0) {
      rankBadge = "🥈";
      rowClass = "second-place";
    } else if (index === 2 && player.score > 0) {
      rankBadge = "🥉";
      rowClass = "third-place";
    }

    return `<div class="lb-row ${rowClass}">
      <div class="lb-rank">${rankBadge}</div>
      <div class="lb-avatar">${esc(player.name.slice(0, 1).toUpperCase())}</div>
      <div class="lb-player-info">
        <span class="lb-name">${esc(player.name)}</span>
        <span class="lb-reason">${player.wins || 0} victorias · ${player.gamesPlayed || 0} jugadas</span>
      </div>
      <div class="lb-score-col">
        <span class="lb-total-score">⭐ ${player.score || 0}</span>
      </div>
    </div>`;
  }).join("");

  return `<div class="leaderboard-stage">
    <div class="lb-header-box">
      <span class="eyebrow">Tabla general acumulada</span>
      <h1 style="font-size:2.2rem">Ranking del Torneo 🏆</h1>
      <p class="mute">${tournamentStats.gamesCount || 0} partidas jugadas en este torneo</p>
    </div>
    <div class="lb-list">
      ${rows || `<p class="mute center" style="padding:1.5rem">Aún no hay jugadores registrados.</p>`}
    </div>

    <!-- Opciones de Torneo -->
    <div class="row" style="gap:0.5rem;margin-top:0.75rem">
      <button type="button" class="btn tournament-btn" data-finish-tournament>🏆 Terminar Torneo</button>
      <button type="button" class="btn ghost danger-text" data-ask-reset-scores>↺ Reiniciar Puntos</button>
    </div>

    <div class="grow stack" style="margin-top:0.75rem">
      <button class="btn" data-lobby>Volver a la mesa 🏠</button>
    </div>
  </div>`;
}

// ==========================================================================
// MODALES (LEADERBOARD, GANADOR DEL TORNEO, REINICIAR PUNTOS)
// ==========================================================================

function standAloneLeaderboardModal() {
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

  const rows = sorted.map((player, index) => {
    let rankBadge = `${index + 1}°`;
    let rowClass = "";
    if (index === 0 && player.score > 0) {
      rankBadge = "🥇";
      rowClass = "first-place";
    } else if (index === 1 && player.score > 0) {
      rankBadge = "🥈";
      rowClass = "second-place";
    } else if (index === 2 && player.score > 0) {
      rankBadge = "🥉";
      rowClass = "third-place";
    }

    return `<div class="lb-row ${rowClass}" style="padding:0.6rem 0.85rem">
      <div class="lb-rank">${rankBadge}</div>
      <div class="lb-avatar" style="width:2.2rem;height:2.2rem;font-size:0.9rem">${esc(player.name.slice(0, 1).toUpperCase())}</div>
      <div class="lb-player-info">
        <span class="lb-name" style="font-size:1rem">${esc(player.name)}</span>
        <span class="lb-reason">${player.wins || 0} victorias · ${player.gamesPlayed || 0} jugadas</span>
      </div>
      <div class="lb-score-col">
        <span class="lb-total-score" style="font-size:1.15rem">⭐ ${player.score || 0}</span>
      </div>
    </div>`;
  }).join("");

  return `<div class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Tabla de Posiciones</span>
          <h2 class="modal-title">Ranking del Torneo 🏆</h2>
        </div>
        <button type="button" class="modal-close" data-close-modal aria-label="Cerrar">✕</button>
      </div>
      <p class="tiny" style="text-align:left">${tournamentStats.gamesCount || 0} partidas jugadas en este torneo</p>
      
      <div class="lb-list">
        ${rows || `<p class="mute center" style="padding:1.5rem">Aún no hay jugadores registrados.</p>`}
      </div>

      <div class="row" style="gap:0.5rem;margin-top:0.75rem">
        <button type="button" class="btn tournament-btn" data-finish-tournament>🏆 Terminar Torneo</button>
        <button type="button" class="btn ghost danger-text" data-ask-reset-scores>↺ Reiniciar Puntos</button>
      </div>

      <div class="backup-section">
        <p class="tiny" style="font-weight:700;color:var(--text-mute);margin-bottom:0.4rem">💾 Resguardo y Copia de Seguridad:</p>
        <div class="row" style="gap:0.5rem">
          <button type="button" class="btn ghost btn-sm" data-export-data>Exportar Datos</button>
          <button type="button" class="btn ghost btn-sm" data-import-data>Restaurar Datos</button>
        </div>
      </div>

      <button type="button" class="btn ghost" data-close-modal style="margin-top:0.25rem">Cerrar</button>
    </div>
  </div>`;
}

function tournamentWinnerModal() {
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const champion = sorted[0];
  const p2 = sorted[1];
  const p3 = sorted[2];

  if (!champion || champion.score === 0) {
    return `<div class="modal-overlay">
      <div class="modal-card">
        <div class="modal-header">
          <h2 class="modal-title">Torneo</h2>
          <button type="button" class="modal-close" data-close-modal>✕</button>
        </div>
        <p class="mute center" style="padding:1.5rem">Aún no hay puntuaciones acumuladas para definir un ganador.</p>
        <button type="button" class="btn ghost" data-close-modal>Cerrar</button>
      </div>
    </div>`;
  }

  return `<div class="modal-overlay">
    <div class="modal-card">
      <div class="winner-card-inner">
        <span class="winner-crown">👑</span>
        <div class="winner-avatar-lg">${esc(champion.name.slice(0, 1).toUpperCase())}</div>
        <span class="eyebrow" style="font-size:0.85rem;letter-spacing:0.18em">¡CAMPEÓN DEL TORNEO!</span>
        <h2 class="winner-champion-title">${esc(champion.name)}</h2>
        
        <div class="winner-score-highlight">
          ⭐ ${champion.score || 0} pts
        </div>
        <p class="mute" style="font-size:0.95rem">
          ${champion.wins || 0} victorias · ${champion.gamesPlayed || 0} partidas jugadas
        </p>

        <!-- Podio Top 3 -->
        <div class="winner-podium">
          ${p2 ? `
            <div class="podium-col rank-2">
              <div class="podium-avatar">${esc(p2.name.slice(0, 1).toUpperCase())}</div>
              <span class="podium-name">${esc(p2.name)}</span>
              <div class="podium-step">
                <span>🥈 2°</span>
                <span style="font-size:0.8rem">${p2.score || 0} pts</span>
              </div>
            </div>
          ` : ""}
          <div class="podium-col rank-1">
            <div class="podium-avatar">👑</div>
            <span class="podium-name">${esc(champion.name)}</span>
            <div class="podium-step">
              <span>🥇 1°</span>
              <span style="font-size:0.85rem">${champion.score || 0} pts</span>
            </div>
          </div>
          ${p3 ? `
            <div class="podium-col rank-3">
              <div class="podium-avatar">${esc(p3.name.slice(0, 1).toUpperCase())}</div>
              <span class="podium-name">${esc(p3.name)}</span>
              <div class="podium-step">
                <span>🥉 3°</span>
                <span style="font-size:0.8rem">${p3.score || 0} pts</span>
              </div>
            </div>
          ` : ""}
        </div>

        <p class="tiny" style="color:var(--text-mute)">Al empezar un nuevo torneo, todos los puntos volverán a 0.</p>
        
        <div class="stack" style="width:100%;margin-top:0.75rem">
          <button type="button" class="btn tournament-btn" data-confirm-new-tournament>
            Empezar nuevo torneo
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function resetConfirmModal() {
  return `<div class="modal-overlay">
    <div class="modal-card">
      <div class="modal-header">
        <h2 class="modal-title">Reiniciar Puntuaciones ↺</h2>
        <button type="button" class="modal-close" data-close-modal>✕</button>
      </div>
      <p style="font-size:1.05rem;line-height:1.4">
        ¿Estás seguro de que querés reiniciar a <strong>0 puntos</strong> a todos los jugadores sin terminar el torneo?
      </p>
      <p class="mute" style="font-size:0.9rem">Esta acción borrará los puntos acumulados de todos.</p>
      <div class="row" style="margin-top:0.75rem">
        <button type="button" class="btn ghost" data-close-modal>Cancelar</button>
        <button type="button" class="btn blood" data-confirm-reset-scores>Sí, reiniciar a 0</button>
      </div>
    </div>
  </div>`;
}

function cancel() {
  if (!cancelAsk) return `<button class="link" data-cancel>Cancelar partida</button>`;
  return `<div class="panel stack">
    <p class="mute">¿Volver a la mesa? Se borran los roles de esta partida.</p>
    <div class="row">
      <button class="btn ghost" data-keep>Seguir</button>
      <button class="btn blood" data-lobby>Sí, cancelar</button>
    </div>
  </div>`;
}

// ==========================================================================
// EVENTOS Y CONTROLADORES
// ==========================================================================

function initEvents() {
  // Manejo de clics
  root.addEventListener("click", (event) => {
    // Si el clic fue directamente en el fondo oscuro del modal, lo cerramos
    if (event.target.classList.contains("modal-overlay")) {
      if (showTournamentWinner) return;
      showLeaderboardModal = false;
      showResetConfirm = false;
      render();
      return;
    }

    const target = event.target.closest("button") || event.target.closest("[data-close-modal]");
    if (!target) return;

    // Si la pantalla completa está activa en preferencias y se salió (ej. swipe o teclado), re-activar en esta interacción del usuario
    if (fullscreenPreference && !isFsActive() && target.dataset.fullscreen == null) {
      ensureFullscreenIfPreferred();
    }

    // Abrir tabla de posiciones
    if (target.dataset.openLeaderboard != null) {
      showLeaderboardModal = true;
      render();
      return;
    }

    // Cerrar cualquier modal
    if (target.dataset.closeModal != null) {
      showLeaderboardModal = false;
      showTournamentWinner = false;
      showResetConfirm = false;
      render();
      return;
    }

    // Configuración de modo de impostores (aleatorio vs manual)
    if (target.dataset.impostorMode != null) {
      impostorConfig.mode = target.dataset.impostorMode;
      saveImpostorConfig();
      render();
      return;
    }
    if (target.dataset.impostorCount != null) {
      impostorConfig.count = parseInt(target.dataset.impostorCount, 10);
      saveImpostorConfig();
      render();
      return;
    }

    // Terminar torneo (mostrar ganador)
    if (target.dataset.finishTournament != null) {
      showLeaderboardModal = false;
      showTournamentWinner = true;
      render();
      burst(); // Confeti para celebrar al ganador
      return;
    }

    // Confirmar nuevo torneo desde el modal del ganador
    if (target.dataset.confirmNewTournament != null) {
      resetTournamentScores();
      return;
    }

    // Pedir confirmación para reiniciar puntos a 0
    if (target.dataset.askResetScores != null) {
      showResetConfirm = true;
      render();
      return;
    }

    // Confirmar reinicio directo de puntos
    if (target.dataset.confirmResetScores != null) {
      resetTournamentScores();
      return;
    }

    // Transiciones de Leaderboard
    if (target.dataset.toLeaderboard != null) {
      leaderboardAnimPlayed = false;
      dispatch({ type: "toLeaderboard" });
      return;
    }
    if (target.dataset.toggleBreakdown != null) {
      const panel = root.querySelector("#lb-breakdown-panel");
      if (panel) {
        const isHidden = panel.style.display === "none";
        panel.style.display = isHidden ? "flex" : "none";
        target.textContent = isHidden ? "Ocultar detalle de puntos ▲" : "Ver desglose detallado de puntos ▼";
      }
      return;
    }
    // Manejo de actualización de app y resguardo de datos
    if (target.dataset.applyUpdate != null) {
      window.location.href = window.location.pathname + "?v=" + encodeURIComponent(updateAvailableVersion || Date.now());
      return;
    }
    if (target.dataset.dismissUpdate != null) {
      updateDismissed = true;
      render();
      return;
    }
    if (target.dataset.checkUpdates != null) {
      checkAppVersion(true);
      return;
    }
    if (target.dataset.exportData != null) {
      exportTournamentData();
      return;
    }
    if (target.dataset.importData != null) {
      importTournamentData();
      return;
    }

    if (target.dataset.dealNext != null) {
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
      if (fullscreenPreference) {
        requestAppFullscreen();
      }
      dispatch({ type: "toLobby" });
      deal();
      return;
    }

    // Controles estándar de partida
    if (target.dataset.deal != null) {
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
      if (fullscreenPreference) {
        requestAppFullscreen();
      }
      deal();
      return;
    }
    if (target.dataset.fullscreen != null) {
      toggleAppFullscreen();
      return;
    }
    if (target.dataset.theme != null) {
      theme = theme === "dark" ? "light" : "dark";
      localStorage.setItem("el-impostor-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
      render();
      return;
    }
    if (target.dataset.remove) {
      const idToRemove = target.dataset.remove;
      players = players.filter((p) => p.id !== idToRemove);
      savePlayers();
      dispatch({ type: "remove", id: idToRemove });
      return;
    }
    if (target.dataset.rename) {
      editId = target.dataset.rename;
      editDraft = state.players.find((player) => player.id === editId)?.name || "";
      render();
      return;
    }
    if (target.dataset.save) {
      if (editDraft.trim()) {
        const cleanName = normalizeName(editDraft);
        dispatch({ type: "rename", id: target.dataset.save, name: cleanName });
        const p = players.find((player) => player.id === target.dataset.save);
        if (p) {
          p.name = cleanName;
          savePlayers();
        }
      }
      editId = null;
      render();
      return;
    }
    if (target.dataset.hide != null) {
      const wrap = root.querySelector(".card-wrap");
      if (wrap) {
        wrap.classList.add("exiting");
        setTimeout(() => {
          dispatch({ type: "hideCard", now: Date.now() });
        }, 160);
      } else {
        dispatch({ type: "hideCard", now: Date.now() });
      }
      return;
    }
    if (target.dataset.arm != null) dispatch({ type: "armNext" });
    if (target.dataset.reroll != null) {
      const pool = state.players.filter((player) => player.id !== state.starterId);
      const source = pool.length ? pool : state.players;
      dispatch({ type: "rerollStarter", starterId: source[Math.floor(Math.random() * source.length)].id });
      return;
    }
    if (target.dataset.begin != null) dispatch({ type: "beginCountdown", now: Date.now() });
    if (target.dataset.vote != null) dispatch({ type: "toVote" });
    if (target.dataset.backtalk != null) dispatch({ type: "backToTalk" });
    if (target.dataset.pick != null) dispatch({ type: "selectVote", id: target.dataset.pick });
    if (target.dataset.ask != null) dispatch({ type: "askConfirm" });
    if (target.dataset.backconfirm != null) dispatch({ type: "cancelConfirm" });
    if (target.dataset.eliminate != null) dispatch({ type: "beginSuspense", now: Date.now() });
    if (target.dataset.next != null) dispatch({ type: "nextRound", now: Date.now() });
    if (target.dataset.revote != null) dispatch({ type: "voteAgain" });
    if (target.dataset.lobby != null) dispatch({ type: "toLobby" });
    if (target.dataset.cancel != null) {
      cancelAsk = true;
      render();
      return;
    }
    if (target.dataset.keep != null) {
      cancelAsk = false;
      render();
      return;
    }
    if (target.dataset.setDeck != null) {
      dispatch({ type: "setDeck", deckId: target.dataset.setDeck });
      return;
    }
  });

  // Envío de formulario para añadir jugador
  root.addEventListener("submit", (event) => {
    if (event.target.matches("[data-add]")) {
      event.preventDefault();
      addPlayer();
    }
  });

  // Inputs de nombre
  root.addEventListener("input", (event) => {
    if (event.target.id === "name") {
      draft = event.target.value;
      if (error) {
        error = "";
        const alertNode = root.querySelector(".alert");
        if (alertNode) alertNode.remove();
      }
    }
    if (event.target.matches("[data-edit]")) {
      editDraft = event.target.value;
    }
  });

  // Escuchar cambios de pantalla completa con soporte multiplataforma
  document.addEventListener("fullscreenchange", updateFullscreenUi);
  document.addEventListener("webkitfullscreenchange", updateFullscreenUi);
  document.addEventListener("mozfullscreenchange", updateFullscreenUi);
  document.addEventListener("MSFullscreenChange", updateFullscreenUi);

  // Comprobar automáticamente actualizaciones en segundo plano
  checkAppVersion(false);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkAppVersion(false);
  });

  setupDragEvents();
}

// ==========================================================================
// ARRASTRAR Y REORDENAR JUGADORES
// ==========================================================================

let draggingPlayerId = null;

function setupDragEvents() {
  root.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-drag-handle]");
    if (!handle) return;
    const item = handle.closest(".player");
    if (!item) return;
    if (editId) return;

    const allItems = Array.from(root.querySelectorAll(".player"));
    if (allItems.length < 2) return;

    event.preventDefault();
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch { }

    draggingPlayerId = item.dataset.playerId;
    const fromIndex = allItems.indexOf(item);
    if (fromIndex === -1) return;

    let currentIndex = fromIndex;
    const startY = event.clientY;

    const r0 = allItems[0].getBoundingClientRect();
    const r1 = allItems[1].getBoundingClientRect();
    const itemHeight = r1.top - r0.top;

    item.classList.add("dragging");
    item.style.zIndex = "100";
    item.style.transition = "none";
    item.style.pointerEvents = "none";

    allItems.forEach((el) => {
      if (el !== item) {
        el.style.transition = "transform 0.22s cubic-bezier(0.2, 0, 0, 1)";
      }
    });

    const onPointerMove = (e) => {
      if (!draggingPlayerId) return;
      const deltaY = e.clientY - startY;

      item.style.transform = `translateY(${deltaY}px) scale(1.03) rotate(0.6deg)`;

      const rawOffset = Math.round(deltaY / itemHeight);
      const targetIndex = Math.max(0, Math.min(allItems.length - 1, fromIndex + rawOffset));

      if (targetIndex !== currentIndex) {
        currentIndex = targetIndex;

        allItems.forEach((el, i) => {
          if (i === fromIndex) return;
          if (fromIndex < currentIndex) {
            if (i > fromIndex && i <= currentIndex) {
              el.style.transform = `translateY(-${itemHeight}px)`;
            } else {
              el.style.transform = "";
            }
          } else if (fromIndex > currentIndex) {
            if (i >= currentIndex && i < fromIndex) {
              el.style.transform = `translateY(${itemHeight}px)`;
            } else {
              el.style.transform = "";
            }
          } else {
            el.style.transform = "";
          }
        });
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      if (!draggingPlayerId) return;

      const finalOffset = (currentIndex - fromIndex) * itemHeight;
      item.style.transition = "transform 0.18s cubic-bezier(0.2, 0, 0, 1)";
      item.style.transform = `translateY(${finalOffset}px) scale(1)`;

      setTimeout(() => {
        allItems.forEach((el) => {
          el.style.transform = "";
          el.style.transition = "";
          el.style.zIndex = "";
          el.style.pointerEvents = "";
          el.classList.remove("dragging");
        });

        const movedFrom = fromIndex;
        const movedTo = currentIndex;
        draggingPlayerId = null;

        if (movedFrom !== movedTo) {
          const [moved] = players.splice(movedFrom, 1);
          players.splice(movedTo, 0, moved);
          savePlayers();
          dispatch({ type: "reorder", from: movedFrom, to: movedTo });
        }
      }, 180);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });
}

// ==========================================================================
// DESLIZAR CARTA PARA VER ROL
// ==========================================================================

let swipeY = 0;
let swiping = false;
let currentCardNode = null;

function onSwipeStart(event) {
  swiping = true;
  swipeY = event.clientY;
  currentCardNode = event.currentTarget;
  currentCardNode.style.transition = "none";
  try {
    currentCardNode.setPointerCapture?.(event.pointerId);
  } catch { }
  currentCardNode.addEventListener("pointermove", onSwipeMove);
  currentCardNode.addEventListener("pointerup", onSwipeEnd, { once: true });
  currentCardNode.addEventListener("pointercancel", onSwipeCancel, { once: true });
}

function onSwipeMove(event) {
  if (!swiping || !currentCardNode) return;
  const delta = Math.min(0, event.clientY - swipeY);
  const clamped = Math.max(-330, delta);
  currentCardNode.style.transform = `translateY(${clamped}px)`;

  if (delta < -110 && !cardOpen) {
    cardOpen = true;
    const hideBtn = root.querySelector("[data-hide]");
    if (hideBtn) {
      hideBtn.disabled = false;
      hideBtn.classList.remove("locked");
      const nextLabel = hideBtn.dataset.nextLabel;
      if (nextLabel) hideBtn.textContent = nextLabel;
    }
  }
}

function onSwipeEnd() {
  if (!currentCardNode) return;
  swiping = false;
  const node = currentCardNode;
  currentCardNode = null;
  node.removeEventListener("pointermove", onSwipeMove);
  node.style.transition = "transform 0.28s cubic-bezier(0.2, 0.95, 0.3, 1)";
  node.style.transform = "translateY(0px)";
}

function onSwipeCancel() {
  if (!currentCardNode) return;
  swiping = false;
  const node = currentCardNode;
  currentCardNode = null;
  node.removeEventListener("pointermove", onSwipeMove);
  node.style.transition = "transform 0.28s cubic-bezier(0.2, 0.95, 0.3, 1)";
  node.style.transform = "translateY(0px)";
}

// ==========================================================================
// TEMPORIZADORES Y CONFETI
// ==========================================================================

function clock() {
  const loop = () => {
    if (state.phase === "countdown") {
      const started = state.countdownStartedAt || Date.now();
      const number = 3 - Math.floor((Date.now() - started) / 1000);
      if (number <= 0) {
        dispatch({ type: "beginTalk", now: Date.now() });
        return;
      }
      const node = root.querySelector("[data-count]");
      if (node && node.textContent !== String(number)) {
        node.textContent = String(number);
        node.classList.remove("pulse");
        void node.offsetWidth;
        node.classList.add("pulse");
      }
    }
    if (state.phase === "suspense") {
      const started = state.suspenseStartedAt || Date.now();
      const elapsed = Date.now() - started;
      if (elapsed >= 4200) {
        dispatch({ type: "confirmEliminate" });
        return;
      }
      if (elapsed >= 3000) {
        const card = root.querySelector(".countdown-card");
        if (card) {
          card.style.display = "none";
        }
      } else {
        const number = 3 - Math.floor(elapsed / 1000);
        const node = root.querySelector("[data-suspense-count]");
        if (node && node.textContent !== String(number)) {
          node.textContent = String(number);
          node.classList.remove("pulse");
          void node.offsetWidth;
          node.classList.add("pulse");
        }
      }
    }
    if (state.phase === "talk") {
      const remaining = Math.max(0, TALK_MS - (Date.now() - (state.talkStartedAt || Date.now())));
      const node = root.querySelector("[data-clock]");
      const bar = root.querySelector("[data-bar]");
      if (node) node.textContent = formatTime(remaining);
      if (bar) bar.style.width = `${(remaining / TALK_MS) * 100}%`;
      if (remaining === 0) {
        if (node && !node.classList.contains("blood")) {
          node.classList.add("blood");
          render();
        }
        return;
      }
    }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

function burst() {
  const canvas = document.querySelector("#confetti");
  if (!canvas) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  canvas.style.display = "block";
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * ratio);
  canvas.height = Math.floor(innerHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const colors = ["#ff6b9d", "#4ecdc4", "#ffe66d", "#ff9ff3", "#54a0ff", "#ff6b6b"];
  const bits = Array.from({ length: 140 }, () => ({
    x: Math.random() * innerWidth,
    y: -30 - Math.random() * 300,
    w: 5 + Math.random() * 8,
    h: 7 + Math.random() * 10,
    vy: 2 + Math.random() * 3.5,
    vx: -2 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    rotSpeed: -0.1 + Math.random() * 0.2,
    color: colors[Math.floor(Math.random() * colors.length)],
    shape: Math.random() > 0.6 ? "circle" : "rect",
  }));
  const started = performance.now();
  const draw = (time) => {
    context.clearRect(0, 0, innerWidth, innerHeight);
    for (const bit of bits) {
      bit.y += bit.vy;
      bit.x += bit.vx;
      bit.vy += 0.04;
      bit.rot += bit.rotSpeed;
      if (bit.y > innerHeight + 20) continue;
      context.save();
      context.translate(bit.x, bit.y);
      context.rotate(bit.rot);
      context.fillStyle = bit.color;
      if (bit.shape === "circle") {
        context.beginPath();
        context.arc(0, 0, bit.w / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
      }
      context.restore();
    }
    if (time - started < 5000) requestAnimationFrame(draw);
    else canvas.style.display = "none";
  };
  requestAnimationFrame(draw);
}

// Inicializar la aplicación
initEvents();
render();

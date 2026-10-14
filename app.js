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
} from "./engine.js";

const KEY = "el-impostor-pages-v1";
const root = document.querySelector("#app");
let state = load();
let draft = "";
let editId = null;
let editDraft = "";
let error = "";
let cardOpen = false;
let cancelAsk = false;
let frame = 0;
let theme = localStorage.getItem("el-impostor-theme") || "dark";
document.documentElement.setAttribute("data-theme", theme);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createInitial();
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.players)) return createInitial();
    let deckId = data.deckId || "standard";
    if (deckId === "test") deckId = "custom";
    if (!DECKS[deckId]) deckId = "standard";
    return { ...createInitial(), ...data, deckId, players: data.players, eliminated: data.eliminated || [] };
  } catch {
    return createInitial();
  }
}

function save() {
  const copy = { ...state };
  localStorage.setItem(KEY, JSON.stringify(copy));
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&" + "amp;";
    if (char === "<") return "&" + "lt;";
    if (char === ">") return "&" + "gt;";
    if (char === '"') return "&" + "quot;";
    return "&" + "#39;";
  });
}

function dispatch(action) {
  const next = reducer(state, action);
  if (next === state) return;
  if (next.phase !== state.phase || next.cardIndex !== state.cardIndex || next.passing !== state.passing) cardOpen = false;
  state = next;
  cancelAsk = false;
  save();
  render();
}

function pickWord() {
  const currentDeckId = state.deckId || "standard";
  const deck = DECKS[currentDeckId] || DECKS.standard;
  const wordList = deck.words && deck.words.length ? deck.words : WORDS;

  let recent = [];
  const storageKey = `el-impostor-pages-recent-${currentDeckId}`;
  try { recent = JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { recent = []; }
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
  const impostorCount = 1 + Math.floor(Math.random() * maxImp);
  const impostorIds = shuffle(state.players.map((player) => player.id)).slice(0, impostorCount);
  const starter = state.players[Math.floor(Math.random() * state.players.length)];
  dispatch({ type: "deal", word: entry.word, hint: entry.hint, impostorIds, starterId: starter.id, impostorCount });
}

function addPlayer() {
  const name = normalizeName(draft);
  if (!name) return setError("Escribí un nombre.");
  if (state.players.some((player) => player.name.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"))) return setError("Ese nombre ya está.");
  if (state.players.length >= 20) return setError("Máximo 20 jugadores.");
  error = "";
  draft = "";
  dispatch({ type: "add", id: crypto.randomUUID(), name });
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

function render() {
  cancelAnimationFrame(frame);
  const canvas = document.querySelector("#confetti");
  canvas.style.display = "none";
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

  if (state.winner === "innocents") burst();
  if (state.phase === "countdown" || state.phase === "talk" || state.phase === "suspense") clock();
}

function screen() {
  if (state.phase === "lobby") return lobby();
  if (state.phase === "cards") return card();
  if (state.phase === "briefing") return briefing();
  if (state.phase === "countdown") return countdown();
  if (state.phase === "talk") return talk();
  if (state.phase === "vote") return vote();
  if (state.phase === "suspense") return suspense();
  if (state.phase === "reveal") return reveal();
  return lobby();
}

function lobby() {
  const currentDeckId = state.deckId || "standard";
  const activeDeck = DECKS[currentDeckId] || DECKS.standard;
  const maxImp = maxImpostors(state.players.length);
  const reason = startBlockReason(state);
  const players = state.players.map((player, index) => {
    const editing = editId === player.id;
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
           <button class="icon" data-rename="${player.id}" aria-label="Editar ${esc(player.name)}">✎</button>`}
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

  const themeIcon = theme === "dark" ? "☀️" : "🌙";
  return `<button class="theme-toggle" data-theme aria-label="Cambiar tema">${themeIcon}</button>
    <header class="stack"><p class="eyebrow">Para la mesa</p><h1 style="font-size:3.2rem">El Impostor</h1><p class="lede">Una palabra. Una pantalla. Alguien miente. 🎭</p></header>
    <form class="stack" data-add>
      <label class="mute" for="name">Jugadores, en el orden de la mesa</label>
      <div class="row"><input id="name" class="field" maxlength="18" placeholder="Nombre" value="${esc(draft)}" autocomplete="off" />
      <button class="icon" type="submit" aria-label="Sumar jugador">+</button></div>
      ${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ""}
    </form>
    ${players ? `<ul class="stack" style="list-style:none;padding:0;margin:0">${players}</ul>` : `<p class="panel mute">Sumá a quienes están sentados. Después van a ver su carta de a uno, sin que el resto mire.</p>`}
    <section class="panel stack">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="font-family:var(--display);font-size:1.4rem">Elegir mazo</h2>
        <span class="tiny" style="color:var(--accent);font-weight:700">${activeDeck.words.length} palabras</span>
      </div>
      <div class="deck-grid">
        ${deckCards}
      </div>
    </section>
    <section class="panel stack">
      <h2 style="font-family:var(--display);font-size:1.4rem">Impostores al azar</h2>
      <p class="mute">${state.players.length < 3 ? "Con 3 o más jugadores se puede empezar." : `Con ${state.players.length} jugadores salen entre 1 y ${maxImp} impostores (aleatorio).`}</p>
      <p class="tiny">Siempre hay más inocentes que impostores. Los impostores ganan si quedan iguales. Los inocentes ganan si los sacan a todos.</p>
    </section>
    <div class="grow stack">
      ${reason ? `<p class="tiny">${esc(reason)}</p>` : ""}
      <button class="btn" data-deal ${canStart(state) ? "" : "disabled"}>Repartir cartas 🎲</button>
      <p class="tiny">Mazo ${esc(activeDeck.name)} · ${activeDeck.words.length} palabras</p>
    </div>`;
}

function pass() {
  const next = state.players[state.cardIndex + 1];
  return `<header class="stack"><p class="eyebrow">Pasá el teléfono</p><h1 style="font-size:2.4rem">Ahora le toca a ${esc(next?.name || "")}</h1><p class="lede">Cuando nadie más esté mirando, abrí la carta tapada.</p></header>
    <div class="grow stack"><button class="btn" data-arm>Soy ${esc(next?.name || "")}</button>${cancel()}</div>`;
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

  const btnLabel = cardOpen
    ? nextBtnLabel
    : "Deslizá arriba para ver tu rol 🔒";

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
  return `<header class="stack"><p class="eyebrow">Todos vieron su carta</p><h1 style="font-size:2.5rem">Empieza la ronda</h1><p class="lede">Van a decir palabras relacionadas. Dos minutos de referencia, sin apuro para votar.</p></header>
    <section class="panel row" style="justify-content:space-between;align-items:center"><div><p class="eyebrow">Empieza</p><p class="word" style="font-size:2.4rem">${esc(starterName())}</p></div><button class="icon" data-reroll aria-label="Cambiar quién empieza">↻</button></section>
    <div class="grow stack"><button class="btn" data-begin>Empezar la ronda</button>${cancel()}</div>`;
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
  const order = speakingOrder(state.players, state.starterId).map((player) => player.name).join(" → ");
  const gone = state.eliminated.map((player) => player.name).join(", ");
  return `<header class="row" style="justify-content:space-between"><p class="eyebrow">Ronda ${state.round}</p><p class="mute">${state.players.filter((player) => player.alive).length} en juego</p></header>
    <section class="center"><p class="eyebrow">Empieza</p><h1 style="font-size:3rem">${esc(starterName())}</h1></section>
    <section class="stack"><p class="clock ${timeUp ? "blood" : ""}" data-clock>${formatTime(remaining)}</p><div class="bar"><span data-bar style="width:${(remaining / TALK_MS) * 100}%"></span></div>
    ${timeUp ? `<p class="center blood" role="status">¡Se acabó el tiempo!</p>` : `<p class="tiny">Tiempo de referencia. Pueden votar cuando terminen de hablar.</p>`}</section>
    <p class="tiny">Orden: ${esc(order)}</p>
    ${gone ? `<p class="tiny">Afuera: ${esc(gone)}</p>` : ""}
    <div class="grow stack"><button class="btn" data-vote>Pasar a votar</button>${cancel()}</div>`;
}

function vote() {
  const alive = state.players.filter((player) => player.alive);
  const selected = alive.find((player) => player.id === state.voteId);
  const choices = alive.map((player) => `<button class="choice ${player.id === state.voteId ? "on" : ""}" data-pick="${player.id}" aria-pressed="${player.id === state.voteId}">${esc(player.name)}</button>`).join("");
  const confirm = state.confirming && selected
    ? `<div class="panel stack"><p class="center">¿Sacan a ${esc(selected.name)} de la partida?</p><div class="row"><button class="btn ghost" data-backconfirm>No, volver</button><button class="btn blood" data-eliminate>Sí, sacarlo</button></div></div>`
    : `<button class="btn" data-ask ${selected ? "" : "disabled"}>${selected ? `Eliminar a ${esc(selected.name)}` : "Elegí a alguien"}</button>`;
  return `<header class="stack"><p class="eyebrow">Votación · ronda ${state.round}</p><h1 style="font-size:2.4rem">¿Quién tuvo más votos?</h1><p class="lede">Voten entre ustedes. Después toquen al que quedó elegido.</p></header>
    <div class="stack">${choices}</div><div class="grow stack">${confirm}<button class="btn ghost" data-backtalk>Volver a la ronda</button></div>`;
}

function suspense() {
  const target = state.players.find((player) => player.id === state.voteId);
  const started = state.suspenseStartedAt || Date.now();
  const number = Math.max(1, 3 - Math.floor((Date.now() - started) / 1000));
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
      <p class="mute">Descubrieron a todos los impostores de la sala.</p>
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

  const wordHtml = (state.winner && state.word)
    ? `<div class="paper stack" style="margin-top:0.5rem">
        <p class="secret">La palabra secreta era</p>
        <p class="word gold" style="font-size:clamp(2rem, 7vw, 3rem)">${esc(state.word)}</p>
      </div>`
    : "";

  const actionBtn = state.winner
    ? `<button class="btn" data-lobby>Otra partida 🎲</button>`
    : `<button class="btn paper" data-next>Siguiente ronda ➔</button>
       <button class="btn ghost" data-revote style="font-weight:700">Hacer otra votación 🗳️</button>`;

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

function cancel() {
  if (!cancelAsk) return `<button class="link" data-cancel>Cancelar partida</button>`;
  return `<div class="panel stack"><p class="mute">¿Volver a la mesa? Se borran los roles de esta partida.</p><div class="row"><button class="btn ghost" data-keep>Seguir</button><button class="btn blood" data-lobby>Sí, cancelar</button></div></div>`;
}

function initEvents() {
  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.deal != null) deal();
    if (target.dataset.theme != null) {
      theme = theme === "dark" ? "light" : "dark";
      localStorage.setItem("el-impostor-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
      render();
    }
    if (target.dataset.remove) dispatch({ type: "remove", id: target.dataset.remove });
    if (target.dataset.rename) {
      editId = target.dataset.rename;
      editDraft = state.players.find((player) => player.id === editId)?.name || "";
      render();
    }
    if (target.dataset.save) {
      if (editDraft.trim()) {
        dispatch({ type: "rename", id: target.dataset.save, name: editDraft });
      }
      editId = null;
      render();
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
    }
    if (target.dataset.arm != null) dispatch({ type: "armNext" });
    if (target.dataset.reroll != null) {
      const pool = state.players.filter((player) => player.id !== state.starterId);
      const source = pool.length ? pool : state.players;
      dispatch({ type: "rerollStarter", starterId: source[Math.floor(Math.random() * source.length)].id });
    }
    if (target.dataset.begin != null) dispatch({ type: "beginCountdown", now: Date.now() });
    if (target.dataset.vote != null) dispatch({ type: "toVote" });
    if (target.dataset.pick) dispatch({ type: "selectVote", id: target.dataset.pick });
    if (target.dataset.ask != null) dispatch({ type: "askConfirm" });
    if (target.dataset.backconfirm != null) dispatch({ type: "cancelConfirm" });
    if (target.dataset.eliminate != null) dispatch({ type: "beginSuspense", now: Date.now() });
    if (target.dataset.backtalk != null) dispatch({ type: "backToTalk" });
    if (target.dataset.next != null) dispatch({ type: "nextRound", now: Date.now() });
    if (target.dataset.revote != null) dispatch({ type: "voteAgain" });
    if (target.dataset.setDeck) dispatch({ type: "setDeck", deckId: target.dataset.setDeck });
    if (target.dataset.lobby != null) { editId = null; dispatch({ type: "toLobby" }); }
    if (target.dataset.cancel != null) { cancelAsk = true; render(); }
    if (target.dataset.keep != null) { cancelAsk = false; render(); }
  });

  root.addEventListener("submit", (event) => {
    if (event.target.matches("[data-add]")) {
      event.preventDefault();
      addPlayer();
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.id === "name") {
      draft = event.target.value;
    } else if (event.target.matches("[data-edit]")) {
      editDraft = event.target.value;
    }
  });

  root.addEventListener("keydown", (event) => {
    if (event.target.matches("[data-edit]")) {
      if (event.key === "Enter") {
        event.preventDefault();
        if (editId && editDraft.trim()) {
          dispatch({ type: "rename", id: editId, name: editDraft });
        }
        editId = null;
        render();
      } else if (event.key === "Escape") {
        editId = null;
        render();
      }
    }
  });
  setupDragEvents();
}

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
    try { handle.setPointerCapture?.(event.pointerId); } catch { /* ignore */ }

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

      // Elemento arrastrado sigue suavemente al cursor
      item.style.transform = `translateY(${deltaY}px) scale(1.03) rotate(0.6deg)`;

      // Cálculo de la posición destino
      const rawOffset = Math.round(deltaY / itemHeight);
      const targetIndex = Math.max(0, Math.min(allItems.length - 1, fromIndex + rawOffset));

      if (targetIndex !== currentIndex) {
        currentIndex = targetIndex;

        // Desplazamiento animado de los otros elementos para abrir paso
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

      // Animación de encaje al soltar
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
          dispatch({ type: "reorder", from: movedFrom, to: movedTo });
        }
      }, 180);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });
}

let swipeY = 0;
let swiping = false;
let currentCardNode = null;

function onSwipeStart(event) {
  swiping = true;
  swipeY = event.clientY;
  currentCardNode = event.currentTarget;
  currentCardNode.style.transition = "none";
  try { currentCardNode.setPointerCapture?.(event.pointerId); } catch { /* ignore */ }
  currentCardNode.addEventListener("pointermove", onSwipeMove);
  currentCardNode.addEventListener("pointerup", onSwipeEnd, { once: true });
  currentCardNode.addEventListener("pointercancel", onSwipeCancel, { once: true });
}

function onSwipeMove(event) {
  if (!swiping || !currentCardNode) return;
  const delta = Math.min(0, event.clientY - swipeY);
  const clamped = Math.max(-330, delta);
  currentCardNode.style.transform = `translateY(${clamped}px)`;

  // Desbloqueo dinámico de la carta cuando se levanta al menos 110px
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
      const number = 3 - Math.floor((Date.now() - started) / 1000);
      if (number <= 0) {
        dispatch({ type: "confirmEliminate" });
        return;
      }
      const node = root.querySelector("[data-suspense-count]");
      if (node && node.textContent !== String(number)) {
        node.textContent = String(number);
        node.classList.remove("pulse");
        void node.offsetWidth;
        node.classList.add("pulse");
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
    if (time - started < 5000 && state.winner === "innocents") requestAnimationFrame(draw);
    else canvas.style.display = "none";
  };
  requestAnimationFrame(draw);
}

initEvents();
render();

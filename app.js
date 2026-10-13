import { WORDS } from "./words.js";
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
    return { ...createInitial(), ...data, players: data.players, eliminated: data.eliminated || [] };
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
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem("el-impostor-pages-recent") || "[]"); } catch { recent = []; }
  const skip = new Set(recent);
  const pool = WORDS.filter((entry) => !skip.has(entry.word));
  const list = pool.length ? pool : WORDS;
  const entry = list[Math.floor(Math.random() * list.length)];
  localStorage.setItem("el-impostor-pages-recent", JSON.stringify([entry.word, ...recent.filter((word) => word !== entry.word)].slice(0, 80)));
  return entry;
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
  bind();
  if (state.winner === "innocents") burst();
  if (state.phase === "countdown" || state.phase === "talk") clock();
}

function screen() {
  if (state.phase === "lobby") return lobby();
  if (state.phase === "cards") return state.passing ? pass() : card();
  if (state.phase === "briefing") return briefing();
  if (state.phase === "countdown") return countdown();
  if (state.phase === "talk") return talk();
  if (state.phase === "vote") return vote();
  if (state.phase === "reveal") return reveal();
  return lobby();
}

function lobby() {
  const maxImp = maxImpostors(state.players.length);
  const reason = startBlockReason(state);
  const players = state.players.map((player, index) => {
    const editing = editId === player.id;
    return `<li class="player">
      <span class="seat">${index + 1}</span>
      ${editing
        ? `<input class="field" data-edit value="${esc(editDraft)}" maxlength="18" aria-label="Editar ${esc(player.name)}" />
           <button class="icon" data-save="${player.id}" aria-label="Guardar">✓</button>`
        : `<span class="name">${esc(player.name)}</span>
           <button class="icon" data-rename="${player.id}" aria-label="Editar ${esc(player.name)}">✎</button>`}
      <button class="icon" data-move="${index}" data-dir="-1" ${index === 0 ? "disabled" : ""} aria-label="Subir">↑</button>
      <button class="icon" data-move="${index}" data-dir="1" ${index === state.players.length - 1 ? "disabled" : ""} aria-label="Bajar">↓</button>
      <button class="icon" data-remove="${player.id}" aria-label="Borrar ${esc(player.name)}">✕</button>
    </li>`;
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
      <h2 style="font-family:var(--display);font-size:1.4rem">Impostores al azar</h2>
      <p class="mute">${state.players.length < 3 ? "Con 3 o más jugadores se puede empezar." : `Con ${state.players.length} jugadores salen entre 1 y ${maxImp} impostores (aleatorio).`}</p>
      <p class="tiny">Siempre hay más inocentes que impostores. Los impostores ganan si quedan iguales. Los inocentes ganan si los sacan a todos.</p>
    </section>
    <div class="grow stack">
      ${reason ? `<p class="tiny">${esc(reason)}</p>` : ""}
      <button class="btn" data-deal ${canStart(state) ? "" : "disabled"}>Repartir cartas 🎲</button>
      <p class="tiny">Mazo de ${WORDS.length} palabras</p>
    </div>`;
}

function pass() {
  const next = state.players[state.cardIndex + 1];
  return `<header class="stack"><p class="eyebrow">Pasá el teléfono</p><h1 style="font-size:2.4rem">Ahora le toca a ${esc(next.name)}</h1><p class="lede">Cuando nadie más esté mirando, abrí la carta tapada.</p></header>
    <div class="grow stack"><button class="btn" data-arm>Soy ${esc(next.name)}</button>${cancel()}</div>`;
}

function card() {
  const player = state.players[state.cardIndex];
  const impostor = player.role === "impostor";
  const face = cardOpen
    ? impostor
      ? `<div class="stack"><p class="secret blood">Impostor</p><p class="mute">No sabés la palabra. No digas esta pista tal cual.</p><h1 class="word gold">${esc(state.hint)}</h1></div>`
      : `<div class="stack"><p class="secret">Inocente</p><p class="mute">La palabra es</p><h1 class="word">${esc(state.word)}</h1><p class="lede">Decí algo relacionado, sin dejarla servida.</p></div>`
    : `<div class="stack"><span class="seal">EI</span><p class="eyebrow">Tu carta</p><h1 style="font-size:3rem">${esc(player.name)}</h1><p class="lede">Cuando nadie mire, deslizá hacia arriba.</p><span class="arrow" aria-hidden>↑</span></div>`;
  return `<p class="eyebrow">Carta ${state.cardIndex + 1} de ${state.players.length}</p>
    <div class="card ${cardOpen ? (impostor ? "impostor" : "innocent") : "back"}" data-card>${face}</div>
    <div class="stack">${cardOpen ? `<button class="btn ${impostor ? "blood" : "paper"}" data-hide>Ocultar y pasar</button>` : `<button class="btn ghost" data-open>Revelar mi carta</button>`}${cancel()}</div>`;
}

function briefing() {
  return `<header class="stack"><p class="eyebrow">Todos vieron su carta</p><h1 style="font-size:2.5rem">Empieza la ronda</h1><p class="lede">Van a decir palabras relacionadas. Dos minutos de referencia, sin apuro para votar.</p></header>
    <section class="panel row" style="justify-content:space-between;align-items:center"><div><p class="eyebrow">Empieza</p><p class="word" style="font-size:2.4rem">${esc(starterName())}</p></div><button class="icon" data-reroll aria-label="Cambiar quién empieza">↻</button></section>
    <div class="grow stack"><button class="btn" data-begin>Empezar la ronda</button>${cancel()}</div>`;
}

function countdown() {
  const started = state.countdownStartedAt || Date.now();
  const number = Math.max(1, 3 - Math.floor((Date.now() - started) / 1000));
  return `<div class="center stack" style="margin:auto"><p class="eyebrow">Empieza</p><h1 style="font-size:2.6rem">${esc(starterName())}</h1><p class="count" data-count>${number}</p></div>`;
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

function reveal() {
  const last = state.eliminated[state.eliminated.length - 1];
  const impostor = last.role === "impostor";
  let outcome = "";
  if (state.winner === "innocents") outcome = `<div class="center"><p class="word gold">¡Los inocentes ganan!</p><p class="lede">No quedó ningún impostor en la sala.</p></div>`;
  else if (state.winner === "impostors") outcome = `<div class="center"><p class="word blood">Los impostores ganan</p><p class="lede">Quedaron la misma cantidad de impostores que de inocentes.</p></div>`;
  else if (impostor) outcome = `<p class="center" style="font-size:1.15rem">Aún hay impostores en la sala.</p>`;
  else outcome = `<p class="center mute">Era inocente. La palabra sigue en juego.</p>`;
  const word = state.winner && state.word ? `<div class="paper"><p class="secret">La palabra era</p><p class="word">${esc(state.word)}</p></div>` : "";
  return `<header class="center stack"><p class="eyebrow">${esc(last.name)}</p><p class="mute">era</p><h1 class="${impostor ? "blood" : ""}" style="font-size:3rem">${impostor ? "Impostor" : "Inocente"}</h1></header>
    ${outcome}${word}
    <div class="grow">${state.winner ? `<button class="btn" data-lobby>Otra partida</button>` : `<button class="btn" data-next>Siguiente ronda</button>`}</div>`;
}

function cancel() {
  if (!cancelAsk) return `<button class="link" data-cancel>Cancelar partida</button>`;
  return `<div class="panel stack"><p class="mute">¿Volver a la mesa? Se borran los roles de esta partida.</p><div class="row"><button class="btn ghost" data-keep>Seguir</button><button class="btn blood" data-lobby>Sí, cancelar</button></div></div>`;
}

function bind() {
  const form = root.querySelector("[data-add]");
  const input = root.querySelector("#name");
  if (form && input) {
    input.addEventListener("input", () => { draft = input.value; });
    form.addEventListener("submit", (event) => { event.preventDefault(); addPlayer(); });
  }
  root.querySelector("[data-edit]")?.addEventListener("input", (event) => { editDraft = event.target.value; });
  root.querySelector("[data-card]")?.addEventListener("pointerdown", onSwipeStart);
  on(root, "click", (event) => {
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
    if (target.dataset.move) dispatch({ type: "move", index: Number(target.dataset.move), dir: Number(target.dataset.dir) });
    if (target.dataset.rename) { editId = target.dataset.rename; editDraft = state.players.find((player) => player.id === editId)?.name || ""; render(); }
    if (target.dataset.save) {
      dispatch({ type: "rename", id: target.dataset.save, name: editDraft });
      editId = null;
      render();
    }
    if (target.dataset.open != null) cardOpen = true, render();
    if (target.dataset.hide != null) dispatch({ type: "hideCard" });
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
    if (target.dataset.eliminate != null) dispatch({ type: "confirmEliminate" });
    if (target.dataset.backtalk != null) dispatch({ type: "backToTalk" });
    if (target.dataset.next != null) dispatch({ type: "nextRound", now: Date.now() });
    if (target.dataset.lobby != null) { editId = null; dispatch({ type: "toLobby" }); }
    if (target.dataset.cancel != null) { cancelAsk = true; render(); }
    if (target.dataset.keep != null) { cancelAsk = false; render(); }
  });
}

let swipeY = 0;
let swiping = false;
function onSwipeStart(event) {
  if (cardOpen) return;
  swiping = true;
  swipeY = event.clientY;
  try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* ignore */ }
  event.currentTarget.addEventListener("pointermove", onSwipeMove);
  event.currentTarget.addEventListener("pointerup", onSwipeEnd, { once: true });
}
function onSwipeMove(event) {
  if (!swiping) return;
  const delta = Math.min(0, event.clientY - swipeY);
  event.currentTarget.style.transform = `translateY(${delta}px)`;
  event.currentTarget.dataset.delta = String(delta);
}
function onSwipeEnd(event) {
  swiping = false;
  const delta = Number(event.currentTarget.dataset.delta || 0);
  event.currentTarget.style.transform = "";
  if (delta < -96) { cardOpen = true; render(); }
}

function clock() {
  const loop = () => {
    if (state.phase === "countdown") {
      const started = state.countdownStartedAt || Date.now();
      const number = 3 - Math.floor((Date.now() - started) / 1000);
      if (number <= 0) { dispatch({ type: "beginTalk", now: Date.now() }); return; }
      const node = root.querySelector("[data-count]");
      if (node) node.textContent = String(number);
    }
    if (state.phase === "talk") {
      const remaining = Math.max(0, TALK_MS - (Date.now() - (state.talkStartedAt || Date.now())));
      const node = root.querySelector("[data-clock]");
      const bar = root.querySelector("[data-bar]");
      if (node) node.textContent = formatTime(remaining);
      if (bar) bar.style.width = `${(remaining / TALK_MS) * 100}%`;
      if (remaining === 0 && node && !node.classList.contains("blood")) render();
    }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

function on(node, type, handler) { node.addEventListener(type, handler); }

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

render();

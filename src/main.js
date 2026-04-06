import { getInitialSnapshot, subscribeToScoreboard } from "./live-score.js";
import { demoGames } from "./mock-score.js";

const elements = {
  matchTitle: document.querySelector("#match-title"),
  awayCode: document.querySelector("#away-code"),
  awayName: document.querySelector("#away-name"),
  awayScore: document.querySelector("#away-score"),
  awayMeta: document.querySelector("#away-meta"),
  homeCode: document.querySelector("#home-code"),
  homeName: document.querySelector("#home-name"),
  homeScore: document.querySelector("#home-score"),
  homeMeta: document.querySelector("#home-meta"),
  arena: document.querySelector("#arena"),
  tipoff: document.querySelector("#tipoff"),
  gamePhase: document.querySelector("#game-phase"),
  gameClock: document.querySelector("#game-clock"),
  gameStatus: document.querySelector("#game-status"),
  nextGameButton: document.querySelector("#cycle-match"),
  source: document.querySelector("#data-source"),
  livePill: document.querySelector("#live-pill")
};

const state = {
  activeGameIndex: 0,
  games: demoGames,
  source: "demo",
  updatedAt: "Using local demo NBA scoreboard"
};

function validateElements() {
  return Object.values(elements).every(Boolean);
}

function getDisplayedGames() {
  return state.games.length > 0 ? state.games : demoGames;
}

function renderGame(game) {
  elements.matchTitle.textContent = game.headline || `${game.awayTeam.code} at ${game.homeTeam.code}`;
  elements.awayCode.textContent = game.awayTeam.code;
  elements.awayName.textContent = game.awayTeam.name || "Away";
  elements.awayScore.textContent = game.awayTeam.score || "0";
  elements.awayMeta.textContent = game.awayTeam.record || "";
  elements.homeCode.textContent = game.homeTeam.code;
  elements.homeName.textContent = game.homeTeam.name || "Home";
  elements.homeScore.textContent = game.homeTeam.score || "0";
  elements.homeMeta.textContent = game.homeTeam.record || "";
  elements.arena.textContent = game.arena || "Arena unavailable";
  elements.tipoff.textContent = game.startTime || "Tip-off TBD";
  elements.gamePhase.textContent = game.period || game.seriesText || "NBA";
  elements.gameClock.textContent = game.clock || "--:--";
  elements.gameStatus.textContent = game.statusText || state.updatedAt;
}

function updateHeader() {
  const usingLive = state.source === "nba-live" && state.games.length > 0;
  elements.source.textContent = usingLive ? `NBA LIVE FEED • ${state.games.length} GAMES` : "NBA DEMO FEED";
  elements.livePill.textContent = usingLive ? "PUSH" : "DEMO";
  elements.livePill.classList.toggle("live-pill--demo", !usingLive);
}

function renderCurrentGame() {
  const games = getDisplayedGames();
  state.activeGameIndex = state.activeGameIndex % games.length;
  renderGame(games[state.activeGameIndex]);
  elements.nextGameButton.textContent = games.length > 1 ? "Next Game" : "Refreshing";
}

function applySnapshot(snapshot) {
  if (snapshot.games.length > 0) {
    const currentGameId = getDisplayedGames()[state.activeGameIndex]?.id;
    state.games = snapshot.games;
    state.source = snapshot.source;
    state.updatedAt = snapshot.updatedAt;

    if (currentGameId) {
      const preservedIndex = snapshot.games.findIndex((game) => game.id === currentGameId);
      state.activeGameIndex = preservedIndex >= 0 ? preservedIndex : 0;
    } else {
      state.activeGameIndex = 0;
    }
  } else {
    state.source = snapshot.source;
    state.updatedAt = snapshot.updatedAt;
  }

  updateHeader();
  renderCurrentGame();
}

function cycleGame() {
  const games = getDisplayedGames();
  if (games.length <= 1) {
    return;
  }

  state.activeGameIndex = (state.activeGameIndex + 1) % games.length;
  renderCurrentGame();
}

async function init() {
  if (!validateElements()) {
    console.error("NBA overlay UI failed to initialize.", elements);
    return;
  }

  elements.nextGameButton.addEventListener("click", cycleGame);
  updateHeader();
  renderCurrentGame();

  try {
    const snapshot = await getInitialSnapshot();
    applySnapshot(snapshot);
  } catch (error) {
    console.error("Failed to fetch initial NBA snapshot", error);
  }

  try {
    await subscribeToScoreboard((snapshot) => {
      applySnapshot(snapshot);
    });
  } catch (error) {
    console.error("Failed to subscribe to NBA scoreboard updates", error);
  }
}

init();

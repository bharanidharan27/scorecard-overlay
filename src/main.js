import { demoMatches } from "./mock-score.js";
import { fetchLiveMatches, IPL_KEYWORDS } from "./live-score.js";

const STORAGE_KEY = "scorecard-overlay:cricapi-key";
const REFRESH_INTERVAL_MS = 20_000;

const elements = {
  matchTitle: document.querySelector("#match-title"),
  battingTeam: document.querySelector("#batting-team"),
  battingScore: document.querySelector("#batting-score"),
  battingOvers: document.querySelector("#batting-overs"),
  bowlingTeam: document.querySelector("#bowling-team"),
  bowlingScore: document.querySelector("#bowling-score"),
  bowlingOvers: document.querySelector("#bowling-overs"),
  currentBatters: document.querySelector("#current-batters"),
  runRate: document.querySelector("#run-rate"),
  lastOver: document.querySelector("#last-over"),
  matchStatus: document.querySelector("#match-status"),
  cycleButton: document.querySelector("#cycle-match"),
  dataSource: document.querySelector("#data-source"),
  livePill: document.querySelector("#live-pill"),
  toggleSettings: document.querySelector("#toggle-settings"),
  settingsPanel: document.querySelector("#settings-panel"),
  apiKeyInput: document.querySelector("#api-key"),
  saveApiKey: document.querySelector("#save-api-key"),
  settingsHelp: document.querySelector("#settings-help")
};

const state = {
  activeMatchIndex: 0,
  apiKey: window.localStorage.getItem(STORAGE_KEY) || "",
  liveMatches: [],
  mode: "demo",
  lastError: ""
};

function createDemoOverlayMatch(match) {
  const state = match.timeline[0];

  return {
    id: `${match.home.short}-${match.away.short}`,
    competition: "Demo IPL",
    current: state.current,
    isLive: true,
    lastOver: state.lastOver,
    matchTitle: `${match.home.short} vs ${match.away.short}`,
    runRate: state.runRate,
    status: state.status,
    battingOvers: `${state.batting.overs} overs`,
    battingScore: `${state.batting.score}/${state.batting.wickets}`,
    battingTeam: state.batting.short,
    bowlingMeta: state.chase,
    bowlingNote: state.bowling.note,
    bowlingTeam: state.bowling.short
  };
}

function getDisplayedMatches() {
  if (state.mode === "live" && state.liveMatches.length > 0) {
    return state.liveMatches;
  }

  return demoMatches.map(createDemoOverlayMatch);
}

function formatError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error && typeof error === "object") {
    const candidates = [error.message, error.error, error.reason, error.details];
    const text = candidates.find((value) => typeof value === "string" && value.trim());
    if (text) {
      return text;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return "Unknown error while contacting the live score service.";
}

function renderMatch(match) {
  elements.matchTitle.textContent = match.matchTitle || "Match unavailable";
  elements.battingTeam.textContent = match.battingTeam || "-";
  elements.battingScore.textContent = match.battingScore || "-";
  elements.battingOvers.textContent = match.battingOvers || "Overs unavailable";
  elements.bowlingTeam.textContent = match.bowlingTeam || "-";
  elements.bowlingScore.textContent = match.bowlingNote || "Yet to bat";
  elements.bowlingOvers.textContent = match.bowlingMeta || "Target pending";
  elements.currentBatters.textContent = match.current || "Live score";
  elements.runRate.textContent = match.runRate || "-";
  elements.lastOver.textContent = match.lastOver || "Not provided";
  elements.matchStatus.textContent = match.status || "Waiting for updates";
}

function renderEmptyState(message) {
  renderMatch({
    matchTitle: "No live matches found",
    battingTeam: "-",
    battingScore: "-",
    battingOvers: "Waiting for play",
    bowlingTeam: "-",
    bowlingNote: "-",
    bowlingMeta: "-",
    current: "Try again later",
    runRate: "-",
    lastOver: "-",
    status: message
  });
}

function updateHeader() {
  const liveCount = state.liveMatches.length;
  const isLiveMode = state.mode === "live" && liveCount > 0;

  elements.dataSource.textContent = isLiveMode
    ? liveCount === 1
      ? "LIVE IPL SOURCE"
      : `LIVE IPL SOURCE • ${liveCount} MATCHES`
    : "DEMO OVERLAY";

  elements.livePill.textContent = isLiveMode ? "LIVE" : "DEMO";
  elements.livePill.classList.toggle("live-pill--demo", !isLiveMode);

  if (state.lastError) {
    elements.settingsHelp.textContent = state.lastError;
  } else if (state.apiKey) {
    elements.settingsHelp.textContent = "Live fetch is enabled. The overlay prefers IPL matches and refreshes automatically every 20 seconds.";
  } else {
    elements.settingsHelp.textContent = "Paste a CricAPI key to switch from demo scores to live current matches. The key is stored only on this computer.";
  }
}

function renderCurrentMatch() {
  const matches = getDisplayedMatches();

  if (matches.length === 0) {
    renderEmptyState("No current matches were returned by the API.");
    return;
  }

  state.activeMatchIndex = state.activeMatchIndex % matches.length;
  renderMatch(matches[state.activeMatchIndex]);
  elements.cycleButton.textContent = matches.length > 1 ? "Next Match" : "Refresh";
}

function applyLiveMatches(matches) {
  const prioritized = prioritizeMatches(matches);

  if (prioritized.length > 0) {
    state.liveMatches = prioritized;
    state.mode = "live";
    state.activeMatchIndex = 0;
    state.lastError = "";
    return;
  }

  state.liveMatches = [];
  state.mode = "demo";
  state.lastError = "No live IPL match was found, so the overlay is showing demo data.";
}

function prioritizeMatches(matches) {
  const liveOnly = matches.filter((match) => match.isLive);
  const ipls = liveOnly.filter((match) => {
    const haystack = `${match.matchTitle} ${match.competition}`.toLowerCase();
    return IPL_KEYWORDS.some((keyword) => haystack.includes(keyword));
  });

  if (ipls.length > 0) {
    return ipls;
  }

  return liveOnly;
}

async function refreshScores() {
  if (!state.apiKey) {
    state.mode = "demo";
    state.liveMatches = [];
    state.lastError = "";
    updateHeader();
    renderCurrentMatch();
    return;
  }

  try {
    const matches = await fetchLiveMatches(state.apiKey);
    applyLiveMatches(matches);
  } catch (error) {
    state.mode = "demo";
    state.liveMatches = [];
    state.lastError = `Live fetch failed: ${formatError(error)}`;
  }

  updateHeader();
  renderCurrentMatch();
}

function cycleMatch() {
  const matches = getDisplayedMatches();

  if (matches.length <= 1) {
    refreshScores();
    return;
  }

  state.activeMatchIndex = (state.activeMatchIndex + 1) % matches.length;
  renderCurrentMatch();
}

function toggleSettingsPanel() {
  const hidden = elements.settingsPanel.classList.toggle("is-hidden");
  elements.toggleSettings.textContent = hidden ? "API" : "Close";

  if (!hidden) {
    elements.apiKeyInput.focus();
    elements.apiKeyInput.select();
  }
}

function saveApiKey() {
  state.apiKey = elements.apiKeyInput.value.trim();

  if (state.apiKey) {
    window.localStorage.setItem(STORAGE_KEY, state.apiKey);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  state.activeMatchIndex = 0;
  refreshScores();
}

function init() {
  elements.apiKeyInput.value = state.apiKey;
  elements.cycleButton.addEventListener("click", cycleMatch);
  elements.toggleSettings.addEventListener("click", toggleSettingsPanel);
  elements.saveApiKey.addEventListener("click", saveApiKey);
  elements.apiKeyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      saveApiKey();
    }
  });

  updateHeader();
  renderCurrentMatch();
  refreshScores();
  window.setInterval(refreshScores, REFRESH_INTERVAL_MS);
}

init();

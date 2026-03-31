import { demoMatches } from "./mock-score.js";
import { fetchLiveMatches, IPL_KEYWORDS } from "./live-score.js";

const STORAGE_KEY = "scorecard-overlay:cricapi-key";
const REFRESH_INTERVAL_MS = 20_000;
const IST_TIME_ZONE = "Asia/Kolkata";
const WEEKDAY_START_MINUTES = 19 * 60;
const WEEKEND_START_MINUTES = 15 * 60;
const END_MINUTES = 24 * 60 + 30;

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

const istFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

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
  if (state.mode === "api" && state.liveMatches.length > 0) {
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

function getIstParts(date = new Date()) {
  const parts = istFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return {
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function isWeekendWeekday(weekday) {
  return weekday === "Sat" || weekday === "Sun";
}

function getRefreshWindowStatus(date = new Date()) {
  const { weekday, hour, minute } = getIstParts(date);
  const minutes = hour * 60 + minute;

  if (minutes < 30) {
    const previousDay = weekday === "Sun" ? "Sat" : weekday === "Mon" ? "Sun" : weekday === "Tue" ? "Mon" : weekday === "Wed" ? "Tue" : weekday === "Thu" ? "Wed" : weekday === "Fri" ? "Thu" : "Fri";
    const previousStart = isWeekendWeekday(previousDay) ? WEEKEND_START_MINUTES : WEEKDAY_START_MINUTES;

    return {
      active: END_MINUTES > 24 * 60,
      label: previousDay,
      startMinutes: previousStart,
      currentMinutes: minutes + 24 * 60
    };
  }

  const startMinutes = isWeekendWeekday(weekday) ? WEEKEND_START_MINUTES : WEEKDAY_START_MINUTES;
  return {
    active: minutes >= startMinutes && minutes <= END_MINUTES,
    label: weekday,
    startMinutes,
    currentMinutes: minutes
  };
}

function isWithinRefreshWindow(date = new Date()) {
  return getRefreshWindowStatus(date).active;
}

function getRefreshWindowMessage() {
  return "Auto-refresh runs only during IPL windows: Mon-Fri 7:00 PM-12:30 AM IST and Sat-Sun 3:00 PM-12:30 AM IST.";
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
    matchTitle: "No IPL matches found",
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

function getApiModeSummary(matches) {
  const liveCount = matches.filter((match) => match.isLive).length;
  const iplCount = matches.filter(isIplMatch).length;

  if (liveCount > 0 && iplCount > 0) {
    return {
      label: iplCount === 1 ? "LIVE IPL SOURCE" : `LIVE IPL SOURCE • ${iplCount} MATCHES`,
      pill: "LIVE",
      help: "Showing current IPL matches from the API."
    };
  }

  if (iplCount > 0) {
    return {
      label: iplCount === 1 ? "IPL RESULTS SOURCE" : `IPL RESULTS SOURCE • ${iplCount} MATCHES`,
      pill: "IPL",
      help: "No IPL match is live right now, so the overlay is showing IPL matches returned by the API."
    };
  }

  if (liveCount > 0) {
    return {
      label: liveCount === 1 ? "LIVE CRICKET SOURCE" : `LIVE CRICKET SOURCE • ${liveCount} MATCHES`,
      pill: "LIVE",
      help: "No IPL match was returned, so the overlay is showing other live cricket matches from the API."
    };
  }

  return {
    label: "API SOURCE",
    pill: "API",
    help: "The API returned matches, but none matched the current display preference."
  };
}

function updateHeader() {
  const apiMode = state.mode === "api" && state.liveMatches.length > 0;
  const summary = apiMode
    ? getApiModeSummary(state.liveMatches)
    : {
        label: "DEMO OVERLAY",
        pill: "DEMO",
        help: "Paste a CricAPI key to switch from demo scores to live current matches. The key is stored only on this computer."
      };

  elements.dataSource.textContent = summary.label;
  elements.livePill.textContent = summary.pill;
  elements.livePill.classList.toggle("live-pill--demo", summary.pill === "DEMO");

  if (state.lastError) {
    elements.settingsHelp.textContent = `${state.lastError} ${getRefreshWindowMessage()}`;
  } else if (!isWithinRefreshWindow() && state.apiKey) {
    elements.settingsHelp.textContent = getRefreshWindowMessage();
  } else {
    elements.settingsHelp.textContent = summary.help;
  }
}

function renderCurrentMatch() {
  const matches = getDisplayedMatches();

  if (matches.length === 0) {
    renderEmptyState("No IPL matches were returned by the API.");
    return;
  }

  state.activeMatchIndex = state.activeMatchIndex % matches.length;
  renderMatch(matches[state.activeMatchIndex]);
  elements.cycleButton.textContent = matches.length > 1 ? "Next Match" : isWithinRefreshWindow() ? "Refresh" : "Refresh Paused";
}

function isIplMatch(match) {
  const haystack = `${match.matchTitle} ${match.competition}`.toLowerCase();
  return IPL_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function prioritizeMatches(matches) {
  const iplMatches = matches.filter(isIplMatch);
  const liveIplMatches = iplMatches.filter((match) => match.isLive);
  const liveOtherMatches = matches.filter((match) => match.isLive && !isIplMatch(match));

  if (liveIplMatches.length > 0) {
    return liveIplMatches;
  }

  if (iplMatches.length > 0) {
    return iplMatches;
  }

  if (liveOtherMatches.length > 0) {
    return liveOtherMatches;
  }

  return matches;
}

function applyLiveMatches(matches) {
  const prioritized = prioritizeMatches(matches);
  const currentMatchId = getDisplayedMatches()[state.activeMatchIndex]?.id;

  if (prioritized.length > 0) {
    state.liveMatches = prioritized;
    state.mode = "api";
    state.lastError = "";

    if (currentMatchId) {
      const preservedIndex = prioritized.findIndex((match) => match.id === currentMatchId);
      state.activeMatchIndex = preservedIndex >= 0 ? preservedIndex : 0;
    } else {
      state.activeMatchIndex = 0;
    }

    return;
  }

  state.liveMatches = [];
  state.mode = "demo";
  state.lastError = "No IPL or live cricket matches were found, so the overlay is showing demo data.";
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

  if (!isWithinRefreshWindow()) {
    state.lastError = "Auto-refresh is paused outside IPL match hours.";
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
    if (isWithinRefreshWindow()) {
      refreshScores();
    } else {
      state.lastError = "Manual refresh is paused outside IPL match hours.";
      updateHeader();
      renderCurrentMatch();
    }
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

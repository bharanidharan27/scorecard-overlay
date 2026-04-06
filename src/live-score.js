import { invoke } from "../node_modules/@tauri-apps/api/core.js";
import { listen } from "../node_modules/@tauri-apps/api/event.js";

const SCORE_EVENT = "nba-scoreboard:update";

function normalizeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeTeam(raw) {
  return {
    code: normalizeText(raw?.code, "TBD"),
    name: normalizeText(raw?.name),
    score: normalizeText(raw?.score, "0"),
    record: normalizeText(raw?.record)
  };
}

function normalizeGame(raw) {
  return {
    id: normalizeText(raw?.id) || crypto.randomUUID(),
    status: normalizeText(raw?.status),
    statusText: normalizeText(raw?.status_text),
    period: normalizeText(raw?.period),
    clock: normalizeText(raw?.clock),
    arena: normalizeText(raw?.arena),
    startTime: normalizeText(raw?.start_time),
    headline: normalizeText(raw?.headline),
    seriesText: normalizeText(raw?.series_text),
    awayTeam: normalizeTeam(raw?.away_team),
    homeTeam: normalizeTeam(raw?.home_team)
  };
}

function normalizeSnapshot(raw) {
  return {
    source: normalizeText(raw?.source, "nba-live"),
    updatedAt: normalizeText(raw?.updated_at, "NBA scoreboard updated"),
    games: Array.isArray(raw?.games) ? raw.games.map(normalizeGame) : []
  };
}

export async function getInitialSnapshot() {
  const snapshot = await invoke("get_scoreboard_snapshot");
  return normalizeSnapshot(snapshot);
}

export async function subscribeToScoreboard(handler) {
  return listen(SCORE_EVENT, (event) => {
    handler(normalizeSnapshot(event.payload));
  });
}

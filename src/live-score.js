import { invoke } from "../node_modules/@tauri-apps/api/core.js";

export const IPL_KEYWORDS = ["ipl", "indian premier league"];

function normalizeField(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeMatch(raw) {
  return {
    id: normalizeField(raw.id) || crypto.randomUUID(),
    competition: normalizeField(raw.competition),
    current: normalizeField(raw.current),
    isLive: Boolean(raw.is_live),
    lastOver: normalizeField(raw.last_over),
    matchTitle: normalizeField(raw.match_title),
    runRate: normalizeField(raw.run_rate),
    status: normalizeField(raw.status),
    battingOvers: normalizeField(raw.batting_overs),
    battingScore: normalizeField(raw.batting_score),
    battingTeam: normalizeField(raw.batting_team),
    bowlingMeta: normalizeField(raw.bowling_meta),
    bowlingNote: normalizeField(raw.bowling_note),
    bowlingTeam: normalizeField(raw.bowling_team)
  };
}

export async function fetchLiveMatches(apiKey) {
  const matches = await invoke("fetch_current_matches", { apiKey });
  return Array.isArray(matches) ? matches.map(normalizeMatch) : [];
}

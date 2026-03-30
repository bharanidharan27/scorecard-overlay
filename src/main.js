import { demoMatches } from "./mock-score.js";

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
  cycleButton: document.querySelector("#cycle-match")
};

let activeMatchIndex = 0;
let tick = 0;

function renderMatch(match) {
  const state = match.timeline[tick % match.timeline.length];

  elements.matchTitle.textContent = `${match.home.short} vs ${match.away.short}`;
  elements.battingTeam.textContent = state.batting.short;
  elements.battingScore.textContent = `${state.batting.score}/${state.batting.wickets}`;
  elements.battingOvers.textContent = `${state.batting.overs} overs`;
  elements.bowlingTeam.textContent = state.bowling.short;
  elements.bowlingScore.textContent = state.bowling.note;
  elements.bowlingOvers.textContent = state.chase;
  elements.currentBatters.textContent = state.current;
  elements.runRate.textContent = state.runRate;
  elements.lastOver.textContent = state.lastOver;
  elements.matchStatus.textContent = state.status;
}

function updateScore() {
  const match = demoMatches[activeMatchIndex];
  renderMatch(match);
  tick += 1;
}

elements.cycleButton.addEventListener("click", () => {
  activeMatchIndex = (activeMatchIndex + 1) % demoMatches.length;
  tick = 0;
  updateScore();
});

updateScore();
window.setInterval(updateScore, 6000);

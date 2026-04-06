# NBA Scoreboard Overlay

A lightweight Tauri desktop overlay for NBA scoreboards.

## What changed

This project now uses a push-style app architecture:

- the Rust backend owns score retrieval
- the backend fetches the official NBA live scoreboard feed on an interval
- the backend emits `nba-scoreboard:update` events to the frontend
- the frontend subscribes to those pushed updates instead of polling directly
- the last received game list stays on screen while new events arrive

## NBA data source

The backend reads the official NBA live scoreboard JSON feed:

- `https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json`

No API key is required.

## Run the app

1. `npm.cmd install`
2. `npm.cmd run dev`

## Architecture

- [src-tauri/src/main.rs](D:/projects/scorecard-overlay/src-tauri/src/main.rs)
  Rust producer that fetches NBA scores, caches the latest snapshot, and pushes events to the UI.
- [src/live-score.js](D:/projects/scorecard-overlay/src/live-score.js)
  Frontend subscription helpers for the initial snapshot and live event stream.
- [src/main.js](D:/projects/scorecard-overlay/src/main.js)
  UI subscriber that renders pushed scoreboard updates.

## Notes

The app now uses app-level push to the overlay UI, but the upstream NBA source is still an HTTP feed rather than a native message queue or websocket. If you want a true external push pipeline next, the natural next step is to add a queue or websocket service between the NBA fetch worker and the overlay clients.

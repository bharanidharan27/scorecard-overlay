# Scorecard Overlay

A lightweight Tauri desktop overlay for live cricket scores, starting with an IPL-focused overlay that can switch between demo data and live current matches.

## Current state

This repository now includes:

- an always-on-top transparent overlay window
- a compact scoreboard UI
- local API-key storage inside the app
- live current-match fetching through the Tauri backend
- IPL-first filtering when multiple live matches are returned
- demo fallback when no API key is set or the live request fails

## Live data source

The overlay is wired for the CricAPI / CricketData current matches endpoint.

You will need your own API key.

References:

- [Cricket Scores API](https://cricketdata.org/cricket-live-score-api/)
- [Getting started with Cricket Data](https://cricketdata.org/how-to-get-started-with-cricket-data/)

## What still needs to be installed

You will need:

- Node.js and npm
- Rust toolchain
- Microsoft Visual Studio C++ Build Tools for Windows if they are not already present

After changing dependencies, run:

1. `npm.cmd install`
2. `cargo fetch` if you want to pre-download Rust crates
3. `npm.cmd run dev`

## How to use live mode

1. Launch the app
2. Click the `API` button in the overlay
3. Paste your CricAPI key
4. Click `Save`

The app refreshes live scores every 20 seconds and prefers current IPL matches when they are available.

## Planned follow-up

- support richer match details if a more detailed score endpoint is added
- add click-through and opacity controls
- support a slimmer compact overlay mode
- add wicket and innings-break notifications

# Scorecard Overlay

A lightweight Tauri desktop overlay for live cricket scores, starting with an IPL-focused mock scoreboard UI.

## Current state

This repository is scaffolded for a Tauri app with:

- an always-on-top transparent overlay window
- a compact live-score UI
- mocked IPL match data that rotates every few seconds

## What still needs to be installed

This machine does not currently have Rust installed, so the Tauri shell cannot run yet.

You will need:

- Node.js and npm
- Rust toolchain
- Microsoft Visual Studio C++ Build Tools for Windows if they are not already present

## Next steps

1. Install Rust from `https://rustup.rs/`
2. Install project dependencies with `npm.cmd install`
3. Update `src-tauri/tauri.conf.json` so `beforeDevCommand` is `npm.cmd run dev:web`
4. Run the app with `npm.cmd run dev`

## Planned follow-up

- replace mock data with a live cricket score source
- add click-through and opacity controls
- support multiple concurrent live matches
- add wicket and innings-break notifications

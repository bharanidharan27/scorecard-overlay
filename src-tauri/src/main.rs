#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{sync::Mutex, time::Duration};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

const SCOREBOARD_URL: &str = "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";
const SCORE_EVENT: &str = "nba-scoreboard:update";
const FETCH_INTERVAL_SECS: u64 = 20;

#[derive(Clone, Serialize)]
struct NbaTeam {
    code: String,
    name: String,
    score: String,
    record: String,
}

#[derive(Clone, Serialize)]
struct NbaGame {
    id: String,
    status: String,
    status_text: String,
    period: String,
    clock: String,
    arena: String,
    start_time: String,
    headline: String,
    series_text: String,
    away_team: NbaTeam,
    home_team: NbaTeam,
}

#[derive(Clone, Serialize)]
struct ScoreSnapshot {
    games: Vec<NbaGame>,
    source: String,
    updated_at: String,
}

struct ScoreState {
    snapshot: Mutex<ScoreSnapshot>,
}

#[tauri::command]
fn get_scoreboard_snapshot(state: State<'_, ScoreState>) -> Result<ScoreSnapshot, String> {
    state
        .snapshot
        .lock()
        .map(|snapshot| snapshot.clone())
        .map_err(|_| "Failed to access scoreboard snapshot".to_string())
}

fn empty_snapshot() -> ScoreSnapshot {
    ScoreSnapshot {
        games: Vec::new(),
        source: "nba-live".to_string(),
        updated_at: "Waiting for NBA feed".to_string(),
    }
}

fn spawn_score_worker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("scorecard-overlay/0.2")
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                let snapshot = ScoreSnapshot {
                    games: Vec::new(),
                    source: "nba-live".to_string(),
                    updated_at: format!("Client setup failed: {error}"),
                };
                publish_snapshot(&app, snapshot);
                return;
            }
        };

        loop {
            let snapshot = match fetch_scoreboard(&client).await {
                Ok(snapshot) => snapshot,
                Err(error) => ScoreSnapshot {
                    games: Vec::new(),
                    source: "nba-live".to_string(),
                    updated_at: error,
                },
            };

            publish_snapshot(&app, snapshot);
            tauri::async_runtime::sleep(Duration::from_secs(FETCH_INTERVAL_SECS)).await;
        }
    });
}

fn publish_snapshot(app: &AppHandle, snapshot: ScoreSnapshot) {
    if let Some(state) = app.try_state::<ScoreState>() {
        if let Ok(mut current) = state.snapshot.lock() {
            *current = snapshot.clone();
        }
    }

    let _ = app.emit(SCORE_EVENT, snapshot);
}

async fn fetch_scoreboard(client: &reqwest::Client) -> Result<ScoreSnapshot, String> {
    let response = client
        .get(SCOREBOARD_URL)
        .send()
        .await
        .map_err(describe_reqwest_error)?;

    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("Invalid NBA response: {error}"))?;

    if !status.is_success() {
        return Err(format!("NBA feed returned HTTP {}", status.as_u16()));
    }

    let scoreboard = payload
        .get("scoreboard")
        .ok_or_else(|| "NBA feed missing scoreboard field".to_string())?;

    let games = scoreboard
        .get("games")
        .and_then(Value::as_array)
        .ok_or_else(|| "NBA feed missing games array".to_string())?
        .iter()
        .map(normalize_game)
        .collect::<Vec<_>>();

    let updated_at = scoreboard
        .get("gameDate")
        .and_then(Value::as_str)
        .map(|date| format!("NBA scoreboard for {date}"))
        .unwrap_or_else(|| "NBA scoreboard updated".to_string());

    Ok(ScoreSnapshot {
        games,
        source: "nba-live".to_string(),
        updated_at,
    })
}

fn describe_reqwest_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        return "NBA feed timeout".to_string();
    }

    if error.is_connect() {
        return format!("NBA feed connection failed: {error}");
    }

    format!("NBA feed error: {error}")
}

fn normalize_game(raw: &Value) -> NbaGame {
    let away_team = raw.get("awayTeam").unwrap_or(&Value::Null);
    let home_team = raw.get("homeTeam").unwrap_or(&Value::Null);
    let period = raw.get("period").unwrap_or(&Value::Null);

    NbaGame {
        id: get_string(raw, &["gameId"]),
        status: stringify_value(raw.get("gameStatus").unwrap_or(&Value::Null)),
        status_text: get_string(raw, &["gameStatusText"]),
        period: format_period(period),
        clock: get_string(raw, &["gameClock"]),
        arena: raw
            .get("arena")
            .and_then(|arena| arena.get("arenaName"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        start_time: get_string(raw, &["gameEt"]),
        headline: format!(
            "{} at {}",
            get_team_code(away_team),
            get_team_code(home_team)
        ),
        series_text: raw
            .get("seriesGameNumber")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        away_team: normalize_team(away_team),
        home_team: normalize_team(home_team),
    }
}

fn normalize_team(raw: &Value) -> NbaTeam {
    NbaTeam {
        code: get_team_code(raw),
        name: raw
            .get("teamName")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        score: stringify_value(raw.get("score").unwrap_or(&Value::Null)),
        record: format_record(raw),
    }
}

fn get_team_code(raw: &Value) -> String {
    raw.get("teamTricode")
        .and_then(Value::as_str)
        .unwrap_or("TBD")
        .to_string()
}

fn format_record(raw: &Value) -> String {
    let wins = stringify_value(raw.get("wins").unwrap_or(&Value::Null));
    let losses = stringify_value(raw.get("losses").unwrap_or(&Value::Null));

    if wins.is_empty() || losses.is_empty() {
        return String::new();
    }

    format!("{wins}-{losses}")
}

fn format_period(period: &Value) -> String {
    let number = stringify_value(period.get("current").unwrap_or(&Value::Null));
    let period_type = period
        .get("periodType")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_uppercase();

    if number.is_empty() {
        return String::new();
    }

    if period_type == "OT" {
        return format!("OT {number}");
    }

    format!("Q{number}")
}

fn get_string(raw: &Value, keys: &[&str]) -> String {
    keys.iter()
        .find_map(|key| raw.get(*key).and_then(Value::as_str))
        .unwrap_or("")
        .to_string()
}

fn stringify_value(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        _ => String::new(),
    }
}

fn main() {
    tauri::Builder::default()
        .manage(ScoreState {
            snapshot: Mutex::new(empty_snapshot()),
        })
        .invoke_handler(tauri::generate_handler![get_scoreboard_snapshot])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window");
            let _ = window.set_always_on_top(true);
            spawn_score_worker(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

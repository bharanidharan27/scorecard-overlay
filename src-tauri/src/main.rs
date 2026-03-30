#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::Manager;

#[derive(Serialize)]
struct OverlayMatch {
    competition: String,
    current: String,
    id: String,
    is_live: bool,
    last_over: String,
    match_title: String,
    run_rate: String,
    status: String,
    batting_overs: String,
    batting_score: String,
    batting_team: String,
    bowling_meta: String,
    bowling_note: String,
    bowling_team: String,
}

#[tauri::command]
async fn fetch_current_matches(api_key: String) -> Result<Vec<OverlayMatch>, String> {
    if api_key.trim().is_empty() {
        return Err("Missing API key".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("scorecard-overlay/0.1")
        .build()
        .map_err(|error| format!("HTTP client setup failed: {error}"))?;

    let response = client
        .get("https://api.cricapi.com/v1/currentMatches")
        .query(&[("apikey", api_key.trim()), ("offset", "0")])
        .send()
        .await
        .map_err(describe_reqwest_error)?;

    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("Invalid API response: {error}"))?;

    if !status.is_success() {
        let reason = payload
            .get("reason")
            .and_then(Value::as_str)
            .filter(|reason| !reason.is_empty())
            .unwrap_or("Unexpected API error");
        return Err(format!("HTTP {}: {}", status.as_u16(), reason));
    }

    if let Some(reason) = payload.get("reason").and_then(Value::as_str) {
        if !reason.is_empty() && reason != "success" {
            return Err(reason.to_string());
        }
    }

    let data = payload
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| "API returned no match data".to_string())?;

    Ok(data.iter().map(normalize_match).collect())
}

fn describe_reqwest_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        return "Network timeout while contacting CricAPI".to_string();
    }

    if error.is_connect() {
        return format!("Network connection failed: {error}");
    }

    if error.is_request() {
        return format!("Request creation failed: {error}");
    }

    format!("Network error: {error}")
}

fn normalize_match(raw: &Value) -> OverlayMatch {
    let id = get_string(raw, &["id", "unique_id", "match_id"]);
    let match_title = get_string(raw, &["name"]);
    let competition = get_string(raw, &["series", "series_id", "matchType"]);
    let status = get_string(raw, &["status"]);
    let teams = raw
        .get("teams")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let scores = raw
        .get("score")
        .and_then(Value::as_array)
        .map(|items| items.iter().collect::<Vec<_>>())
        .unwrap_or_default();

    let batting_entry = scores.last().copied();
    let other_entry = if scores.len() > 1 {
        scores.get(scores.len().saturating_sub(2)).copied()
    } else {
        None
    };

    let batting_team = batting_entry
        .and_then(|entry| entry.get("inning"))
        .and_then(Value::as_str)
        .map(clean_inning_name)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| teams.first().cloned().unwrap_or_else(|| "TBD".to_string()));

    let batting_score = batting_entry
        .map(format_score)
        .unwrap_or_else(|| "-".to_string());

    let batting_overs = batting_entry
        .and_then(|entry| entry.get("o"))
        .map(stringify_value)
        .filter(|value| !value.is_empty())
        .map(|overs| format!("{overs} overs"))
        .unwrap_or_else(|| "Overs unavailable".to_string());

    let bowling_team = resolve_bowling_team(other_entry, &teams, &batting_team);
    let bowling_note = other_entry
        .map(format_score)
        .filter(|value| value != "-")
        .unwrap_or_else(|| "Yet to bat".to_string());

    let bowling_meta = if scores.len() >= 2 {
        "Previous innings".to_string()
    } else {
        status.clone()
    };

    let current = raw
        .get("venue")
        .and_then(Value::as_str)
        .filter(|venue| !venue.is_empty())
        .map(|venue| format!("Venue: {venue}"))
        .unwrap_or_else(|| get_string(raw, &["matchType"]));

    let run_rate = batting_entry
        .and_then(|entry| entry.get("runRate"))
        .map(stringify_value)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Live".to_string());

    let last_over = batting_entry
        .and_then(|entry| entry.get("lastOver"))
        .map(stringify_value)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Not provided".to_string());

    let is_live = raw
        .get("matchStarted")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        && !raw
            .get("matchEnded")
            .and_then(Value::as_bool)
            .unwrap_or(false);

    OverlayMatch {
        competition,
        current,
        id,
        is_live,
        last_over,
        match_title,
        run_rate,
        status,
        batting_overs,
        batting_score,
        batting_team,
        bowling_meta,
        bowling_note,
        bowling_team,
    }
}

fn get_string(raw: &Value, keys: &[&str]) -> String {
    keys.iter()
        .find_map(|key| raw.get(*key).and_then(Value::as_str))
        .unwrap_or("")
        .to_string()
}

fn resolve_bowling_team(other_entry: Option<&Value>, teams: &[String], batting_team: &str) -> String {
    other_entry
        .and_then(|entry| entry.get("inning"))
        .and_then(Value::as_str)
        .map(clean_inning_name)
        .filter(|name| !name.is_empty())
        .or_else(|| teams.iter().find(|team| team.as_str() != batting_team).cloned())
        .unwrap_or_else(|| "TBD".to_string())
}

fn clean_inning_name(value: &str) -> String {
    value
        .replace(" Innings", "")
        .replace(" Inning", "")
        .trim()
        .to_string()
}

fn format_score(entry: &Value) -> String {
    let runs = entry.get("r").map(stringify_value).unwrap_or_default();
    let wickets = entry.get("w").map(stringify_value).unwrap_or_default();

    if runs.is_empty() {
        return "-".to_string();
    }

    if wickets.is_empty() {
        return runs;
    }

    format!("{runs}/{wickets}")
}

fn stringify_value(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        _ => value.to_string(),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_current_matches])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window");
            let _ = window.set_always_on_top(true);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

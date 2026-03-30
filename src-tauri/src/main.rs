#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window");
            let _ = window.set_always_on_top(true);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

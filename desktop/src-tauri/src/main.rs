// Starts the bundled local stack (database + API + auth + app server) as a sidecar,
// waits until the local app answers, then shows it. Stops the stack on exit.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{net::TcpStream, thread, time::Duration};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

const APP_ADDR: &str = "127.0.0.1:3000";

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let (_rx, child) = app
                .shell()
                .sidecar("yousef-server")?
                .args(["--data-dir", &data_dir.to_string_lossy()])
                .spawn()?;
            app.manage(std::sync::Mutex::new(Some(child)));

            let window = app.get_webview_window("main").expect("main window");
            thread::spawn(move || {
                for _ in 0..240 {
                    if TcpStream::connect(APP_ADDR).is_ok() {
                        let _ = window.eval(&format!("location.replace('http://{APP_ADDR}/auth')"));
                        return;
                    }
                    thread::sleep(Duration::from_millis(500));
                }
                let _ = window.eval("document.body.innerText='تعذّر تشغيل الخادم المحلي'");
            });
            Ok(())
        })
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::Destroyed = e {
                if let Some(state) = w.try_state::<std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>>() {
                    if let Some(child) = state.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Yousef Soft");
}

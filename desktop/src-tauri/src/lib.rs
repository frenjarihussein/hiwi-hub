// Shared entry for Windows (local stack sidecar) and Android (cloud or LAN server chosen on first run).
#[cfg(desktop)]
mod desktop {
    use std::{net::TcpStream, thread, time::Duration};
    use tauri::Manager;
    use tauri_plugin_shell::ShellExt;

    const APP_ADDR: &str = "127.0.0.1:3000";
    type Child = std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>;

    pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir = app.path().app_data_dir()?;
        std::fs::create_dir_all(&data_dir)?;
        let (_rx, child) = app
            .shell()
            .sidecar("yousef-server")?
            .args(["--data-dir", &data_dir.to_string_lossy()])
            .spawn()?;
        app.manage::<Child>(std::sync::Mutex::new(Some(child)));

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
    }

    pub fn on_event(w: &tauri::Window, e: &tauri::WindowEvent) {
        if let tauri::WindowEvent::Destroyed = e {
            if let Some(state) = w.try_state::<Child>() {
                if let Some(child) = state.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());
    #[cfg(desktop)]
    let builder = builder.setup(|app| desktop::setup(app)).on_window_event(desktop::on_event);
    builder
        .run(tauri::generate_context!())
        .expect("error while running Yousef Soft");
}

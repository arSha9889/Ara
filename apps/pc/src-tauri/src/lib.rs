use keyring::{Entry, Error as KeyringError};

#[cfg(target_os = "macos")]
mod liquid_glass;

#[cfg(target_os = "windows")]
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

const KEYRING_SERVICE: &str = "ru.arachat.desktop";
const KEYRING_ACCOUNT: &str = "refresh-token";

#[cfg(target_os = "windows")]
fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "windows")]
fn setup_windows_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text("show", "Открыть AraChat")
        .separator()
        .text("quit", "Выйти")
        .build()?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("application icon".to_owned()))?;

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("AraChat")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn refresh_token_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|_| "System secure storage is unavailable".to_owned())
}

#[tauri::command]
fn save_refresh_token(refresh_token: String) -> Result<(), String> {
    if refresh_token.is_empty() || refresh_token.len() > 1024 {
        return Err("The session data is invalid".to_owned());
    }

    refresh_token_entry()?
        .set_password(&refresh_token)
        .map_err(|_| "Could not save the session in system secure storage".to_owned())
}

#[tauri::command]
fn load_refresh_token() -> Result<Option<String>, String> {
    match refresh_token_entry()?.get_password() {
        Ok(refresh_token) if !refresh_token.is_empty() => Ok(Some(refresh_token)),
        Ok(_) => Ok(None),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("Could not access system secure storage".to_owned()),
    }
}

#[tauri::command]
fn clear_refresh_token() -> Result<(), String> {
    match refresh_token_entry()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("Could not clear the saved session".to_owned()),
    }
}

#[tauri::command]
async fn initialize_native_liquid_glass(window: tauri::WebviewWindow) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        liquid_glass::initialize(window).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(false)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            setup_windows_tray(app)?;
            #[cfg(not(target_os = "windows"))]
            let _ = app;

            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(target_os = "windows")]
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            #[cfg(not(target_os = "windows"))]
            let _ = (window, event);
        })
        .invoke_handler(tauri::generate_handler![
            save_refresh_token,
            load_refresh_token,
            clear_refresh_token,
            initialize_native_liquid_glass
        ])
        .run(tauri::generate_context!())
        .expect("AraChat Desktop failed to start");
}

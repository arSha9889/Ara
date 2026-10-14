use keyring::{Entry, Error as KeyringError};

const KEYRING_SERVICE: &str = "ru.arachat.desktop";
const KEYRING_ACCOUNT: &str = "refresh-token";

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_refresh_token,
            load_refresh_token,
            clear_refresh_token
        ])
        .run(tauri::generate_context!())
        .expect("AraChat Desktop failed to start");
}

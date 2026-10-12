// AI provider API keys in the OS keychain (Windows Credential Manager), not in webview storage.
//
// One credential per provider: service `com.fizzexual.inkwell.ai`, account = the provider id.
// The id comes from JS, so it is checked to be a short plain slug before it names a credential.
use std::collections::HashMap;

const SERVICE: &str = "com.fizzexual.inkwell.ai";

/// A provider id is `[a-z0-9-]{1,32}` — nothing else may name a credential.
fn valid_provider(id: &str) -> bool {
    (1..=32).contains(&id.len())
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    if !valid_provider(provider) {
        return Err(format!("Not a provider id: {provider:?}"));
    }
    keyring::Entry::new(SERVICE, provider).map_err(|e| e.to_string())
}

/// Save (or replace) the API key for `provider`.
#[tauri::command]
pub fn secret_set(provider: String, key: String) -> Result<(), String> {
    if key.is_empty() {
        return Err("Empty key — use secret_delete".into());
    }
    entry(&provider)?.set_password(&key).map_err(|e| e.to_string())
}

/// The saved keys for these providers; providers with no saved key are left out.
#[tauri::command]
pub fn secrets_get(providers: Vec<String>) -> Result<HashMap<String, String>, String> {
    // check every id before reading any credential
    let entries = providers.iter().map(|p| entry(p)).collect::<Result<Vec<_>, _>>()?;
    let mut out = HashMap::new();
    for (p, e) in providers.into_iter().zip(entries) {
        match e.get_password() {
            Ok(key) => {
                out.insert(p, key);
            }
            Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(out)
}

/// Forget the key for `provider`. Deleting a key that isn't there is not an error.
#[tauri::command]
pub fn secret_delete(provider: String) -> Result<(), String> {
    match entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_ids_are_short_lowercase_slugs() {
        for ok in ["groq", "openai", "together", "a", "x-1", &"a".repeat(32)] {
            assert!(valid_provider(ok), "{ok} should be accepted");
        }
        for bad in [
            "",
            &"a".repeat(33),
            "OpenAI",
            "open ai",
            "open_ai",
            "../groq",
            "groq/x",
            "groq\\x",
            "groq:1",
            "gröq",
            "groq\0",
        ] {
            assert!(!valid_provider(bad), "{bad:?} should be refused");
        }
    }

    #[test]
    fn commands_refuse_a_bad_provider_id_before_touching_the_store() {
        assert!(secret_set("../x".into(), "k".into()).is_err());
        assert!(secrets_get(vec!["groq".into(), "A B".into()]).is_err());
        assert!(secret_delete("".into()).is_err());
        assert!(secret_set("groq".into(), String::new()).is_err());
    }

    // Touches the real OS credential store: `cargo test -- --ignored`. Cleans up after itself.
    #[test]
    #[ignore]
    fn keychain_round_trip() {
        let id = "inkwell-selftest";
        secret_delete(id.into()).unwrap();
        assert!(secrets_get(vec![id.into()]).unwrap().is_empty());

        secret_set(id.into(), "sk-test-1".into()).unwrap();
        secret_set(id.into(), "sk-test-2".into()).unwrap(); // replaces, not duplicates
        let got = secrets_get(vec![id.into(), "inkwell-absent".into()]).unwrap();
        assert_eq!(got.get(id).map(String::as_str), Some("sk-test-2"));
        assert_eq!(got.len(), 1);

        secret_delete(id.into()).unwrap();
        secret_delete(id.into()).unwrap(); // already gone: still fine
        assert!(secrets_get(vec![id.into()]).unwrap().is_empty());
    }
}

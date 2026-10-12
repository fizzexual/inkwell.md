// AI provider keys in the OS keychain (Windows Credential Manager) — desktop app only.
// Rust owns the store (src-tauri/src/secrets.rs); JS only ever holds the keys in memory.

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** The saved keys for these providers (missing ones are simply absent). */
export const secretsGet = (providers: string[]) => invoke<Record<string, string>>("secrets_get", { providers });
export const secretSet = (provider: string, key: string) => invoke<void>("secret_set", { provider, key });
export const secretDelete = (provider: string) => invoke<void>("secret_delete", { provider });

/**
 * Copy plaintext keys into the keychain. Returns the providers whose write succeeded — only those
 * may be removed from localStorage; a refused write keeps its key there for the next start.
 */
export async function migrateKeys(legacy: Record<string, string>): Promise<string[]> {
  const moved: string[] = [];
  for (const [provider, key] of Object.entries(legacy)) {
    if (!key.trim()) {
      moved.push(provider); // nothing to keep — just drop the empty entry
      continue;
    }
    try {
      await secretSet(provider, key);
      moved.push(provider);
    } catch (e) {
      console.error(`Inkwell: couldn't move the ${provider} key to the keychain`, e);
    }
  }
  return moved;
}

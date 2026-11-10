import "obsidian";

declare module "obsidian" {
  interface App {
    /** Reveals a vault-relative path in the system file manager (runtime API, missing from the public d.ts). */
    showInFolder(path: string): void;
  }
  interface Vault {
    /** Reads a vault config value (runtime API, missing from the public d.ts). */
    getConfig(key: string): unknown;
    /** Writes a vault config value (runtime API, missing from the public d.ts). */
    setConfig(key: string, value: unknown): void;
  }
}

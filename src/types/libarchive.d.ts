// libarchive.js ships no types, so here is a minimal hand-written declaration (only the RAR unpacking path is used)
declare module 'libarchive.js' {
  export class Archive {
    /** Where worker-bundle.js lives (it must be copied into the public assets; the worker resolves the wasm relative to itself) */
    static init(options?: { workerUrl?: string }): unknown
    static open(file: File | Blob, options?: unknown): Promise<Archive>
    /** Unpack every entry into a nested directory tree whose leaves are File objects */
    extractFiles(cb?: (entry: { file: File; path: string }) => void): Promise<Record<string, unknown>>
    hasEncryptedData(): Promise<boolean | null>
    usePassword(password: string): Promise<void>
  }
}

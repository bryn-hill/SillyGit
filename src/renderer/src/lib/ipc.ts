/** What most `window.api` calls resolve to. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

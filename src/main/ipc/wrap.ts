/** Runs an IPC handler's work, turning a thrown error into `{ ok: false, error }` for the renderer. */
export function wrap<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  return fn()
    .then((data) => ({ ok: true as const, data }))
    .catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }))
}

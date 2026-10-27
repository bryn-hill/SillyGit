export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

// Plain fetch until the app swaps in Electron's net.fetch (which honours the
// system proxy); tests swap in a fake.
let impl: FetchLike = (url, init) => fetch(url, init)

export function setFetch(fetchImpl: FetchLike): void {
  impl = fetchImpl
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 15000

export function httpFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return impl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...init })
}

/** GETs or POSTs JSON, throwing an HttpError with the service's own message on a non-2xx answer. */
export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await httpFetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'User-Agent': 'SillyGit', ...(init.headers as Record<string, string>) }
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { message?: string; error?: string | { message?: string } }
      detail = body.message ?? (typeof body.error === 'string' ? body.error : body.error?.message) ?? ''
    } catch {
      // Not JSON; the status says enough.
    }
    throw new HttpError(res.status, `${res.status} ${res.statusText || 'error'}${detail ? `: ${detail}` : ''}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** What a pull request notification is about. */
export type PrNotificationKind = 'newPullRequest' | 'reviewRequested' | 'approved' | 'changesRequested' | 'comment'

export interface NotificationSettings {
  /** Off silences every pull request notification. */
  enabled: boolean
  /** Which kinds to show while enabled. */
  kinds: Record<PrNotificationKind, boolean>
  /** Also tell me about pull requests I opened myself (e.g. from another tool or an agent). */
  includeMyOwnPullRequests: boolean
  /** Minutes between checks. */
  intervalMinutes: number
}

export const NOTIFICATION_KIND_ORDER: PrNotificationKind[] = [
  'newPullRequest',
  'reviewRequested',
  'approved',
  'changesRequested',
  'comment'
]

export const NOTIFICATION_KIND_LABELS: Record<PrNotificationKind, string> = {
  newPullRequest: 'New pull requests in my repositories',
  reviewRequested: 'Someone asks for my review',
  approved: 'My pull request is approved',
  changesRequested: 'Changes are requested on my pull request',
  comment: 'Someone comments on my pull request'
}

export const NOTIFICATION_INTERVAL_CHOICES = [1, 2, 5, 10, 30]

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  kinds: { newPullRequest: true, reviewRequested: true, approved: true, changesRequested: true, comment: true },
  includeMyOwnPullRequests: false,
  intervalMinutes: 2
}

/** Fills in anything missing or malformed in stored settings with the defaults. */
export function normalizeNotificationSettings(stored: unknown): NotificationSettings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<NotificationSettings>
  const kinds = { ...DEFAULT_NOTIFICATION_SETTINGS.kinds }
  for (const kind of NOTIFICATION_KIND_ORDER) {
    if (typeof s.kinds?.[kind] === 'boolean') kinds[kind] = s.kinds[kind]
  }
  const interval = s.intervalMinutes
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_NOTIFICATION_SETTINGS.enabled,
    kinds,
    includeMyOwnPullRequests:
      typeof s.includeMyOwnPullRequests === 'boolean'
        ? s.includeMyOwnPullRequests
        : DEFAULT_NOTIFICATION_SETTINGS.includeMyOwnPullRequests,
    intervalMinutes:
      typeof interval === 'number' && interval >= 1 ? Math.round(interval) : DEFAULT_NOTIFICATION_SETTINGS.intervalMinutes
  }
}

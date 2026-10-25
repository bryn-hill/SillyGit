import type { LaunchpadBucketId } from './types'

// Priority order a PR is sorted into exactly one of, modeled on GitKraken's
// Launchpad bucket hierarchy (readyToMerge shown first, catch-alls last).
export const LAUNCHPAD_BUCKET_ORDER: LaunchpadBucketId[] = [
  'readyToMerge',
  'needsMyReview',
  'changesRequested',
  'failingCI',
  'conflicts',
  'unassignedReviewers',
  'reviewerCommented',
  'waitingForReview',
  'draft',
  'other'
]

export const LAUNCHPAD_BUCKET_LABELS: Record<LaunchpadBucketId, string> = {
  readyToMerge: 'Ready to merge',
  needsMyReview: 'Needs my review',
  changesRequested: 'Changes requested',
  failingCI: 'Failing CI',
  conflicts: 'Has conflicts',
  unassignedReviewers: 'No reviewers assigned',
  reviewerCommented: 'Reviewer commented',
  waitingForReview: 'Waiting for review',
  draft: 'Draft',
  other: 'Other'
}

export const LAUNCHPAD_BUCKET_COLOR_VAR: Record<LaunchpadBucketId, string> = {
  readyToMerge: '--green',
  needsMyReview: '--orange',
  changesRequested: '--orange',
  failingCI: '--red',
  conflicts: '--red',
  unassignedReviewers: '--red',
  reviewerCommented: '--cyan',
  waitingForReview: '--text-dim',
  draft: '--text-dim',
  other: '--text-dim'
}

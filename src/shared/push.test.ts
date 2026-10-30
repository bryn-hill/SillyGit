import { describe, expect, it } from 'vitest'
import { defaultPushTarget, pushRejection } from './push'

describe('pushRejection', () => {
  it('spots a push the remote refused as not a fast-forward', () => {
    expect(pushRejection(' ! [rejected]        HEAD -> main (non-fast-forward)\nerror: failed to push some refs')).toBe('diverged')
    expect(pushRejection(' ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs')).toBe('diverged')
  })

  it('spots a force push whose lease did not hold', () => {
    expect(pushRejection(' ! [rejected]        HEAD -> main (stale info)')).toBe('stale')
    expect(pushRejection(' ! [rejected]        HEAD -> main (remote ref updated since checkout)')).toBe('stale')
  })

  it('leaves other failures alone', () => {
    expect(pushRejection(' ! [remote rejected] main -> main (protected branch hook declined)')).toBeNull()
    expect(pushRejection('fatal: Authentication failed')).toBeNull()
  })
})

describe('defaultPushTarget', () => {
  it('pushes to the upstream, even under another name or a remote with a slash', () => {
    expect(defaultPushTarget('feature', 'origin/feat', ['origin'])).toEqual({ remote: 'origin', branch: 'feat' })
    expect(defaultPushTarget('x', 'team/a/x', ['team', 'team/a'])).toEqual({ remote: 'team/a', branch: 'x' })
  })

  it('falls back to the same name on origin, else the first remote', () => {
    expect(defaultPushTarget('feature', null, ['upstream', 'origin'])).toEqual({ remote: 'origin', branch: 'feature' })
    expect(defaultPushTarget('feature', null, ['upstream'])).toEqual({ remote: 'upstream', branch: 'feature' })
    expect(defaultPushTarget('feature', null, [])).toBeNull()
  })
})

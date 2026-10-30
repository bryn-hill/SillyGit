import { describe, expect, it, vi } from 'vitest'
import { fileMenuSections } from './fileMenu'

const lfsItem = (lfs: Parameters<typeof fileMenuSections>[0]['lfs'], path = 'art/hero.psd') =>
  fileMenuSections({ path, lfs }).flat().find((item) => item.id.startsWith('lfs-'))

describe('fileMenuSections: Git LFS', () => {
  it('offers to track the extension or the file', () => {
    const onTrack = vi.fn()
    const item = lfsItem({ installed: true, tracked: false, onTrack })
    expect(item?.label).toBe('Track with LFS')
    expect(item?.submenu?.map((s) => s.label)).toEqual(['All *.psd files', 'Only this file'])
    item?.submenu?.[0].onSelect?.()
    expect(onTrack).toHaveBeenCalledWith('*.psd')
  })

  it('is greyed out, saying why, without git-lfs', () => {
    const item = lfsItem({ installed: false, tracked: false, onTrack: () => {} })
    expect(item).toMatchObject({ label: 'Track with LFS', disabled: true })
    expect(item?.title).toMatch(/git-lfs\.com/)
    expect(item?.submenu).toBeUndefined()
  })

  it('says a file is already in LFS', () => {
    expect(lfsItem({ installed: true, tracked: true, onTrack: () => {} })).toMatchObject({ label: 'Stored in Git LFS', disabled: true })
  })

  it('has no LFS item when not asked for', () => {
    expect(lfsItem(undefined)).toBeUndefined()
  })
})

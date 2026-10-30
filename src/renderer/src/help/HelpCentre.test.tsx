// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HelpCentreHost from './HelpCentreHost'
import { closeHelp, getHelpCentreState, openHelp } from './helpCentreStore'
import { onStartTour } from './tourBus'

afterEach(() => {
  act(() => closeHelp())
  cleanup()
})

const shownArticle = (): string | null =>
  document.querySelector('.help-article')?.getAttribute('data-article') ?? null

describe('HelpCentre', () => {
  it('shows nothing until openHelp, then opens on the article asked for', () => {
    render(<HelpCentreHost />)
    expect(screen.queryByRole('dialog', { name: 'Help centre' })).toBeNull()
    act(() => openHelp('branches/create-and-switch'))
    expect(screen.getByRole('dialog', { name: 'Help centre' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Create and switch branches' })).toBeTruthy()
    expect(shownArticle()).toBe('branches/create-and-switch')
  })

  it('opens on the home page with no article, and an unknown id falls back to it', () => {
    render(<HelpCentreHost />)
    act(() => openHelp())
    expect(screen.getByRole('heading', { name: 'How can we help?' })).toBeTruthy()
    act(() => openHelp('nope/missing'))
    expect(screen.getByRole('heading', { name: 'How can we help?' })).toBeTruthy()
  })

  it('searches as you type, grouped by category, and Enter opens the first hit', () => {
    render(<HelpCentreHost />)
    act(() => openHelp())
    const search = screen.getByRole('searchbox', { name: 'Search help' })
    fireEvent.change(search, { target: { value: 'squash' } })
    const results = screen.getByRole('navigation', { name: 'Search results' })
    expect(within(results).getAllByTestId('help-result')[0].textContent).toContain('Rewrite history with interactive rebase')
    expect(within(results).getByRole('heading', { name: 'Rebase and rewriting history' })).toBeTruthy()
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(shownArticle()).toBe('rebase-history/interactive-rebase')
    expect((search as HTMLInputElement).value).toBe('')
  })

  it('says when nothing matches', () => {
    render(<HelpCentreHost />)
    act(() => openHelp())
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), { target: { value: 'zzzqqq' } })
    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
  })

  it('follows help: links and related articles, and Back retraces them', () => {
    render(<HelpCentreHost />)
    act(() => openHelp('getting-started/welcome'))
    fireEvent.click(screen.getByRole('link', { name: 'Open a repository' }))
    expect(shownArticle()).toBe('getting-started/open-a-repository')
    fireEvent.click(within(screen.getByRole('region', { name: 'Related articles' })).getByRole('button', { name: 'Keyboard shortcuts' }))
    expect(shownArticle()).toBe('getting-started/keyboard-shortcuts')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(shownArticle()).toBe('getting-started/open-a-repository')
  })

  it('Escape clears the search first, then closes', () => {
    render(<HelpCentreHost />)
    act(() => openHelp())
    const search = screen.getByRole('searchbox', { name: 'Search help' })
    fireEvent.change(search, { target: { value: 'stash' } })
    fireEvent.keyDown(search, { key: 'Escape' })
    expect((search as HTMLInputElement).value).toBe('')
    expect(getHelpCentreState().open).toBe(true)
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(getHelpCentreState().open).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Help centre' })).toBeNull()
  })

  it('starts the walkthrough from the home page', () => {
    const listener = vi.fn()
    const stop = onStartTour(listener)
    render(<HelpCentreHost />)
    act(() => openHelp())
    fireEvent.click(screen.getByRole('button', { name: 'Start the walkthrough' }))
    expect(listener).toHaveBeenCalledOnce()
    expect(getHelpCentreState().open).toBe(false)
    stop()
  })
})

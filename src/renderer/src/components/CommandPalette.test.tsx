// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import CommandPalette, { type Command } from './CommandPalette'

beforeAll(() => {
  // jsdom has no layout, so no scrollIntoView.
  Element.prototype.scrollIntoView = () => {}
})

afterEach(cleanup)

function setup(commands: Command[], variant?: 'modal' | 'dropdown'): { onClose: ReturnType<typeof vi.fn>; input: HTMLElement } {
  const onClose = vi.fn()
  render(<CommandPalette commands={commands} onClose={onClose} variant={variant} />)
  return { onClose, input: screen.getByRole('textbox', { name: 'Command' }) }
}

const labels = (): string[] => screen.queryAllByRole('option').map((o) => o.querySelector('.palette-label')!.textContent!)
const selected = (): string | null =>
  screen.queryAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')?.querySelector('.palette-label')
    ?.textContent ?? null

const commands = (): Command[] => [
  { id: 'fetch', label: 'Fetch', shortcut: '⌘⇧F', run: vi.fn() },
  { id: 'push', label: 'Push', run: vi.fn() },
  { id: 'pull', label: 'Pull', run: vi.fn() },
  {
    id: 'checkout',
    label: 'Checkout',
    children: [
      { id: 'main', label: 'main', run: vi.fn() },
      { id: 'feature', label: 'feature/login', run: vi.fn() }
    ]
  }
]

describe('CommandPalette', () => {
  it('lists every top-level command and focuses the search', () => {
    const { input } = setup(commands())
    expect(labels()).toEqual(['Fetch', 'Push', 'Pull', 'Checkout'])
    expect(document.activeElement).toBe(input)
    expect(selected()).toBe('Fetch')
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy()
    expect(screen.getByText('⌘⇧F')).toBeTruthy()
  })

  it('filters as you type and reaches into sub-lists', () => {
    const { input } = setup(commands())
    fireEvent.change(input, { target: { value: 'pu' } })
    expect(labels()).toEqual(['Push', 'Pull'])
    fireEvent.change(input, { target: { value: 'login' } })
    expect(labels()).toEqual(['feature/login'])
    // A found sub-command shows which list it came from.
    expect(screen.getByRole('option').querySelector('.palette-group')!.textContent).toBe('Checkout')
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(labels()).toEqual([])
    expect(screen.getByText('No matching commands')).toBeTruthy()
  })

  it('moves the selection with the arrow keys, stopping at the ends, and runs it with Enter', () => {
    const list = commands()
    const { input, onClose } = setup(list)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(selected()).toBe('Fetch')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(selected()).toBe('Pull')
    for (let i = 0; i < 5; i++) fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(selected()).toBe('Checkout')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(list[2].run).toHaveBeenCalledTimes(1)
    expect(list[0].run).not.toHaveBeenCalled()
  })

  it('starts the selection over when the search changes', () => {
    const { input } = setup(commands())
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.change(input, { target: { value: 'p' } })
    expect(selected()).toBe('Push')
  })

  it('opens a sub-list instead of closing, and goes back with Backspace or Escape', () => {
    const list = commands()
    const { input, onClose } = setup(list)
    fireEvent.click(screen.getByText('Checkout'))
    expect(onClose).not.toHaveBeenCalled()
    expect(labels()).toEqual(['main', 'feature/login'])
    expect(input.getAttribute('placeholder')).toBe('Search checkout')
    expect(screen.getByTitle('Back (Backspace)').textContent).toContain('Checkout')

    // Backspace in a non-empty search only edits the text.
    fireEvent.change(input, { target: { value: 'm' } })
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(labels()).toEqual(['main'])
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(labels()).toEqual(['Fetch', 'Push', 'Pull', 'Checkout'])

    fireEvent.click(screen.getByText('Checkout'))
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(labels()).toEqual(['Fetch', 'Push', 'Pull', 'Checkout'])
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs a sub-command picked from a search', () => {
    const list = commands()
    const { input, onClose } = setup(list)
    fireEvent.change(input, { target: { value: 'main' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(list[3].children![0].run).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on a click outside but not on one inside', () => {
    const { onClose } = setup(commands())
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does nothing on Enter when nothing matches', () => {
    const { input, onClose } = setup(commands())
    fireEvent.change(input, { target: { value: 'zzz' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows at most 60 results', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, label: `Command ${i}`, run: () => {} }))
    const { input } = setup(many)
    expect(labels()).toHaveLength(60)
    fireEvent.change(input, { target: { value: 'command' } })
    expect(labels()).toHaveLength(60)
  })

  it('labels the toolbar dropdown as Actions', () => {
    const { input } = setup(commands(), 'dropdown')
    expect(screen.getByRole('dialog', { name: 'Actions' })).toBeTruthy()
    expect(input.getAttribute('placeholder')).toMatch(/^Search for commands and actions/)
  })
})

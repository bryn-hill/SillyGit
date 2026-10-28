// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import Select from './Select'

beforeAll(() => {
  // jsdom has no layout, so no scrollIntoView.
  Element.prototype.scrollIntoView = () => {}
})

afterEach(cleanup)

const options = [
  { value: 1, label: 'Every minute' },
  { value: 5, label: 'Every 5 minutes' },
  { value: 10, label: 'Every 10 minutes' }
]

function setup(value = 5, disabled = false): { onChange: ReturnType<typeof vi.fn>; button: HTMLElement } {
  const onChange = vi.fn()
  render(
    <>
      <label htmlFor="interval">Check</label>
      <Select id="interval" value={value} options={options} onChange={onChange} disabled={disabled} />
    </>
  )
  return { onChange, button: screen.getByRole('combobox', { name: 'Check' }) }
}

const active = (button: HTMLElement): string | null =>
  document.getElementById(button.getAttribute('aria-activedescendant') ?? '')?.textContent ?? null

describe('Select', () => {
  it('shows the chosen label and is named by its label', () => {
    const { button } = setup()
    expect(button.textContent).toBe('Every 5 minutes')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens on click, marks the current option and picks another', () => {
    const { button, onChange } = setup()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('Every 5 minutes')
    fireEvent.click(screen.getByRole('option', { name: 'Every 10 minutes' }))
    expect(onChange).toHaveBeenCalledWith(10)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('works from the keyboard: arrows move, Enter picks, Escape closes without picking', () => {
    const { button, onChange } = setup()
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    expect(active(button)).toContain('Every 5 minutes')
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    expect(active(button)).toContain('Every 10 minutes')
    fireEvent.keyDown(button, { key: 'Home' })
    expect(active(button)).toContain('Every minute')
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: 'ArrowUp' })
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('does not let Escape reach the dialog behind it', () => {
    const { button } = setup()
    const outer = vi.fn()
    window.addEventListener('keydown', outer)
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: 'Escape' })
    window.removeEventListener('keydown', outer)
    expect(outer).not.toHaveBeenCalled()
  })

  it('closes on a click outside', () => {
    const { button, onChange } = setup()
    fireEvent.click(button)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stays open for a late scroll event that did not move it, and closes once it moves', () => {
    const { button } = setup()
    let top = 100
    button.getBoundingClientRect = () => ({ left: 10, top }) as DOMRect
    fireEvent.click(button)
    fireEvent.scroll(document.body)
    expect(screen.queryByRole('listbox')).not.toBeNull()
    top = 60
    fireEvent.scroll(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does nothing when disabled', () => {
    const { button } = setup(5, true)
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

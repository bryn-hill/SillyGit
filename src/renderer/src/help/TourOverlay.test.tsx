// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import TourOverlay from './TourOverlay'

beforeAll(() => {
  // jsdom has no layout: no scrollIntoView or ResizeObserver.
  Element.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver = class {
    constructor(private callback: () => void) {}
    observe(): void {
      this.callback()
    }
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
})

afterEach(cleanup)

function setup(index: number, count = 3) {
  const handlers = { onNext: vi.fn(), onBack: vi.fn(), onClose: vi.fn() }
  render(
    <TourOverlay
      step={{ id: 's', title: 'A step', body: 'Some **text**', articleId: 'graph/commit-graph', target: 'nowhere' }}
      index={index}
      count={count}
      {...handlers}
    />
  )
  return handlers
}

describe('TourOverlay', () => {
  it('shows the step and where it is in the tour', () => {
    setup(0)
    expect(screen.getByRole('dialog', { name: 'A step' })).toBeTruthy()
    expect(screen.getByText('Step 1 of 3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Learn more' })).toBeTruthy()
  })

  it('moves on, back and closes from the buttons and keys', () => {
    const { onNext, onBack, onClose } = setup(1)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect([onNext.mock.calls.length, onBack.mock.calls.length, onClose.mock.calls.length]).toEqual([1, 1, 1])
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect([onNext.mock.calls.length, onBack.mock.calls.length, onClose.mock.calls.length]).toEqual([2, 2, 2])
  })

  it('ends with Done and no Skip on the last step', () => {
    setup(2)
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip tour' })).toBeNull()
  })

  it('spotlights the target when it is on screen, and dims the window when it is not', () => {
    setup(0)
    expect(screen.queryByTestId('tour-spotlight')).toBeNull()
    expect(screen.getByTestId('tour').className).toContain('tour-overlay-dim')
  })
})

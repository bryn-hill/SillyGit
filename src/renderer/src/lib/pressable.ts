import type { KeyboardEvent } from 'react'

/**
 * Props that make a non-button element (a row or header that can't be a
 * <button> because of what's inside it) work like one: focusable, announced
 * as a button, and pressed with Enter or Space as well as a click.
 */
export function pressable(onPress: () => void): {
  role: 'button'
  tabIndex: 0
  onClick: () => void
  onKeyDown: (e: KeyboardEvent) => void
} {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onPress,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
      e.preventDefault()
      onPress()
    }
  }
}

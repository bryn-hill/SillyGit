import { Component, type ErrorInfo, type JSX, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a crash while rendering, so it shows what went wrong and a way back
 * instead of a blank window. React still needs a class for this.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[render-error]', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return <RenderErrorScreen error={error} onRetry={() => this.setState({ error: null })} />
  }
}

function RenderErrorScreen({ error, onRetry }: { error: Error; onRetry: () => void }): JSX.Element {
  return (
    <div className="render-error" role="alert">
      <h1>Something went wrong</h1>
      <p>SillyGit hit an error while drawing this screen. Your repositories haven't been changed.</p>
      <pre>{error.message}</pre>
      <div className="render-error-actions">
        <button className="subtle" onClick={onRetry}>
          Try again
        </button>
        <button className="commit-button" onClick={() => window.location.reload()}>
          Reload SillyGit
        </button>
      </div>
    </div>
  )
}

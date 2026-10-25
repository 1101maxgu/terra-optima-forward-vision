// Keeps one broken screen from blanking the whole app. Saved data and drafts are untouched.
import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-10 max-w-lg rounded-2xl border border-alert/30 bg-alert-soft p-6">
        <h1 className="text-xl font-bold text-alert">Something went wrong on this screen</h1>
        <p className="mt-2">Your saved field sections and any unfinished field section draft are safe.</p>
        <p className="mt-1 text-sm text-muted">{this.state.error.message}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn-primary min-h-11" onClick={() => this.setState({ error: null })}>Try again</button>
          <a href="#/" className="btn-secondary inline-flex min-h-11 items-center">Go to Home</a>
        </div>
      </div>
    )
  }
}

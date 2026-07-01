import { Component, type ErrorInfo, type ReactNode } from "react";
import "./ErrorBoundary.css";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render errors anywhere below it and shows a recoverable screen instead of a
 * blank white page. Your vault is safe in localStorage regardless of a render crash.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // surfaced in the console for debugging; not sent anywhere
    console.error("Inkwell caught a render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="eb">
        <div className="eb-card">
          <div className="eb-mark">⚠</div>
          <h1>Something went wrong on screen</h1>
          <p>
            A part of the app hit an error while rendering. <b>Your notes are safe</b> — everything is stored
            locally and nothing was lost.
          </p>
          <pre className="eb-msg">{this.state.error.message}</pre>
          <div className="eb-actions">
            <button className="eb-btn primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="eb-btn" onClick={() => window.location.reload()}>
              Reload Inkwell
            </button>
          </div>
        </div>
      </div>
    );
  }
}

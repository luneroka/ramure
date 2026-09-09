/**
 * A render crash must not take the whole screen with it. Edits are already
 * on the device (the outbox is persisted before anything else), so the
 * honest message is: something broke, nothing is lost, try again.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { detectLang, t } from '../../i18n';
import { reportError } from '../report';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Ramure: render crashed', error, info.componentStack);
    reportError('render', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const lang = detectLang();
    return (
      <div className="app gate">
        <div className="crash" role="alert">
          <h1>{t(lang, 'crashTitle')}</h1>
          <p className="muted">{t(lang, 'crashHint')}</p>
          <pre className="crash-detail">{this.state.error.message}</pre>
          <div className="row">
            <button className="btn primary" onClick={() => this.setState({ error: null })}>
              {t(lang, 'retry')}
            </button>
            <button className="btn" onClick={() => location.reload()}>
              {t(lang, 'reloadPage')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name || 'Root'}] Caught error:`, error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndReload = () => {
    try {
      localStorage.removeItem('pulse_active_conv_id');
      localStorage.removeItem('pulse_theme_v2');
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="w-full h-full min-h-[280px] flex items-center justify-center p-6 bg-[var(--bg-app,#090d16)] text-[var(--text-primary,#f8fafc)] select-none">
          <div className="max-w-md w-full bg-[var(--bg-surface,#141d33)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-3xl p-6 shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-500/20">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h3 className="text-base font-bold text-[var(--text-primary,#f8fafc)] mb-1">
              {this.props.name ? `Ошибка в компоненте ${this.props.name}` : 'Произошла непредвиденная ошибка'}
            </h3>
            <p className="text-xs text-[var(--text-secondary,#94a3b8)] mb-4">
              При отрисовке интерфейса возникла ошибка. Вы можете перезагрузить страницу или сбросить сохранённый кэш диалога.
            </p>

            {this.state.error && (
              <div className="p-3 mb-5 bg-[var(--bg-input,#080c14)] border border-[var(--border-subtle,rgba(255,255,255,0.08))] rounded-xl text-left overflow-x-auto text-[11px] font-mono text-rose-300">
                <span className="font-bold">{this.state.error.name}: </span>
                <span>{this.state.error.message}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-4 py-2 bg-[var(--accent-default,#6366f1)] hover:bg-[var(--accent-hover,#4f46e5)] text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Перезагрузить</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetAndReload}
                className="w-full sm:w-auto px-4 py-2 bg-[var(--bg-surface-hover,rgba(255,255,255,0.08))] hover:bg-rose-500/15 text-[var(--text-secondary,#cbd5e1)] hover:text-rose-300 border border-[var(--border-subtle,rgba(255,255,255,0.08))] text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Сбросить кэш и перезагрузить</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

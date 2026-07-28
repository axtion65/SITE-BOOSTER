import React from "react";

interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log so you can see it in server logs / browser console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <span className="text-2xl">⚡</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white mb-2">Something went wrong</h1>
            <p className="text-white/40 text-sm leading-relaxed">
              This page hit an unexpected error. Try refreshing — if it keeps happening,
              use the Feedback button to let us know and we'll fix it fast.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-all"
            >
              Refresh page
            </button>
            <button
              onClick={() => { window.location.href = "/studio"; }}
              className="px-6 py-2.5 bg-white/[0.06] hover:bg-white/10 text-white/70 text-sm font-semibold rounded-xl border border-white/10 transition-all"
            >
              Back to Studio
            </button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre className="text-left text-[10px] text-red-400/60 bg-red-500/5 border border-red-500/10 rounded-lg p-4 overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

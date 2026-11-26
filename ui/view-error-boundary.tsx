import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/error-monitor";

interface Props {
  children: ReactNode;
  /** Human name shown in the fallback, e.g. "reasoning tree". */
  label: string;
  /** Optional compact fallback (for small embedded widgets). */
  compact?: boolean;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * View-level error boundary.
 *
 * WHY (Phase 1 — blank screens): App.tsx has ONE route-level boundary, so any
 * throw inside a widget (d3 graph, feed row, dashboard grid) unmounted the
 * whole route and the user lost the entire page — the classic "one bad post
 * blanks the feed" failure. This boundary isolates a single view: its
 * fallback replaces just that region, the rest of the page keeps working.
 *
 * It also reports to the local error monitor. Server-side client error
 * ingestion is paused pending a privacy and retention review.
 */
export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] render error:`, error, info.componentStack);
    reportError({
      message: `[${this.props.label}] ${error.message}`,
      name: error.name,
      stack: error.stack,
      at: Date.now(),
    });
  }

  private reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.compact) {
      return (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[12px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 flex-1">The {this.props.label} couldn’t be displayed.</span>
          <button type="button" onClick={this.reset} className="font-medium text-primary hover:underline">
            Retry
          </button>
        </div>
      );
    }

    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-destructive/30 bg-destructive/5 p-8 text-center"
      >
        <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
        <div>
          <h3 className="text-sm font-semibold text-foreground">The {this.props.label} hit a snag</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The rest of the page still works — your data is safe locally.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={this.reset} className="gap-2">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
        </Button>
      </div>
    );
  }
}

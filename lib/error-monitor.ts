import { env } from "./env";

export interface ErrorReport {
  message: string;
  name?: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  route?: string;
  at: number;
}

type Listener = (report: ErrorReport) => void;

const listeners = new Set<Listener>();
const MAX_QUEUED = 50;
const queue: ErrorReport[] = [];

/** Subscribe to reported errors. Returns an unsubscribe function. */
export function subscribeToErrors(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Programmatically report an error (e.g. from an error boundary). */
export function reportError(input: Partial<ErrorReport> & { message: string }) {
  report(input);
}

function report(input: Partial<ErrorReport> & { message: string }) {
  const reportData: ErrorReport = {
    message: input.message,
    at: input.at ?? Date.now(),
    route: input.route ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
    name: input.name,
    stack: input.stack,
    source: input.source,
    lineno: input.lineno,
    colno: input.colno,
  };
  queue.push(reportData);
  if (queue.length > MAX_QUEUED) queue.shift();
  for (const listener of listeners) {
    try {
      listener(reportData);
    } catch {
      // Never let a listener break the monitor.
    }
  }

  // Do not transmit unreviewed messages, URLs or stacks: they may contain
  // private content. Local listeners/queue and development console remain.
  if (!env.isProd) {
    console.error("[error-monitor]", reportData.message, reportData.stack);
  }
}

let installed = false;

/**
 * Installs global handlers for uncaught errors and unhandled promise
 * rejections. Safe to call more than once.
 */
export function installErrorMonitor(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const error = event.error;
    report({
      message: error?.message || event.message || "Unknown error",
      name: error?.name,
      stack: error?.stack,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    report({
      message,
      name: reason?.name || "UnhandledRejection",
      stack: reason?.stack,
    });
  });
}

export function __drainErrorQueue_forTests(): ErrorReport[] {
  return [...queue];
}

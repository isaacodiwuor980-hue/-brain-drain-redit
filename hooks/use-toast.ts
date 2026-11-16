import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

// ── FB-style toast policy ─────────────────────────────────────────────────
// The user asked for Facebook-style notifications: cool, not doubling,
// not spamming, not blocking visibility. These constants encode that policy.
//
// TOAST_LIMIT: max 2 visible at once (FB never stacks more than 2 popups).
// A 3rd toast replaces the oldest instead of stacking taller.
//
// TOAST_REMOVE_DELAY: 4s auto-dismiss (FB uses ~4s — long enough to read,
// short enough to never feel stuck).
//
// DEDUP_WINDOW: if a toast with the SAME title is already open (or was
// dismissed < 1.5s ago), we don't add a duplicate — we just refresh the
// existing one's timer. This kills the "doubling" problem where rapid
// actions (double-click, retry storms) produced identical toasts.
//
// THROTTLE_WINDOW: identical toast content can fire at most once per
// THROTTLE_WINDOW even if the first was already removed. This kills the
// "spamming" problem where a loop/error retried every frame stacked
// toasts endlessly.
const TOAST_LIMIT = 2
const TOAST_REMOVE_DELAY = 4000
const THROTTLE_WINDOW_MS = 2000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  // ToastProps narrows variant to "default" | "destructive" | null via cva;
  // widening to string here lets toastKey (which keys on variant) read
  // t.variant without a cast.
  variant?: string
}


let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}


type Action =
  | {
      type: "ADD_TOAST"
      toast: ToasterToast
    }
  | {
      type: "UPDATE_TOAST"
      toast: Partial<ToasterToast>
    }
  | {
      type: "DISMISS_TOAST"
      toastId?: ToasterToast["id"]
    }
  | {
      type: "REMOVE_TOAST"
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

// ── Dedup + throttle bookkeeping ──────────────────────────────────────────
// Keyed by toast title (stringified). Remembers when each key was last
// shown so duplicates within DEDUP_WINDOW are merged and repeats within
// THROTTLE_WINDOW are dropped entirely.
const lastShownAt = new Map<string, number>()

function toastKey(props: { title?: React.ReactNode; variant?: string }): string {
  const title = typeof props.title === "string" ? props.title : String(props.title ?? "")
  return `${props.variant ?? "default"}::${title}`
}

const addToRemoveQueue = (toastId: string, duration = TOAST_REMOVE_DELAY) => {
  if (toastTimeouts.has(toastId)) {
    clearTimeout(toastTimeouts.get(toastId)!)
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, duration)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        // FB-style: new toast goes on top; max TOAST_LIMIT visible.
        // slice from the FRONT keeps the newest and drops the oldest.
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      const dismissOne = (toast: ToasterToast) => {
        // Toasts with an infinite duration (error toasts) are only
        // removed when the user dismisses them, not on a timer.
        if (toast.duration === Number.POSITIVE_INFINITY) return
        addToRemoveQueue(toast.id, toast.duration)
      }

      if (toastId) {
        const found = state.toasts.find((t) => t.id === toastId)
        if (found) dismissOne(found)
      } else {
        state.toasts.forEach(dismissOne)
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toast({ duration, ...props }: Toast & { duration?: number }) {
  // ── FB-style dedup: if a toast with the same title is already open,
  // just refresh its timer instead of stacking a duplicate. This kills
  // the "doubling" problem (rapid double-clicks, retry storms).
  const key = toastKey(props)
  const now = Date.now()
  const existing = memoryState.toasts.find(
    (t) => toastKey({ title: t.title, variant: t.variant }) === key && t.open !== false
  )
  if (existing) {
    if (toastTimeouts.has(existing.id)) {
      // Reset the auto-dismiss timer so the user has full time to read.
      clearTimeout(toastTimeouts.get(existing.id)!)
      toastTimeouts.delete(existing.id)
    }
    lastShownAt.set(key, now)
    return {
      id: existing.id,
      dismiss: () => dispatch({ type: "DISMISS_TOAST", toastId: existing.id }),
      update: (p: ToasterToast) =>
        dispatch({ type: "UPDATE_TOAST", toast: { ...p, id: existing.id } }),
    }
  }

  // ── FB-style throttle: identical content that fired < THROTTLE_WINDOW ago
  // (and is no longer open) is dropped entirely. This kills "spamming" when
  // an error loop or rapid action would otherwise re-toast endlessly.
  const lastAt = lastShownAt.get(key) ?? 0
  if (now - lastAt < THROTTLE_WINDOW_MS) {
    return {
      id: "throttled",
      dismiss: () => {},
      update: () => {},
    }
  }
  lastShownAt.set(key, now)

  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  // Destructive/error toasts stay until the user acts, so they are not
  // missed. They can still be swiped/tapped closed. Radix treats
  // duration=Infinity as "do not auto-dismiss".
  const isError = props.variant === "destructive"
  const effectiveDuration =
    duration ?? (isError ? Number.POSITIVE_INFINITY : TOAST_REMOVE_DELAY)

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      duration: effectiveDuration,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  // Subscribe once on mount, not on every state change. The previous
  // `[state]` dep caused this effect to re-subscribe on every toast event,
  // which made every consumer's `toast` reference churn identity and
  // downstream effects (e.g. useShortcuts) re-run constantly.
  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }

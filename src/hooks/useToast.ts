"use client";

// Inspired by react-hot-toast library
import type React from "react";
import { useState, useEffect } from "react";

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_DEFAULT_DURATION = 5000; // 5 seconds default visible time
const TOAST_REMOVE_DELAY = 500; // delay after dismiss to remove from DOM

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  duration?: number
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const autoDismissTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string, delay = TOAST_REMOVE_DELAY) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, delay)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      // schedule auto-dismiss using provided duration or default
      {
        const duration = action.toast.duration ?? TOAST_DEFAULT_DURATION
        // clear any existing auto-dismiss for this id (precaution)
        if (autoDismissTimeouts.has(action.toast.id)) {
          clearTimeout(autoDismissTimeouts.get(action.toast.id))
          autoDismissTimeouts.delete(action.toast.id)
        }

        const autoTimeout = setTimeout(() => {
          autoDismissTimeouts.delete(action.toast.id)
          dispatch({ type: "DISMISS_TOAST", toastId: action.toast.id })
        }, duration)

        autoDismissTimeouts.set(action.toast.id, autoTimeout)

        return {
          ...state,
          toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
        }
      }

    case "UPDATE_TOAST":
      // allow updating duration and reschedule auto-dismiss if provided
      if (action.toast.id && typeof action.toast.duration === 'number') {
        const id = action.toast.id
        if (autoDismissTimeouts.has(id)) {
          clearTimeout(autoDismissTimeouts.get(id))
          autoDismissTimeouts.delete(id)
        }
        const newTimeout = setTimeout(() => {
          autoDismissTimeouts.delete(id)
          dispatch({ type: "DISMISS_TOAST", toastId: id })
        }, action.toast.duration)
        autoDismissTimeouts.set(id, newTimeout)
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        // clear auto-dismiss if any
        if (autoDismissTimeouts.has(toastId)) {
          clearTimeout(autoDismissTimeouts.get(toastId))
          autoDismissTimeouts.delete(toastId)
        }
        addToRemoveQueue(toastId, TOAST_REMOVE_DELAY)
      } else {
        state.toasts.forEach((toast) => {
          if (autoDismissTimeouts.has(toast.id)) {
            clearTimeout(autoDismissTimeouts.get(toast.id))
            autoDismissTimeouts.delete(toast.id)
          }
          addToRemoveQueue(toast.id, TOAST_REMOVE_DELAY)
        })
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
      // cleanup timeouts
      if (action.toastId) {
        if (autoDismissTimeouts.has(action.toastId)) {
          clearTimeout(autoDismissTimeouts.get(action.toastId))
          autoDismissTimeouts.delete(action.toastId)
        }
        if (toastTimeouts.has(action.toastId)) {
          clearTimeout(toastTimeouts.get(action.toastId))
          toastTimeouts.delete(action.toastId)
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

export type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      duration: props.duration ?? TOAST_DEFAULT_DURATION,
      open: true,
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
  const [state, setState] = useState<State>(memoryState)

  useEffect(() => {
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

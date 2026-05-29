import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ToastContainer } from '../components/Toast'

// ─── Types ──────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
  exiting: boolean
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (message: string, type?: ToastType, duration?: number) => void
  removeToast: (id: string) => void
}

// ─── Global toast function (for use outside React, e.g. API client) ─

let globalAddToast: ((message: string, type?: ToastType, duration?: number) => void) | null = null

export function showToast(message: string, type?: ToastType, duration?: number) {
  globalAddToast?.(message, type, duration)
}

// ─── Context ────────────────────────────────────────────────────────

export const ToastContext = createContext<ToastContextValue>({} as ToastContextValue)

let idCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    // Start exit animation, then remove after transition
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 300)
  }, [])

  const addToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `toast-${++idCounter}`
    const toast: Toast = { id, message, type, duration, exiting: false }
    setToasts(prev => [...prev, toast])

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration)
    }
  }, [removeToast])

  // Register global toast function for non-React callers
  useEffect(() => {
    globalAddToast = addToast
    return () => { globalAddToast = null }
  }, [addToast])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx.addToast) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return { addToast: ctx.addToast, removeToast: ctx.removeToast }
}

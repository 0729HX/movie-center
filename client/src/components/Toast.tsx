import type { Toast as ToastData, ToastType } from '../context/ToastContext'

// ─── Toast Container ────────────────────────────────────────────────

interface ToastContainerProps {
  toasts: ToastData[]
  removeToast: (id: string) => void
}

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={removeToast} />
      ))}
    </div>
  )
}

// ─── Single Toast ───────────────────────────────────────────────────

function ToastItem({ toast, onClose }: { toast: ToastData; onClose: (id: string) => void }) {
  return (
    <div className={`toast toast-${toast.type}${toast.exiting ? ' toast-exit' : ''}`}>
      <span className="toast-icon">{iconForType(toast.type)}</span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={() => onClose(toast.id)} aria-label="关闭">
        &times;
      </button>
    </div>
  )
}

function iconForType(type: ToastType): string {
  switch (type) {
    case 'success': return '✓'
    case 'error': return '✗'
    case 'warning': return '⚠'
    case 'info': return 'ℹ'
  }
}

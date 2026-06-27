import { useEffect } from "react";
import { useVault } from "../store/useVault";
import type { Toast } from "../store/useVault";
import "./Toaster.css";

function ToastRow({ toast }: { toast: Toast }) {
  const dismiss = useVault((s) => s.dismissToast);
  useEffect(() => {
    const t = window.setTimeout(() => dismiss(toast.id), 4200);
    return () => window.clearTimeout(t);
  }, [toast.id, dismiss]);

  return (
    <div className="toast">
      <span className="toast-msg">{toast.message}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action!.run();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" onClick={() => dismiss(toast.id)}>
        ×
      </button>
    </div>
  );
}

export default function Toaster() {
  const toasts = useVault((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
    </div>
  );
}

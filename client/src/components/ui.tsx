import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { STATUS_META } from '../lib/catalog';
import type { ProjectStatus } from '../lib/types';

export const Spinner = () => <span className="spinner" aria-hidden="true" />;

export function FullScreenLoader({ label = 'Loading Project Atlas…' }: { label?: string }) {
  return (
    <div className="loader-screen" role="status">
      <div className="row" style={{ flexDirection: 'column', gap: 16 }}>
        <div className="loader-orbit" />
        <span className="subtle">{label}</span>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const meta = STATUS_META[status] ?? { label: status, tone: '' };
  return (
    <span className={`badge badge-status ${meta.tone ? `badge-${meta.tone}` : ''}`}>
      {meta.label}
    </span>
  );
}

export function DemoBadge({ compact }: { compact?: boolean }) {
  return (
    <span className="badge badge-demo" title="Sample data for demonstration. Replace via Project Management.">
      {compact ? 'Demo' : 'Demo data'}
    </span>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  const Icon = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle }[tone];
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function StateMessage({ icon, title, message, action, tone }: {
  icon: ReactNode; title: string; message?: ReactNode; action?: ReactNode; tone?: 'error';
}) {
  return (
    <div className={`state ${tone === 'error' ? 'state-error' : ''}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="state-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: { message: string } | null; onRetry?: () => void }) {
  return (
    <StateMessage
      tone="error"
      icon={<XCircle size={28} />}
      title="Something went wrong"
      message={error?.message ?? 'The information could not be loaded.'}
      action={onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    />
  );
}

export function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="project-grid" aria-busy="true" aria-label="Loading projects">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pcard" aria-hidden="true">
          <div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 0 }} />
          <div className="pcard-body">
            <div className="skeleton" style={{ height: 12, width: '30%' }} />
            <div className="skeleton" style={{ height: 18, width: '70%' }} />
            <div className="skeleton" style={{ height: 12, width: '90%' }} />
            <div className="skeleton" style={{ height: 12, width: '60%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

/** Accessible label + hint + error wrapper. Children receive the input props. */
export function Field({ label, required, hint, error, className, children }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {hint && !error && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="field-error" id={`${id}-err`}><XCircle size={14} aria-hidden="true" />{error}</span>}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-text"><strong>{label}</strong>{description && <span>{description}</span>}</span>
    </label>
  );
}

export function Modal({ title, onClose, children, footer, wide }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const items = ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]');
        if (!items.length) return;
        const firstEl = items[0], lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="btn btn-ghost icon-btn btn-sm" onClick={onClose} aria-label="Close" data-close><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel, children, disabled }: {
  title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; disabled?: boolean;
  onConfirm: () => void; onCancel: () => void; children?: ReactNode;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={<>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy || disabled}>
          {busy && <Spinner />}{confirmLabel}
        </button>
      </>}
    >
      <div className="muted">{message}</div>
      {children}
    </Modal>
  );
}

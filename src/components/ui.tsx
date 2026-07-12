import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Inbox, Plus, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

/* ─── PageTitle ───────────────────────────────────────────────────────
   Pulls org name from auth context instead of hardcoding it. */
export function PageTitle({
  title,
  subtitle,
  action,
  onAction,
  trailing,
}: {
  title: string;
  subtitle: string;
  action?: string;
  onAction?: () => void;
  trailing?: ReactNode;
}) {
  const { activeOrganization } = useAuth();
  const orgName = activeOrganization?.name ?? "TransportFlow";
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <span>{subtitle}</span>
      </div>
      <div className="flex items-center gap-3">
        {trailing}
        {action && (
          <button className="btn-primary" onClick={onAction}>
            <Plus size={14} />
            {action}
          </button>
        )}
      </div>
    </div>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/* ─── KpiGrid ──────────────────────────────────────────────────────────
   API is unchanged: items: [label, value, note][]
   First two items get the "featured" hero treatment automatically. */
export function KpiGrid({ items }: { items: [string, string, string][] }) {
  return (
    <div className="kpi-grid">
      {items.map(([label, value, note], index) => (
        <SummaryCard
          key={label}
          title={label}
          value={value}
          note={note}
          featured={index < 2}
        />
      ))}
    </div>
  );
}

export function SummaryCard({
  title,
  value,
  note,
  featured = false,
}: {
  title: string;
  value: string;
  note: string;
  featured?: boolean;
}) {
  return (
    <div className={`summary-card ${featured ? "summary-card-featured" : ""}`}>
      <p>{title}</p>
      <strong className="num">{value}</strong>
      <span>{note}</span>
    </div>
  );
}

export function InfoCard({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <Card title={title}>
      <dl className="info-list">
        {rows.map(([key, value]) => (
          <div key={key} className="info-row">
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function DataTable({
  title,
  columns,
  rows,
}: {
  title?: string;
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="table-card">
      {title && (
        <div className="table-title">
          <h3>{title}</h3>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase().replaceAll(" ", "-");
  return <span className={`status status-${key}`}>{label ?? status}</span>;
}

type ModalSize = "small" | "medium" | "large" | "wide" | "page";

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "medium",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const modal = (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal-panel modal-${size}`}
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close modal" type="button">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="modal-footer modal-footer-inline">{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="form-section">
      <div className="form-section-header">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="form-grid">{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}

export function HelpText({ children }: { children: ReactNode }) {
  return <p className="field-help">{children}</p>;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  includeAll = false,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  includeAll?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {includeAll && <option value="">All</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SelectOrNewField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  const [addingNew, setAddingNew] = useState(!options.includes(value));
  const selectValue = options.includes(value) ? value : "";

  if (addingNew) {
    return (
      <label className="field">
        <span>{label}</span>
        <div className="select-new-row">
          <input
            value={value}
            placeholder={`Enter new ${label.toLowerCase()}`}
            onChange={(event) => onChange(event.target.value)}
            autoFocus
          />
          <button
            type="button"
            className="table-action"
            onClick={() => {
              setAddingNew(false);
              if (!options.includes(value)) onChange(options[0] || "");
            }}
          >
            Saved
          </button>
        </div>
      </label>
    );
  }

  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={selectValue}
        onChange={(event) => {
          if (event.target.value === "__add_new__") {
            setAddingNew(true);
            onChange("");
            return;
          }
          onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="__add_new__">Add new...</option>
      </select>
    </label>
  );
}

export function ChartWrap({ children }: { children: ReactNode }) {
  return <div className="h-72 w-full">{children}</div>;
}

export function EmptyState({ text, action, onAction, icon }: { text: string; action?: string; onAction?: () => void; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon ?? <Inbox size={36} />}
      <span>{text}</span>
      {action && (
        <button className="btn-ghost empty-state-action" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-text" style={{ width: "40%" }} />
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-text" style={{ width: "65%" }} />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table-card">
      <div className="table-title">
        <div className="skeleton skeleton-text" style={{ width: "140px" }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-table-row">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ))}
    </div>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onClose, 2800);
    return () => window.clearTimeout(id);
  }, [onClose]);
  return (
    <div className="toast">
      {message}
    </div>
  );
}

/* ─── Period selector — for date-range tabs ─────────────────────────── */
export function PeriodSelector<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="period">
      {options.map((option) => (
        <button
          key={option}
          className={value === option ? "active" : ""}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

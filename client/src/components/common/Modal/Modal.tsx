import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";

/**
 * Modal — Technow Design System
 * Base reutilizable para todos los diálogos. Centraliza:
 *   - overlay con scrim + click-para-cerrar (configurable)
 *   - tecla Escape para cerrar (configurable)
 *   - bloqueo de scroll del body mientras está abierto
 *   - foco inicial + role/aria-modal para accesibilidad
 *   - portal a document.body para evitar problemas de z-index/overflow
 */

type Size = "sm" | "md" | "lg" | "xl" | "2xl" | "4xl" | "6xl";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: Size;
  /** Cerrar al hacer click en el fondo. Default: true. */
  closeOnOverlay?: boolean;
  /** Cerrar con tecla Escape. Default: true. */
  closeOnEscape?: boolean;
  /** Mostrar botón X. Default: true. */
  showClose?: boolean;
  /** Slot de footer (botones de acción). */
  footer?: ReactNode;
  /** Elemento a enfocar al abrir. Si no se pasa, enfoca el contenedor. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

const sizeClasses: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  closeOnOverlay = true,
  closeOnEscape = true,
  showClose = true,
  footer,
  initialFocusRef,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose puede ser una función nueva en cada render del padre (el POS
  // re-renderiza seguido). La guardamos en un ref para que el efecto no se
  // reinicie en cada render — eso causaba parpadeos y focus-stealing.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // El cierre por click en el backdrop solo debe ocurrir si el gesto EMPEZÓ
  // sobre el backdrop. Sin esto, arrastrar (ej. seleccionar texto en un input)
  // y soltar fuera del panel cerraba el modal por accidente.
  const downOnOverlayRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    // Elemento que tenía el foco antes de abrir, para restaurarlo al cerrar.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Lista de elementos enfocables dentro del panel (para el focus-trap).
    const getFocusable = (): HTMLElement[] => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEscape) {
        onCloseRef.current();
        return;
      }
      // Focus-trap: el Tab nunca debe salir del modal.
      if (e.key === "Tab") {
        const focusable = getFocusable();
        if (focusable.length === 0) {
          e.preventDefault();
          panelRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t = window.setTimeout(() => {
      if (initialFocusRef?.current) initialFocusRef.current.focus();
      else panelRef.current?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      // Devolver el foco al disparador (si sigue en el DOM).
      previouslyFocused?.focus?.();
    };
  }, [open, closeOnEscape, initialFocusRef]);

  if (!open) return null;

  const titleId = title ? "modal-title" : undefined;
  const descId = description ? "modal-desc" : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        downOnOverlayRef.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (
          closeOnOverlay &&
          downOnOverlayRef.current &&
          e.target === e.currentTarget
        ) {
          onClose();
        }
        downOnOverlayRef.current = false;
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={`relative w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col bg-surface rounded-xl shadow-modal border border-border focus:outline-none`}
      >
        {(title || showClose) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-border">
            <div className="min-w-0">
              {title && (
                <h2
                  id={titleId}
                  className="font-display text-lg font-semibold text-text truncate"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-0.5 text-sm text-text-muted">
                  {description}
                </p>
              )}
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="shrink-0 -mr-2 -mt-1 inline-flex items-center justify-center w-9 h-9 rounded-md text-text-muted hover:text-text hover:bg-surface-muted transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-surface-sunken/50 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

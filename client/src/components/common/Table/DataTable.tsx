import { useState } from "react";
import {
  PencilSquareIcon,
  TrashIcon,
  CreditCardIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
} from "@heroicons/react/24/outline";

interface DataTableRow {
  id: string | number;
  [key: string]: unknown;
}

interface DataTableColumn<T extends DataTableRow> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  status?: boolean;
  /** Si false, la columna no es ordenable. Default: true (compat). */
  sortable?: boolean;
  /** Alineación del contenido. Default: "left". */
  align?: "left" | "right" | "center";
  /** Para montos/cantidades: aplica tabular-nums + alinea a la derecha. */
  numeric?: boolean;
}

interface DataTableProps<T extends DataTableRow> {
  columns: DataTableColumn<T>[];
  data: T[];
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  onViewCredit?: (item: T) => void;
  emptyMessage?: string;
  actions?: boolean;
  customActions?: (item: T) => React.ReactNode;
  getStatusColor?: (status: unknown) => string;
  getStatusText?: (status: unknown) => string;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string, order: "asc" | "desc") => void;
}

function alignClass(col: { align?: string; numeric?: boolean }): string {
  if (col.numeric || col.align === "right") return "text-right";
  if (col.align === "center") return "text-center";
  return "text-left";
}

function renderCell<T extends DataTableRow>(
  column: DataTableColumn<T>,
  item: T,
  getStatusColor?: (status: unknown) => string,
  getStatusText?: (status: unknown) => string
): React.ReactNode {
  if (column.render) return column.render(item);

  if (column.status) {
    const raw = item[column.key];
    return (
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ${
            getStatusColor?.(raw) || "bg-text-subtle"
          }`}
        />
        {getStatusText?.(raw) ?? String(raw ?? "-")}
      </span>
    );
  }

  const value = item[column.key];
  if (value == null || value === "") return "-";
  return String(value);
}

function DataTable<T extends DataTableRow>({
  columns,
  data,
  onEdit,
  onDelete,
  onViewCredit,
  emptyMessage = "No se encontraron registros",
  actions = true,
  customActions,
  getStatusColor,
  getStatusText,
  sortKey,
  sortOrder,
  onSort,
}: DataTableProps<T>) {
  const [localSortKey, setLocalSortKey] = useState<string | null>(null);
  const [localSortOrder, setLocalSortOrder] = useState<"asc" | "desc">("asc");

  const activeKey = onSort ? sortKey : localSortKey;
  const activeOrder = onSort ? sortOrder : localSortOrder;

  const sortedData =
    !onSort && localSortKey
      ? [...data].sort((a, b) => {
          const aValue = a[localSortKey];
          const bValue = b[localSortKey];
          if (aValue == null) return 1;
          if (bValue == null) return -1;
          if (aValue === bValue) return 0;
          const cmp = aValue > bValue ? 1 : -1;
          return localSortOrder === "asc" ? cmp : -cmp;
        })
      : data;

  const handleSort = (key: string) => {
    if (onSort) {
      onSort(key, activeKey === key && activeOrder === "asc" ? "desc" : "asc");
    } else if (localSortKey === key) {
      setLocalSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setLocalSortKey(key);
      setLocalSortOrder("asc");
    }
  };

  const colCount = columns.length + (actions ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border shadow-card bg-surface">
      <table className="w-full text-sm text-left text-text">
        <thead className="text-xs uppercase tracking-wide text-text-muted bg-surface-sunken">
          <tr>
            {columns.map((column) => {
              const isSortable = column.sortable !== false;
              const isActive = activeKey === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    isActive
                      ? activeOrder === "asc"
                        ? "ascending"
                        : "descending"
                      : isSortable
                      ? "none"
                      : undefined
                  }
                  className={`px-4 py-3 font-semibold ${alignClass(column)}`}
                >
                  {isSortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className={`group inline-flex items-center gap-1 select-none cursor-pointer hover:text-text transition-colors ${
                        column.numeric || column.align === "right"
                          ? "flex-row-reverse"
                          : ""
                      } ${isActive ? "text-text" : ""}`}
                    >
                      <span>{column.label}</span>
                      {isActive ? (
                        activeOrder === "asc" ? (
                          <ChevronUpIcon className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDownIcon className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ChevronUpDownIcon className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
            {actions && (
              <th scope="col" className="px-4 py-3 font-semibold text-right">
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sortedData.map((item) => (
            <tr
              key={item.id}
              className="bg-surface hover:bg-surface-muted transition-colors"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 align-middle ${alignClass(column)} ${
                    column.numeric ? "font-num" : ""
                  }`}
                >
                  {renderCell(column, item, getStatusColor, getStatusText)}
                </td>
              ))}
              {actions && (
                <td className="px-4 py-3 text-right">
                  {customActions ? (
                    customActions(item)
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(item)}
                          aria-label="Editar"
                          title="Editar"
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md text-brand-700 hover:bg-brand-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </button>
                      )}
                      {onViewCredit && item.VentaTipo === "CR" && (
                        <button
                          onClick={() => onViewCredit(item)}
                          aria-label="Ver detalles de crédito"
                          title="Ver detalles de crédito"
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md text-success-700 hover:bg-success-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-success-600/40"
                        >
                          <CreditCardIcon className="h-5 w-5" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(item)}
                          aria-label="Eliminar"
                          title="Eliminar"
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md text-danger-700 hover:bg-danger-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-600/40"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}

          {data.length === 0 && (
            <tr>
              <td
                colSpan={colCount}
                className="px-4 py-10 text-center text-text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;

// import React from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (items: number) => void;
}

const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage,
  onItemsPerPageChange,
}: PaginationProps) => {
  // Calcular el rango de páginas a mostrar
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      // Mostrar todas las páginas si son pocas
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pageNumbers = [];
    const maxVisiblePages = 2; // Menos páginas visibles en mobile

    // Siempre mostrar la primera página
    pageNumbers.push(1);

    // Calcular el rango alrededor de la página actual
    let startPage = Math.max(2, currentPage - maxVisiblePages);
    let endPage = Math.min(totalPages - 1, currentPage + maxVisiblePages);

    // Asegurarse de que mostramos suficientes páginas si estamos cerca de los extremos
    if (currentPage <= 3) {
      endPage = 4;
    } else if (currentPage >= totalPages - 2) {
      startPage = totalPages - 3;
    }

    // Agregar puntos suspensivos si hay un salto entre la primera página y el rango
    if (startPage > 2) {
      pageNumbers.push("...");
    }

    // Agregar páginas en el rango calculado
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    // Agregar puntos suspensivos si hay un salto entre el rango y la última página
    if (endPage < totalPages - 1) {
      pageNumbers.push("...");
    }

    // Siempre mostrar la última página
    pageNumbers.push(totalPages);

    return pageNumbers;
  };

  const pageNumbers = getPageNumbers();

  const itemBtn =
    "px-3 py-1.5 border-t border-b border-border bg-surface text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 whitespace-nowrap";

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
      <div className="flex items-center order-2 sm:order-1">
        <label htmlFor="items-per-page" className="mr-2 text-sm text-text-muted">
          Mostrar:
        </label>
        <select
          id="items-per-page"
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="border border-border rounded-md px-2 py-1 text-sm bg-surface text-text cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      <nav
        aria-label="Paginación"
        className="inline-flex rounded-md shadow-card order-1 sm:order-2 w-full sm:w-auto overflow-x-auto sm:overflow-visible"
      >
        <div className="flex">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Página anterior"
            className="px-3 py-1.5 rounded-l-md border border-border bg-surface text-sm font-medium text-text-muted hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 whitespace-nowrap cursor-pointer"
          >
            Anterior
          </button>

          {pageNumbers.map((number, index) => {
            if (typeof number !== "number") {
              return (
                <span
                  key={`ellipsis-${index}`}
                  aria-hidden="true"
                  className={`${itemBtn} text-text-subtle cursor-default`}
                >
                  …
                </span>
              );
            }
            const isCurrent = currentPage === number;
            return (
              <button
                key={number}
                onClick={() => onPageChange(number)}
                aria-label={`Página ${number}`}
                aria-current={isCurrent ? "page" : undefined}
                className={`${itemBtn} cursor-pointer ${
                  isCurrent
                    ? "text-brand-700 bg-brand-50"
                    : "text-text-muted hover:bg-surface-muted"
                }`}
              >
                {number}
              </button>
            );
          })}

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Página siguiente"
            className="px-3 py-1.5 rounded-r-md border border-border bg-surface text-sm font-medium text-text-muted hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 whitespace-nowrap cursor-pointer"
          >
            Siguiente
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Pagination;

import React, { useState, useMemo } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import ClienteFormModal from "./ClienteFormModal";
import type { Cliente } from "./ClienteFormModal";
import { Button, TextInput, Badge, Modal, EmptyState } from "./ui";
import Pagination from "./Pagination";
import { formatMiles } from "../../utils/utils";

interface ClienteModalProps {
  show: boolean;
  onClose: () => void;
  clientes: Cliente[];
  onSelect: (cliente: Cliente) => void;
  onCreateCliente?: (cliente: Cliente) => void;
  currentUserId?: string;
}

const ClienteModal: React.FC<ClienteModalProps> = ({
  show,
  onClose,
  clientes,
  onSelect,
  onCreateCliente,
  currentUserId,
}) => {
  const [filtros, setFiltros] = useState({
    ruc: "",
    nombre: "",
    apellido: "",
    telefono: "",
  });
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const clientesFiltrados = useMemo(() => {
    return clientes.filter(
      (c) =>
        c.ClienteRUC?.toLowerCase().includes(filtros.ruc.toLowerCase()) &&
        c.ClienteNombre?.toLowerCase().includes(filtros.nombre.toLowerCase()) &&
        (c.ClienteApellido || "")
          ?.toLowerCase()
          .includes(filtros.apellido.toLowerCase()) &&
        (c.ClienteTelefono || "")
          ?.toLowerCase()
          .includes(filtros.telefono.toLowerCase()),
    );
  }, [clientes, filtros]);

  const totalPages = Math.ceil(clientesFiltrados.length / rowsPerPage);
  const paginatedClientes = clientesFiltrados.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  const handleCreateSubmit = (cliente: Cliente) => {
    if (onCreateCliente) {
      onCreateCliente(cliente);
      setShowCreateModal(false);
    }
  };

  return (
    <Modal open={show} onClose={onClose} size="4xl" title="Buscar cliente">
      <div className="flex flex-col">
        {onCreateCliente && (
          <div className="flex justify-end mb-4">
            <Button
              variant="primary"
              size="sm"
              leftIcon={PlusIcon}
              onClick={() => setShowCreateModal(true)}
            >
              Nuevo Cliente
            </Button>
          </div>
        )}
        <div className="bg-surface-sunken rounded-md p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <TextInput
              label="RUC"
              size="sm"
              placeholder="Buscar"
              value={filtros.ruc}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, ruc: e.target.value }))
              }
            />
            <TextInput
              label="Nombre"
              size="sm"
              placeholder="Buscar"
              value={filtros.nombre}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, nombre: e.target.value }))
              }
            />
            <TextInput
              label="Apellido"
              size="sm"
              placeholder="Buscar"
              value={filtros.apellido}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, apellido: e.target.value }))
              }
            />
            <TextInput
              label="Teléfono"
              size="sm"
              placeholder="Buscar"
              value={filtros.telefono}
              onChange={(e) =>
                setFiltros((f) => ({ ...f, telefono: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="overflow-auto rounded-md border border-border flex-1 min-h-0">
          <table className="min-w-full bg-surface text-sm">
            <thead className="sticky top-0 bg-surface-sunken z-10">
              <tr className="text-text-muted">
                <th className="py-2 px-4 text-left font-medium">RUC</th>
                <th className="py-2 px-4 text-left font-medium">Nombre</th>
                <th className="py-2 px-4 text-left font-medium">Apellido</th>
                <th className="py-2 px-4 text-left font-medium">Teléfono</th>
                <th className="py-2 px-4 text-left font-medium">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {paginatedClientes.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      fullPage={false}
                      title="No hay clientes"
                      description="Ajustá los filtros o creá uno nuevo."
                    />
                  </td>
                </tr>
              )}
              {paginatedClientes.map((c, idx) => (
                <tr
                  key={c.ClienteId}
                  className={`${
                    idx % 2 === 1 ? "bg-surface-sunken/50" : ""
                  } hover:bg-brand-50 cursor-pointer transition-colors duration-150`}
                  onClick={() => onSelect(c)}
                >
                  <td className="py-2 px-4 font-num">{c.ClienteRUC || ""}</td>
                  <td className="py-2 px-4">{c.ClienteNombre}</td>
                  <td className="py-2 px-4">{c.ClienteApellido || ""}</td>
                  <td className="py-2 px-4 font-num">
                    {c.ClienteTelefono || ""}
                  </td>
                  <td className="py-2 px-4">
                    {c.ClienteTipo === "MI" ? (
                      <Badge tone="neutral">Minorista</Badge>
                    ) : c.ClienteTipo === "MA" ? (
                      <Badge tone="info">Mayorista</Badge>
                    ) : (
                      c.ClienteTipo
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-text-muted font-num" aria-live="polite">
          {clientesFiltrados.length === 0
            ? "0 resultados"
            : `${formatMiles((page - 1) * rowsPerPage + 1)} a ${formatMiles(
                Math.min(page * rowsPerPage, clientesFiltrados.length),
              )} de ${formatMiles(clientesFiltrados.length)}`}
        </p>
        <Pagination
          currentPage={page}
          totalPages={Math.max(1, totalPages)}
          onPageChange={setPage}
          itemsPerPage={rowsPerPage}
          onItemsPerPageChange={(n) => {
            setRowsPerPage(n);
            setPage(1);
          }}
        />

        {/* Modal para crear cliente */}
        <ClienteFormModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateSubmit}
          currentUserId={currentUserId}
        />
      </div>
    </Modal>
  );
};

export default ClienteModal;

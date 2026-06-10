import { useEffect, useState } from "react";
import DataTable from "../common/Table/DataTable";
import SearchButton from "../common/Input/SearchButton";
import { Modal, Button, TextInput } from "../common/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
import Swal from "sweetalert2";

interface Menu {
  id: string;
  MenuId: string;
  MenuNombre: string;
  [key: string]: unknown;
}

interface MenusListProps {
  menus: Menu[];
  onEdit?: (menu: Menu) => void;
  onDelete?: (id: string) => void;
  onCreate?: () => void;
  isModalOpen: boolean;
  onCloseModal: () => void;
  currentMenu: Menu | null;
  onSubmit: (menu: Menu) => void;
  searchTerm: string;
  onSearch: (value: string) => void;
  onKeyPress?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchSubmit: () => void;
  pagination?: { totalItems?: number };
}

export default function MenusList({
  menus,
  onEdit,
  onDelete,
  onCreate,
  isModalOpen,
  onCloseModal,
  currentMenu,
  onSubmit,
  searchTerm,
  onSearch,
  onKeyPress,
  onSearchSubmit,
  pagination,
}: MenusListProps) {
  const [formData, setFormData] = useState({
    MenuId: "",
    MenuNombre: "",
  });

  useEffect(() => {
    if (currentMenu) {
      setFormData({
        MenuId: currentMenu.MenuId,
        MenuNombre: currentMenu.MenuNombre,
      });
    } else {
      setFormData({ MenuId: "", MenuNombre: "" });
    }
  }, [currentMenu]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "MenuNombre" ? value.toUpperCase() : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit({ ...currentMenu, ...formData } as Menu);
    Swal.fire({
      position: "top-end",
      icon: "success",
      title: currentMenu ? "Menú actualizado" : "Menú creado",
      showConfirmButton: false,
      timer: 2000,
    });
  };

  const columns = [
    { key: "MenuId", label: "ID" },
    { key: "MenuNombre", label: "Nombre" },
  ];

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1">
          <SearchButton
            searchTerm={searchTerm}
            onSearch={onSearch}
            onKeyPress={onKeyPress}
            onSearchSubmit={onSearchSubmit}
            placeholder="Buscar menús"
          />
        </div>
        <div className="py-4">
          {onCreate && (
            <Button leftIcon={PlusIcon} onClick={onCreate}>
              Nuevo Menú
            </Button>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-text-muted">
          Mostrando {menus.length} de {pagination?.totalItems ?? menus.length} menús
        </div>
      </div>
      <DataTable<Menu>
        columns={columns}
        data={menus}
        onEdit={onEdit}
        onDelete={onDelete ? (item) => onDelete(item.MenuId) : undefined}
        emptyMessage="No se encontraron menús"
      />
      <Modal
        open={isModalOpen}
        onClose={onCloseModal}
        size="lg"
        title={
          currentMenu
            ? `Editar menú: ${currentMenu.MenuNombre}`
            : "Crear nuevo menú"
        }
        footer={
          <>
            <Button variant="secondary" onClick={onCloseModal}>
              Cancelar
            </Button>
            <Button type="submit" form="menu-form">
              {currentMenu ? "Actualizar" : "Crear"}
            </Button>
          </>
        }
      >
        <form
          id="menu-form"
          onSubmit={handleSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <TextInput
            label="ID"
            name="MenuId"
            value={formData.MenuId}
            onChange={handleInputChange}
            required
            disabled={!!currentMenu}
          />
          <TextInput
            label="Nombre"
            name="MenuNombre"
            value={formData.MenuNombre}
            onChange={handleInputChange}
            className="uppercase"
            required
          />
        </form>
      </Modal>
    </>
  );
}

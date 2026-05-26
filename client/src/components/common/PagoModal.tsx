import React, { useState, useEffect } from "react";
import { createRegistroDiarioCaja } from "../../services/registros.service";
import { getTiposGasto } from "../../services/tipogasto.service";
import { getTiposGastoGrupo } from "../../services/tipogastogrupo.service";
import { updateCajaMonto } from "../../services/cajas.service";
import { getEstadoAperturaPorUsuario } from "../../services/registrodiariocaja.service";
import { getCajaById } from "../../services/cajas.service";
import Swal from "sweetalert2";
import { formatMiles } from "../../utils/utils";
import { Modal, Button, TextInput } from "./ui";

interface TipoGasto {
  TipoGastoId: number;
  TipoGastoDescripcion: string;
}
interface TipoGastoGrupo {
  TipoGastoGrupoId: number;
  TipoGastoGrupoDescripcion: string;
  TipoGastoId: number;
}

interface PagoModalProps {
  show: boolean;
  handleClose: () => void;
  cajaAperturada: { CajaId: number | string } | null;
  usuario: { id: number | string } | null;
}

const selectClasses =
  "w-full bg-surface border border-border rounded-md text-sm text-text px-3 py-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 hover:border-border-strong";
const labelClasses = "block text-xs font-medium text-text-muted mb-1";

const PagoModal: React.FC<PagoModalProps> = ({
  show,
  handleClose,
  cajaAperturada,
  usuario,
}) => {
  const [fecha, setFecha] = useState("");
  const [tipoGastoId, setTipoGastoId] = useState<number | "">("");
  const [tipoGastoGrupoId, setTipoGastoGrupoId] = useState<number | "">("");
  const [detalle, setDetalle] = useState("");
  const [monto, setMonto] = useState<number | "">("");
  const [tiposGasto, setTiposGasto] = useState<TipoGasto[]>([]);
  const [tiposGastoGrupo, setTiposGastoGrupo] = useState<TipoGastoGrupo[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (show) {
      const hoy = new Date();
      const yyyy = hoy.getFullYear();
      const mm = String(hoy.getMonth() + 1).padStart(2, "0");
      const dd = String(hoy.getDate()).padStart(2, "0");
      setFecha(`${yyyy}-${mm}-${dd}`);
      getTiposGasto().then(setTiposGasto);
      getTiposGastoGrupo().then(setTiposGastoGrupo);
    }
  }, [show]);

  const gruposFiltrados = tiposGastoGrupo.filter(
    (g) => g.TipoGastoId === tipoGastoId
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cajaAperturada || !usuario) return;
    setSubmitting(true);
    try {
      await createRegistroDiarioCaja({
        CajaId: cajaAperturada.CajaId,
        RegistroDiarioCajaFecha: fecha,
        TipoGastoId: tipoGastoId,
        TipoGastoGrupoId: tipoGastoGrupoId,
        RegistroDiarioCajaDetalle: detalle,
        RegistroDiarioCajaMonto: monto,
        UsuarioId: usuario.id,
      });
      const estado = await getEstadoAperturaPorUsuario(usuario.id);
      const cajaAperturadaId = estado.cajaId;
      const cajaActualizada = await getCajaById(cajaAperturadaId);
      const cajaMontoActual = cajaActualizada.CajaMonto;
      if (tipoGastoId === 1) {
        await updateCajaMonto(
          cajaAperturadaId,
          Number(cajaMontoActual) - Number(monto)
        );
      } else if (tipoGastoId === 2) {
        await updateCajaMonto(
          cajaAperturadaId,
          Number(cajaMontoActual) + Number(monto)
        );
      }
      Swal.fire(
        "Pago registrado",
        "El pago fue registrado correctamente",
        "success"
      );
      handleClose();
      setFecha("");
      setTipoGastoId("");
      setTipoGastoGrupoId("");
      setDetalle("");
      setMonto("");
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "No se pudo registrar el pago";
      Swal.fire("Error", errorMsg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={show}
      onClose={handleClose}
      size="md"
      title="Nuevo pago"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="pago-form"
            loading={submitting}
          >
            Guardar
          </Button>
        </>
      }
    >
      <form id="pago-form" onSubmit={handleSubmit} className="space-y-4">
        <TextInput
          label="Fecha"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          required
        />
        <div>
          <label className={labelClasses} htmlFor="pago-tipo">
            Tipo de gasto
          </label>
          <select
            id="pago-tipo"
            value={tipoGastoId}
            onChange={(e) => setTipoGastoId(Number(e.target.value))}
            required
            className={selectClasses}
          >
            <option value="">Seleccione...</option>
            {tiposGasto.map((tg) => (
              <option key={tg.TipoGastoId} value={tg.TipoGastoId}>
                {tg.TipoGastoDescripcion}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClasses} htmlFor="pago-grupo">
            Grupo de gasto
          </label>
          <select
            id="pago-grupo"
            value={tipoGastoGrupoId}
            onChange={(e) => setTipoGastoGrupoId(Number(e.target.value))}
            required
            className={selectClasses}
          >
            <option value="">Seleccione...</option>
            {gruposFiltrados.map((gg) => (
              <option key={gg.TipoGastoGrupoId} value={gg.TipoGastoGrupoId}>
                {gg.TipoGastoGrupoDescripcion}
              </option>
            ))}
          </select>
        </div>
        <TextInput
          label="Descripción"
          type="text"
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          required
        />
        <TextInput
          label="Monto"
          type="text"
          numeric
          value={monto !== "" ? formatMiles(monto) : ""}
          onChange={(e) => {
            const raw = e.target.value.replace(/\./g, "").replace(/,/g, ".");
            const num = Number(raw);
            setMonto(isNaN(num) ? "" : num);
          }}
          required
          inputMode="numeric"
          pattern="[0-9.]*"
        />
      </form>
    </Modal>
  );
};

export default PagoModal;

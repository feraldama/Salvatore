import React, { useState, useEffect } from "react";
import { BanknotesIcon, TruckIcon } from "@heroicons/react/24/outline";
import { formatMiles } from "../../utils/utils";
import { Modal, Button } from "./ui";

interface PaymentModalMayoristaProps {
  show: boolean;
  handleClose: () => void;
  // CONTADO: cobro inmediato (efectivo/tarjeta/transferencia/voucher).
  // ENVIO: se entregan los productos y el cliente paga al recibir; el saldo
  // queda en cuenta corriente. Admite una seña (efectivo) al confirmar.
  tipoVenta: "CONTADO" | "ENVIO";
  totalCost: number;
  totalRest: number;
  setTotalRest: (v: number) => void;
  efectivo: number;
  setEfectivo: (v: number) => void;
  banco: number;
  setBanco: (v: number) => void;
  bancoDebito: number;
  setBancoDebito: (v: number) => void;
  bancoCredito: number;
  setBancoCredito: (v: number) => void;
  cuentaCliente: number;
  setCuentaCliente: (v: number) => void;
  sendRequest: () => Promise<void>;
  setPrintTicket: (v: boolean) => void;
  printTicket: boolean;
  voucher: number;
  setVoucher: (v: number) => void;
  ventaNroPOS: string;
  setVentaNroPOS: (v: string) => void;
}

const PaymentModalMayorista: React.FC<PaymentModalMayoristaProps> = ({
  show,
  handleClose,
  tipoVenta,
  totalCost,
  totalRest,
  setTotalRest,
  efectivo,
  setEfectivo,
  banco,
  setBanco,
  bancoDebito,
  setBancoDebito,
  bancoCredito,
  setBancoCredito,
  cuentaCliente,
  setCuentaCliente,
  sendRequest,
  setPrintTicket,
  printTicket,
  voucher,
  setVoucher,
  ventaNroPOS,
  setVentaNroPOS,
}) => {
  const esEnvio = tipoVenta === "ENVIO";
  // En CONTADO el pad escribe sobre el método enfocado; en ENVIO siempre la seña.
  const [pagoTipo, setPagoTipoLocal] = useState<
    "E" | "B" | "D" | "CR" | "V" | "C"
  >("E");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // En ENVÍO hay que cobrar el total para confirmar. El saldo solo puede
  // quedar pendiente en cuenta corriente si el usuario lo habilita acá.
  const [permitirCC, setPermitirCC] = useState(false);

  const pagoConTarjeta = bancoDebito > 0 || bancoCredito > 0;
  const ventaNroPOSValido =
    !pagoConTarjeta ||
    (ventaNroPOS.trim().length >= 4 && /^\d+$/.test(ventaNroPOS.trim()));

  // Total cubierto por los métodos de pago (con recargo de tarjeta) y el saldo
  // que quedaría en cuenta corriente en un ENVÍO (lo no cobrado).
  const cubierto =
    efectivo + banco + bancoDebito * 1.03 + bancoCredito * 1.05 + voucher;
  const pendienteCC = Math.max(0, Math.round(totalCost - cubierto));

  // Reset al abrir, según el tipo de venta.
  useEffect(() => {
    if (!show) return;
    setBanco(0);
    setBancoDebito(0);
    setBancoCredito(0);
    setVoucher(0);
    setVentaNroPOS("");
    setPagoTipoLocal("E");
    setPermitirCC(false);
    if (esEnvio) {
      // Por defecto el total entero queda pendiente (sin seña).
      setEfectivo(0);
      setCuentaCliente(totalCost);
      setTotalRest(0);
    } else {
      setEfectivo(0);
      setCuentaCliente(0);
      setTotalRest(totalCost);
    }
    setTimeout(() => {
      document.getElementById("efectivo-input")?.focus();
    }, 100);
  }, [
    show,
    esEnvio,
    setEfectivo,
    setBanco,
    setBancoDebito,
    setBancoCredito,
    setCuentaCliente,
    setVoucher,
    setVentaNroPOS,
    setTotalRest,
    totalCost,
  ]);

  // Recalcula los montos con recargo de tarjeta (3%/5%).
  // CONTADO: totalRest = lo que falta (debe llegar a 0 para facturar).
  // ENVÍO: lo cobrado puede ser parcial; el saldo no cobrado va a cuenta
  //        corriente (cuentaCliente). totalRest solo refleja el vuelto.
  const recomputeContado = (over: Partial<{
    efectivo: number;
    banco: number;
    bancoDebito: number;
    bancoCredito: number;
    voucher: number;
    cuentaCliente: number;
  }> = {}) => {
    const efe = over.efectivo ?? efectivo;
    const ban = over.banco ?? banco;
    const deb = over.bancoDebito ?? bancoDebito;
    const cred = over.bancoCredito ?? bancoCredito;
    const vou = over.voucher ?? voucher;
    const restante = totalCost - efe - ban - deb * 1.03 - cred * 1.05 - vou;
    if (esEnvio) {
      // En ENVÍO la cuenta corriente se calcula sola (lo no cobrado).
      setCuentaCliente(Math.max(0, restante));
      setTotalRest(restante < 0 ? restante : 0);
    } else {
      // En CONTADO el usuario puede cargar manualmente un saldo a cuenta
      // del cliente (venta a crédito); ese monto también cubre el total.
      const cta = over.cuentaCliente ?? cuentaCliente;
      setTotalRest(restante - cta);
    }
  };

  const onNumberClickModal = (label: string | number) => {
    const append = (val: number, lbl: string | number) =>
      val === 0 ? Number(lbl) : Number(`${val}${lbl}`);

    if (pagoTipo === "E") {
      const v = append(efectivo, label);
      setEfectivo(v);
      recomputeContado({ efectivo: v });
    } else if (pagoTipo === "B") {
      const v = append(banco, label);
      setBanco(v);
      recomputeContado({ banco: v });
    } else if (pagoTipo === "D") {
      const v = append(bancoDebito, label);
      setBancoDebito(v);
      recomputeContado({ bancoDebito: v });
    } else if (pagoTipo === "CR") {
      const v = append(bancoCredito, label);
      setBancoCredito(v);
      recomputeContado({ bancoCredito: v });
    } else if (pagoTipo === "V") {
      const v = append(voucher, label);
      setVoucher(v);
      recomputeContado({ voucher: v });
    } else if (pagoTipo === "C") {
      const v = append(cuentaCliente, label);
      setCuentaCliente(v);
      recomputeContado({ cuentaCliente: v });
    }
  };

  const borrarMonto = () => {
    if (pagoTipo === "E") {
      setEfectivo(0);
      recomputeContado({ efectivo: 0 });
    } else if (pagoTipo === "B") {
      setBanco(0);
      recomputeContado({ banco: 0 });
    } else if (pagoTipo === "D") {
      setBancoDebito(0);
      recomputeContado({ bancoDebito: 0 });
    } else if (pagoTipo === "CR") {
      setBancoCredito(0);
      recomputeContado({ bancoCredito: 0 });
    } else if (pagoTipo === "V") {
      setVoucher(0);
      recomputeContado({ voucher: 0 });
    } else if (pagoTipo === "C") {
      setCuentaCliente(0);
      recomputeContado({ cuentaCliente: 0 });
    }
  };

  const puedeConfirmar = esEnvio
    ? !isSubmitting &&
      ventaNroPOSValido &&
      (permitirCC || pendienteCC === 0)
    : !isSubmitting && totalRest <= 0 && ventaNroPOSValido;

  const handleSendRequest = async () => {
    if (!puedeConfirmar) return;
    setIsSubmitting(true);
    try {
      await sendRequest();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSendRequest();
  };

  const buttonsPago = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    ["00", 0, "000"],
  ];

  const moneyInputCls = (active: boolean, invalid = false) =>
    [
      "w-32 rounded-md border px-2.5 py-1.5 text-base text-right font-num text-text",
      "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
      invalid
        ? "border-danger-500 bg-surface"
        : active
          ? "border-brand-500 bg-brand-50"
          : "border-border bg-surface hover:border-border-strong",
    ].join(" ");
  const rowCls = "flex items-center gap-2 mb-2.5";
  const labelCls = "flex-1 text-right text-sm text-text-muted";

  return (
    <Modal
      open={show}
      onClose={handleClose}
      title={esEnvio ? "Venta con envío (paga al recibir)" : "Cobro al contado"}
      size="4xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            leftIcon={esEnvio ? TruckIcon : BanknotesIcon}
            loading={isSubmitting}
            onClick={handleSendRequest}
            disabled={!puedeConfirmar}
          >
            {esEnvio ? "Confirmar envío" : "Facturar"}
          </Button>
        </>
      }
    >
      <div
        onKeyDown={handleKeyPress}
        className="grid grid-cols-1 sm:grid-cols-2 gap-6"
      >
        {/* Columna izquierda */}
        <div>
          {/* TOTAL */}
          <div className="flex items-center gap-2 mb-5">
            <div className="rounded-md bg-surface-muted px-4 py-2 text-lg font-bold text-text">
              Total
            </div>
            <div className="rounded-md bg-success-50 px-4 py-2 text-2xl font-bold text-success-700 tabular-nums">
              Gs. {formatMiles(totalCost)}
            </div>
          </div>

          {/* Métodos de pago (iguales para contado y envío) */}
          {/* Efectivo */}
              <div className={rowCls}>
                <label htmlFor="efectivo-input" className={labelCls}>
                  Efectivo:
                </label>
                <input
                  id="efectivo-input"
                  type="text"
                  inputMode="numeric"
                  aria-label="Monto en efectivo"
                  value={efectivo ? formatMiles(efectivo) : ""}
                  onFocus={(e) => {
                    setPagoTipoLocal("E");
                    e.target.select();
                  }}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/\D/g, ""));
                    setEfectivo(v);
                    recomputeContado({ efectivo: v });
                  }}
                  className={moneyInputCls(pagoTipo === "E")}
                />
              </div>

              {/* Transferencia */}
              <div className={rowCls}>
                <label htmlFor="transferencia-input" className={labelCls}>
                  Transferencia:
                </label>
                <input
                  id="transferencia-input"
                  type="text"
                  inputMode="numeric"
                  aria-label="Monto por transferencia"
                  value={banco ? formatMiles(banco) : ""}
                  onFocus={(e) => {
                    setPagoTipoLocal("B");
                    if (banco === 0 && totalRest > 0) {
                      setBanco(totalRest);
                      setTotalRest(0);
                    }
                    e.target.select();
                  }}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/\D/g, ""));
                    setBanco(v);
                    recomputeContado({ banco: v });
                  }}
                  className={moneyInputCls(pagoTipo === "B")}
                />
              </div>

              {/* Nota: en mayorista no se usan Tarjeta Débito/Crédito ni
                  Voucher, por eso esos campos no se muestran acá. */}

              {/* Cuenta de cliente (venta a crédito) - solo en CONTADO.
                  En ENVÍO el saldo a cuenta corriente se maneja con el
                  checkbox de más abajo. */}
              {!esEnvio && (
                <div className={rowCls}>
                  <label htmlFor="cuenta-cliente-input" className={labelCls}>
                    Crédito:
                  </label>
                  <input
                    id="cuenta-cliente-input"
                    type="text"
                    inputMode="numeric"
                    aria-label="Monto a cuenta de cliente"
                    value={cuentaCliente ? formatMiles(cuentaCliente) : ""}
                    onFocus={(e) => {
                      setPagoTipoLocal("C");
                      if (cuentaCliente === 0 && totalRest > 0) {
                        setCuentaCliente(totalRest);
                        setTotalRest(0);
                      }
                      e.target.select();
                    }}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(/\D/g, ""));
                      setCuentaCliente(v);
                      recomputeContado({ cuentaCliente: v });
                    }}
                    className={moneyInputCls(pagoTipo === "C")}
                  />
                </div>
              )}

          {/* ENVÍO: hay que cobrar el total. El saldo solo queda en cuenta
              corriente si el usuario lo habilita explícitamente. */}
          {esEnvio && (
            <>
              <label className="mt-1 flex items-center gap-2 cursor-pointer text-text-muted">
                <input
                  type="checkbox"
                  checked={permitirCC}
                  onChange={(e) => setPermitirCC(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-brand-700 focus:ring-2 focus:ring-brand-500/40"
                />
                <span className="text-sm font-medium">Crédito</span>
              </label>

              {pendienteCC > 0 &&
                (permitirCC ? (
                  <div className={`${rowCls} mt-2`}>
                    <span className={labelCls}>Crédito:</span>
                    <div className="w-32 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-base text-right font-num font-semibold text-amber-700">
                      {formatMiles(pendienteCC)}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 rounded-md border border-danger-200 bg-danger-50 p-2 text-sm text-danger-700">
                    Falta cobrar Gs. {formatMiles(pendienteCC)}. Completá el
                    total para confirmar, o marcá «Dejar saldo en cuenta
                    corriente».
                  </p>
                ))}
            </>
          )}

          {/* Vuelto */}
          <div className="mt-6 text-2xl font-bold text-text">
            Vuelto:{" "}
            <span className="text-text-strong tabular-nums">
              {totalRest < 0 ? formatMiles(totalRest * -1) : "0"}
            </span>
          </div>

          <label className="mt-4 flex items-center gap-2 cursor-pointer text-text-muted">
            <input
              type="checkbox"
              checked={printTicket}
              onChange={(e) => setPrintTicket(e.target.checked)}
              className="h-4 w-4 rounded border-border text-brand-700 focus:ring-2 focus:ring-brand-500/40"
            />
            <span className="text-sm font-medium">Imprimir ticket</span>
          </label>
        </div>

        {/* Columna derecha: Pad numérico */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2.5">
            {buttonsPago.flat().map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onNumberClickModal(label)}
                className="h-14 rounded-lg border border-border bg-surface-muted text-xl font-semibold text-text transition-colors hover:bg-surface-sunken active:bg-border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={borrarMonto}
            className="h-12 rounded-lg border border-border bg-surface-muted text-base font-medium text-text transition-colors hover:bg-surface-sunken active:bg-border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            Borrar
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PaymentModalMayorista;

import React, { useState, useEffect } from "react";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { formatMiles } from "../../utils/utils";
import { Modal, Button } from "./ui";

interface PaymentModalProps {
  show: boolean;
  handleClose: () => void;
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
  // Oculta el checkbox "Imprimir ticket" (no aplica en el cobro de delivery,
  // donde la factura se imprime aparte / al despachar).
  hidePrintTicket?: boolean;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  show,
  handleClose,
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
  hidePrintTicket = false,
}) => {
  const [pagoTipo, setPagoTipoLocal] = useState<
    "E" | "B" | "D" | "CR" | "C" | "V"
  >("E");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pagoConTarjeta = bancoDebito > 0 || bancoCredito > 0;
  const ventaNroPOSValido =
    !pagoConTarjeta ||
    (ventaNroPOS.trim().length >= 4 && /^\d+$/.test(ventaNroPOS.trim()));

  useEffect(() => {
    if (show) {
      setEfectivo(0);
      setBanco(0);
      setBancoDebito(0);
      setBancoCredito(0);
      setCuentaCliente(0);
      setVentaNroPOS("");
      setTotalRest(totalCost);
      setTimeout(() => {
        const efectivoInput = document.getElementById("efectivo-input");
        if (efectivoInput) {
          efectivoInput.focus();
        }
      }, 100);
    }
  }, [
    show,
    setEfectivo,
    setBanco,
    setBancoDebito,
    setBancoCredito,
    setCuentaCliente,
    setVentaNroPOS,
    setTotalRest,
    totalCost,
  ]);

  const onNumberClickModal = (label: string | number) => {
    let efe = efectivo;
    let ban = banco;
    let deb = bancoDebito;
    let cred = bancoCredito;
    let cuentaCli = cuentaCliente;
    let vou = voucher;
    let totalResto = 0;

    const append = (val: number, label: string | number) => {
      if (val === 0) return Number(label);
      return Number(`${val}${label}`);
    };

    if (pagoTipo === "E") {
      efe = append(efectivo, label);
      totalResto =
        totalCost -
        efe -
        banco -
        bancoDebito -
        bancoCredito -
        cuentaCliente -
        vou;
      setEfectivo(efe);
    } else if (pagoTipo === "B") {
      ban = append(banco, label);
      totalResto =
        totalCost -
        efectivo -
        ban -
        bancoDebito -
        bancoCredito -
        cuentaCliente -
        vou;
      setBanco(ban);
    } else if (pagoTipo === "D") {
      deb = append(bancoDebito, label);
      totalResto =
        totalCost -
        efectivo -
        banco -
        bancoCredito -
        cuentaCliente -
        deb * 1.03 -
        vou;
      setBancoDebito(deb);
    } else if (pagoTipo === "CR") {
      cred = append(bancoCredito, label);
      totalResto =
        totalCost -
        efectivo -
        banco -
        bancoDebito -
        cuentaCliente -
        cred * 1.05 -
        vou;
      setBancoCredito(cred);
    } else if (pagoTipo === "C") {
      cuentaCli = append(cuentaCliente, label);
      totalResto =
        totalCost -
        efectivo -
        banco -
        bancoDebito -
        bancoCredito -
        cuentaCli -
        vou;
      setCuentaCliente(cuentaCli);
    } else if (pagoTipo === "V") {
      vou = append(voucher, label);
      totalResto =
        totalCost -
        efectivo -
        banco -
        bancoDebito -
        bancoCredito -
        cuentaCliente -
        vou;
      setVoucher(vou);
    }
    setTotalRest(totalResto);
  };

  const cerarCantidadModal = () => {
    let totalResto = 0;
    if (pagoTipo === "E") {
      totalResto =
        totalCost -
        banco -
        bancoDebito -
        bancoCredito -
        cuentaCliente -
        voucher;
      setEfectivo(0);
    } else if (pagoTipo === "B") {
      totalResto =
        totalCost -
        efectivo -
        bancoDebito -
        bancoCredito -
        cuentaCliente -
        voucher;
      setBanco(0);
    } else if (pagoTipo === "D") {
      totalResto =
        totalCost - efectivo - banco - bancoCredito - cuentaCliente - voucher;
      setBancoDebito(0);
    } else if (pagoTipo === "CR") {
      totalResto =
        totalCost - efectivo - banco - bancoDebito - cuentaCliente - voucher;
      setBancoCredito(0);
    } else if (pagoTipo === "C") {
      totalResto =
        totalCost - efectivo - banco - bancoDebito - bancoCredito - voucher;
      setCuentaCliente(0);
    } else if (pagoTipo === "V") {
      totalResto =
        totalCost -
        efectivo -
        banco -
        bancoDebito -
        bancoCredito -
        cuentaCliente;
      setVoucher(0);
    }
    setTotalRest(totalResto);
  };

  const handleSendRequest = async () => {
    setIsSubmitting(true);
    try {
      await sendRequest();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (
      e.key === "Enter" &&
      !isSubmitting &&
      totalRest <= 0 &&
      ventaNroPOSValido
    ) {
      handleSendRequest();
    }
  };

  const buttonsPago = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    ["00", 0, "000"],
  ];

  // Clases del input de monto según el método activo (resalta el seleccionado).
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
      title="Seleccione un método de pago"
      size="4xl"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            leftIcon={BanknotesIcon}
            loading={isSubmitting}
            onClick={handleSendRequest}
            disabled={isSubmitting || totalRest > 0 || !ventaNroPOSValido}
          >
            Facturar
          </Button>
        </>
      }
    >
      {/* onKeyDown en el contenido: Enter factura si el pago está completo. */}
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
                const newValue = Number(e.target.value.replace(/\D/g, ""));
                setEfectivo(newValue);
                const totalResto =
                  totalCost -
                  newValue -
                  banco -
                  bancoDebito -
                  bancoCredito -
                  cuentaCliente -
                  voucher;
                setTotalRest(totalResto);
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
                if (banco === 0) {
                  setBanco(totalRest);
                  setTotalRest(0);
                }
                e.target.select();
              }}
              onChange={(e) => {
                const newValue = Number(e.target.value.replace(/\D/g, ""));
                setBanco(newValue);
                const totalResto =
                  totalCost -
                  efectivo -
                  newValue -
                  bancoDebito -
                  bancoCredito -
                  cuentaCliente -
                  voucher;
                setTotalRest(totalResto);
              }}
              className={moneyInputCls(pagoTipo === "B")}
            />
          </div>

          {/* Tarjeta Débito */}
          <div className={rowCls}>
            <label htmlFor="debito-input" className={labelCls}>
              Tarjeta Débito (3% adicional):
            </label>
            <input
              id="debito-input"
              type="text"
              readOnly
              aria-label="Monto con tarjeta de débito"
              value={formatMiles(bancoDebito)}
              onFocus={(e) => {
                setPagoTipoLocal("D");
                if (bancoDebito === 0) {
                  setBancoDebito(Number((totalRest * 1.03).toFixed(0)));
                  setTotalRest(0);
                }
                e.target.select();
                setTimeout(() => {
                  document.getElementById("venta-nro-pos-input")?.focus();
                }, 100);
              }}
              className={moneyInputCls(pagoTipo === "D")}
            />
          </div>

          {/* Tarjeta Crédito */}
          <div className={rowCls}>
            <label htmlFor="credito-input" className={labelCls}>
              Tarjeta Crédito (5% adicional):
            </label>
            <input
              id="credito-input"
              type="text"
              readOnly
              aria-label="Monto con tarjeta de crédito"
              value={formatMiles(bancoCredito)}
              onFocus={(e) => {
                setPagoTipoLocal("CR");
                if (bancoCredito === 0) {
                  setBancoCredito(Number((totalRest * 1.05).toFixed(0)));
                  setTotalRest(0);
                }
                e.target.select();
                setTimeout(() => {
                  document.getElementById("venta-nro-pos-input")?.focus();
                }, 100);
              }}
              className={moneyInputCls(pagoTipo === "CR")}
            />
          </div>

          {/* Nro. POS - solo cuando hay pago con tarjeta débito o crédito */}
          {pagoConTarjeta && (
            <div className={rowCls}>
              <label htmlFor="venta-nro-pos-input" className={labelCls}>
                Nro. POS (mín. 4 dígitos):
              </label>
              <input
                id="venta-nro-pos-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                aria-label="Número de comprobante POS"
                aria-invalid={
                  ventaNroPOS.trim().length > 0 &&
                  ventaNroPOS.trim().length < 4
                    ? true
                    : undefined
                }
                value={ventaNroPOS}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setVentaNroPOS(val);
                }}
                placeholder="Ej: 1234"
                className={moneyInputCls(
                  false,
                  ventaNroPOS.trim().length > 0 &&
                    ventaNroPOS.trim().length < 4,
                )}
              />
            </div>
          )}

          {/* Cuenta Cliente */}
          <div className={rowCls}>
            <label htmlFor="cuenta-cliente-input" className={labelCls}>
              Cuenta de cliente:
            </label>
            <input
              id="cuenta-cliente-input"
              type="text"
              inputMode="numeric"
              aria-label="Monto a cuenta de cliente"
              value={cuentaCliente ? formatMiles(cuentaCliente) : ""}
              onFocus={(e) => {
                setPagoTipoLocal("C");
                if (cuentaCliente === 0) {
                  setCuentaCliente(totalRest);
                  setTotalRest(0);
                }
                e.target.select();
              }}
              onChange={(e) => {
                const newValue = Number(e.target.value.replace(/\D/g, ""));
                setCuentaCliente(newValue);
                const totalResto =
                  totalCost -
                  efectivo -
                  banco -
                  bancoDebito -
                  bancoCredito -
                  newValue -
                  voucher;
                setTotalRest(totalResto);
              }}
              className={moneyInputCls(pagoTipo === "C")}
            />
          </div>

          {/* Voucher */}
          <div className={rowCls}>
            <label htmlFor="voucher-input" className={labelCls}>
              Voucher:
            </label>
            <input
              id="voucher-input"
              type="text"
              inputMode="numeric"
              aria-label="Monto en voucher"
              value={voucher ? formatMiles(voucher) : ""}
              onFocus={(e) => {
                setPagoTipoLocal("V");
                if (voucher === 0) {
                  setVoucher(totalRest);
                  setTotalRest(0);
                }
                e.target.select();
              }}
              onChange={(e) => {
                const newValue = Number(e.target.value.replace(/\D/g, ""));
                setVoucher(newValue);
                const totalResto =
                  totalCost -
                  efectivo -
                  banco -
                  bancoDebito -
                  bancoCredito -
                  cuentaCliente -
                  newValue;
                setTotalRest(totalResto);
              }}
              className={moneyInputCls(pagoTipo === "V")}
            />
          </div>

          {/* Vuelto */}
          <div className="mt-6 text-2xl font-bold text-text">
            Vuelto:{" "}
            <span className="text-text-strong tabular-nums">
              {totalRest < 0 ? formatMiles(totalRest * -1) : "0"}
            </span>
          </div>

          {!hidePrintTicket && (
            <label className="mt-4 flex items-center gap-2 cursor-pointer text-text-muted">
              <input
                type="checkbox"
                checked={printTicket}
                onChange={(e) => setPrintTicket(e.target.checked)}
                className="h-4 w-4 rounded border-border text-brand-700 focus:ring-2 focus:ring-brand-500/40"
              />
              <span className="text-sm font-medium">Imprimir ticket</span>
            </label>
          )}
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
            onClick={cerarCantidadModal}
            className="h-12 rounded-lg border border-border bg-surface-muted text-base font-medium text-text transition-colors hover:bg-surface-sunken active:bg-border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            Borrar
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PaymentModal;

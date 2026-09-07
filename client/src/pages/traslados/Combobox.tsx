import { useEffect, useMemo, useRef, useState } from "react";

// Combobox con buscador. Regla del proyecto: todo select con muchas opciones
// (clientes, productos, almacenes) lleva buscador con navegación por teclado.
//
// Se extrae como componente en vez de repetir la lógica por cada selector
// (origen, destino, producto, producto destino y las dos de equivalencias la
// comparten). ReportesPage.tsx tiene la misma UX copiada a mano en cada uno.

export interface OpcionCombo {
  id: number;
  label: string;
  detalle?: string;
  aviso?: string;
}

export default function Combobox({
  value,
  opciones,
  placeholder,
  disabled,
  vacio = "Sin resultados",
  onSelect,
}: {
  value: number | null;
  opciones: OpcionCombo[];
  placeholder: string;
  disabled?: boolean;
  vacio?: string;
  onSelect: (id: number | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const [escribiendo, setEscribiendo] = useState(false);
  const marcadoRef = useRef<HTMLLIElement | null>(null);

  const seleccionada = opciones.find((o) => o.id === value) || null;

  // Mientras no se esté escribiendo, el input muestra la opción elegida.
  useEffect(() => {
    if (!escribiendo) setTexto(seleccionada ? seleccionada.label : "");
  }, [seleccionada, escribiendo]);

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q || !escribiendo) return opciones;
    return opciones.filter((o) => o.label.toLowerCase().includes(q));
  }, [texto, opciones, escribiendo]);

  useEffect(() => {
    marcadoRef.current?.scrollIntoView({ block: "nearest" });
  }, [marcado, abierto]);

  const elegir = (o: OpcionCombo) => {
    onSelect(o.id);
    setTexto(o.label);
    setEscribiendo(false);
    setAbierto(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setMarcado((h) => Math.min(h + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarcado((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (abierto && filtradas[marcado]) {
        e.preventDefault();
        elegir(filtradas[marcado]);
      }
    } else if (e.key === "Escape") {
      setAbierto(false);
      setEscribiendo(false);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={texto}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          setTexto(e.target.value);
          setEscribiendo(true);
          setAbierto(true);
          setMarcado(0);
          if (!e.target.value) onSelect(null);
        }}
        onFocus={(e) => {
          e.target.select();
          setAbierto(true);
          setMarcado(0);
        }}
        onMouseUp={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        onBlur={() =>
          setTimeout(() => {
            setAbierto(false);
            setEscribiendo(false);
          }, 150)
        }
        className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
      />
      {abierto && !disabled && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
          {filtradas.map((o, idx) => {
            const activo = idx === marcado;
            return (
              <li
                key={o.id}
                ref={activo ? marcadoRef : null}
                onMouseDown={() => elegir(o)}
                onMouseEnter={() => setMarcado(idx)}
                className={`px-3 py-2 cursor-pointer ${
                  activo ? "bg-blue-100" : "hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{o.label}</span>
                  {o.aviso && (
                    <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      {o.aviso}
                    </span>
                  )}
                </div>
                {o.detalle && (
                  <div className="text-xs text-slate-500">{o.detalle}</div>
                )}
              </li>
            );
          })}
          {filtradas.length === 0 && (
            <li className="px-3 py-2 text-slate-400">{vacio}</li>
          )}
        </ul>
      )}
    </div>
  );
}

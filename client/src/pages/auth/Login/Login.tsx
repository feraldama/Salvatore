import { useState, useEffect, useRef } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "../../../contexts/useAuth";
import { useNavigate } from "react-router-dom";
import {
  EyeIcon,
  EyeSlashIcon,
  UserIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  BoltIcon,
  BanknotesIcon,
  CubeIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";
import { Button, TextInput } from "../../../components/common/ui";

interface Credentials {
  email: string;
  password: string;
}

const FEATURES = [
  {
    icon: BanknotesIcon,
    title: "Ventas y caja en tiempo real",
    desc: "Cobros, créditos y arqueo siempre al día.",
  },
  {
    icon: CubeIcon,
    title: "Compras y control de stock",
    desc: "Inventario y reposición sin sorpresas.",
  },
  {
    icon: BuildingOffice2Icon,
    title: "Multi-empresa unificado",
    desc: "Distribuidora y Bebidas en un solo panel.",
  },
];

function Login() {
  const [credentials, setCredentials] = useState<Credentials>({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCredentials((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    if (error) setError("");
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    try {
      await login(credentials);
      navigate("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "No pudimos conectarnos al servidor. Intentá nuevamente.";
      setError(message);
    }
  };

  const year = new Date().getFullYear();

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-surface">
      {/* ---------------------------------------------------------------
          Panel de marca (oculto en mobile) — operations / trust signals
          --------------------------------------------------------------- */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-slate-950 px-12 py-14 text-white">
        {/* Motivo "data" sutil: grid tenue de fondo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        {/* Brillo radial superior */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl"
        />

        {/* Lockup de marca */}
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
            <BoltIcon className="h-6 w-6 text-warning-500" />
          </span>
          <span className="font-display text-2xl font-bold tracking-tight">
            Salvatore
          </span>
        </div>

        {/* Mensaje + features */}
        <div className="relative">
          <h2 className="font-display text-3xl font-bold leading-tight">
            Tu negocio,
            <br />
            bajo control.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Sistema de gestión de ventas, caja, compras e inventario para la
            distribuidora.
          </p>

          <ul className="mt-9 space-y-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
                  <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-sm text-white/60">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          © {year} Salvatore · Panel de administración
        </p>
      </aside>

      {/* ---------------------------------------------------------------
          Panel de formulario
          --------------------------------------------------------------- */}
      <main className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          {/* Marca compacta (solo mobile, ya que el panel está oculto) */}
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white shadow-card">
              <BoltIcon className="h-5 w-5 text-warning-500" />
            </span>
            <span className="font-display text-xl font-bold tracking-tight text-text">
              Salvatore
            </span>
          </div>

          <div className="mb-8">
            <h1 className="font-display text-2xl font-bold tracking-tight text-text-strong">
              Iniciar sesión
            </h1>
            <p className="mt-1.5 text-sm text-text-muted">
              Ingresá tus credenciales para acceder al panel.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 flex items-start gap-2 rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
            >
              <ExclamationTriangleIcon
                className="mt-0.5 h-5 w-5 shrink-0"
                aria-hidden="true"
              />
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError("")}
                aria-label="Cerrar mensaje de error"
                className="shrink-0 cursor-pointer rounded p-0.5 text-danger-700 transition-colors duration-150 hover:bg-danger-100 hover:text-danger-800 focus:outline-none focus:ring-2 focus:ring-danger-500/30"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <TextInput
              ref={emailInputRef}
              label="Usuario"
              id="usuario"
              name="email"
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              leftIcon={UserIcon}
              value={credentials.email}
              onChange={handleChange}
              required
              size="lg"
              placeholder="Tu nombre de usuario"
            />

            <TextInput
              label="Contraseña"
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              leftIcon={LockClosedIcon}
              value={credentials.password}
              onChange={handleChange}
              required
              size="lg"
              placeholder="••••••••"
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={showPassword}
                  className="cursor-pointer rounded p-1 text-text-subtle transition-colors duration-150 hover:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              }
            />

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={loading}
              disabled={!credentials.email || !credentials.password}
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>

          <p className="mt-10 text-center text-xs text-text-subtle lg:hidden">
            © {year} Salvatore Distribuidora
          </p>
        </div>
      </main>
    </div>
  );
}

export default Login;

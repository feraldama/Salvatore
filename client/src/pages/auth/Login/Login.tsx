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
  BuildingStorefrontIcon,
} from "@heroicons/react/24/outline";
import { Button, TextInput } from "../../../components/common/ui";

interface Credentials {
  email: string;
  password: string;
}

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

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center">
          <span
            aria-hidden="true"
            className="flex items-center justify-center w-14 h-14 rounded-xl bg-brand-700 text-white shadow-sm"
          >
            <BuildingStorefrontIcon className="w-7 h-7" />
          </span>
          <h1 className="font-display mt-6 text-2xl font-semibold tracking-tight text-text">
            Salvatore Distribuidora
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Iniciá sesión para continuar
          </p>
        </div>

        <div className="mt-8 rounded-lg bg-surface border border-border p-6 shadow-sm">
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 flex items-start gap-2 rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
            >
              <ExclamationTriangleIcon
                className="w-5 h-5 mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError("")}
                aria-label="Cerrar mensaje de error"
                className="shrink-0 rounded p-0.5 text-danger-700 hover:text-danger-800 hover:bg-danger-100 transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-danger-500/30"
              >
                <XMarkIcon className="w-4 h-4" />
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
                  className="p-1 text-text-subtle hover:text-text-muted transition-colors duration-150 cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
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
        </div>

        <p className="mt-6 text-center text-xs text-text-subtle">
          © {new Date().getFullYear()} Salvatore Distribuidora
        </p>
      </div>
    </div>
  );
}

export default Login;

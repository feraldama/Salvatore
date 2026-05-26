import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const ocultarLayout = location.pathname === "/ventas";

  if (ocultarLayout) {
    return (
      <main className="min-h-dvh">
        <Outlet />
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-surface-alt">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-md focus:bg-brand-700 focus:text-white focus:shadow-lg"
      >
        Saltar al contenido
      </a>

      <Navbar setMobileOpen={setMobileOpen} />
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <main
        id="main"
        className="lg:pl-64 pt-0"
        role="main"
      >
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

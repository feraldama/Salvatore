import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import "./App.css";
import { AuthProvider } from "./contexts/AuthContext";
import Login from "./pages/auth/Login/Login";
import Dashboard from "./pages/dashboard/Dashboard";
import PrivateRoute from "./components/common/PrivateRoute";
import Layout from "./components/layout/Layout";
import NotFound from "./pages/NotFound";
import UsersPage from "./pages/users/UsersPage";
import MovementsPage from "./pages/movements/MovementsPage";
import CajasPage from "./pages/cajas/CajasPage";
import TiposGastoPage from "./pages/tipogasto/TiposGastoPage";
import CustomersPage from "./pages/customers/CustomersPage";
import AperturaCierreCajaPage from "./pages/cajas/AperturaCierreCajaPage";
import VentasDispatcher from "./pages/dashboard/VentasDispatcher";
import LocalesPage from "./pages/locales/LocalesPage";
import AlmacenesPage from "./pages/almacenes/AlmacenesPage";
import CombosPage from "./pages/combos/CombosPage";
import PerfilesPage from "./pages/perfiles/PerfilesPage";
import MenusPage from "./pages/menus/MenusPage";
import ProductsPage from "./pages/products/ProductsPage";
import VentasPage from "./pages/ventas/VentasPage";
import CreditoPagosPage from "./pages/ventas/CreditoPagosPage";
import ReportesPage from "./pages/dashboard/ReportesPage";
import DeliveriesPage from "./pages/dashboard/DeliveriesPage";
import DeliveryTarifasPage from "./pages/delivery/DeliveryTarifasPage";
import FacturasPage from "./pages/facturas/FacturasPage";
import Compras from "./pages/compras/Compras";
import ComprasPage from "./pages/compras/ComprasPage";
import Inventario from "./pages/inventario/Inventario";
import DocumentTitle from "./components/common/DocumentTitle";
import VendedoresPage from "./pages/vendedores/VendedoresPage";
import EmpresasPage from "./pages/empresas/EmpresasPage";
import VehiculosPage from "./pages/flota/VehiculosPage";
import ChoferesPage from "./pages/flota/ChoferesPage";

function App() {
  return (
    <Router>
      <DocumentTitle />
      <AuthProvider>
        <Routes>
          {/* Redirige la raíz / a /login */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* Rutas sin Layout (Sales, Compras e Inventario) */}
          <Route
            path="/ventas"
            element={
              <PrivateRoute>
                <VentasDispatcher />
              </PrivateRoute>
            }
          />
          <Route
            path="/compras"
            element={
              <PrivateRoute>
                <Compras />
              </PrivateRoute>
            }
          />
          <Route
            path="/inventario"
            element={
              <PrivateRoute>
                <Inventario />
              </PrivateRoute>
            }
          />

          {/* Rutas privadas (con Layout que incluye Navbar) */}
          <Route
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            {/* Agrega aquí más rutas protegidas */}
            <Route path="/users" element={<UsersPage />} />
            <Route path="/movements/summary" element={<MovementsPage />} />;
            <Route path="/movements/cajas" element={<CajasPage />} />;
            <Route path="/movements/tiposgasto" element={<TiposGastoPage />} />;
            <Route path="/customers" element={<CustomersPage />} />;
            <Route
              path="/apertura-cierre-caja"
              element={<AperturaCierreCajaPage />}
            />
            <Route path="/locales" element={<LocalesPage />} />
            <Route path="/almacenes" element={<AlmacenesPage />} />
            <Route path="/combos" element={<CombosPage />} />
            <Route path="/perfiles" element={<PerfilesPage />} />
            <Route path="/menus" element={<MenusPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/modifications/ventas" element={<VentasPage />} />
            <Route path="/modifications/compras" element={<ComprasPage />} />
            <Route path="/credito-pagos" element={<CreditoPagosPage />} />
            <Route path="/reportes" element={<ReportesPage />} />
            <Route path="/deliveries" element={<DeliveriesPage />} />
            <Route path="/delivery-tarifas" element={<DeliveryTarifasPage />} />
            <Route path="/facturas" element={<FacturasPage />} />
            <Route path="/vendedores" element={<VendedoresPage />} />
            <Route path="/empresas" element={<EmpresasPage />} />
            <Route path="/flota/vehiculos" element={<VehiculosPage />} />
            <Route path="/flota/choferes" element={<ChoferesPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;

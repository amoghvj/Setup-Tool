import { createBrowserRouter } from "react-router";
import { DashboardLayout } from "./components/DashboardLayout";
import { DashboardOverview } from "./pages/DashboardOverview";
import { LiveDriverTracking } from "./pages/LiveDriverTracking";
import { DeliveryManagement } from "./pages/DeliveryManagement";
import { RouteMonitoring } from "./pages/RouteMonitoring";
import { Analytics } from "./pages/Analytics";
import { Settings } from "./pages/Settings";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: DashboardLayout,
    children: [
      { index: true, Component: DashboardOverview },
      { path: "tracking", Component: LiveDriverTracking },
      { path: "deliveries", Component: DeliveryManagement },
      { path: "routes", Component: RouteMonitoring },
      { path: "analytics", Component: Analytics },
      { path: "settings", Component: Settings },
    ],
  },
]);
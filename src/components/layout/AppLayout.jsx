import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Clock3,
  LogOut,
  Menu,
  NotebookPen,
  Route,
  Send,
  Settings as SettingsIcon,
  Smartphone,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useTranslation } from "../../i18n/index.js";
import { HeliosFloatingAssistant } from "../ai/HeliosFloatingAssistant.jsx";

const DRAWER_ITEMS = [
  { key: "dailySummary", icon: ClipboardList, to: "/daily-summary" },
  { key: "calendar", icon: CalendarDays, to: "/appointments" },
  { key: "optimizeRoute", icon: Route, to: "/optimize-route" },
  { key: "smsReplies", icon: NotebookPen, to: "/sms-replies" },
  { key: "reports", icon: BarChart3, to: "/reports" },
  { key: "overtime", icon: Clock3, to: "/overtime" },
  { key: "shareAppointments", icon: Send, to: "/share-appointments" },
  { key: "devices", icon: Smartphone, to: "/devices" },
  { key: "settings", icon: SettingsIcon, to: "/settings" },
  { key: "cancelled", icon: XCircle, to: "/appointments?status=cancelled" },
];

export function AppLayout() {
  const { logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function openDrawer() {
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div className="app-shell calendar-first-shell">
      {location.pathname !== "/appointments" ? (
        <div className="global-appbar">
          <button
            className="global-drawer-button"
            type="button"
            onClick={openDrawer}
            aria-label={t("nav.openMenu")}
          >
            <Menu size={23} />
          </button>
        </div>
      ) : null}

      <main className="main-content">
        <Outlet context={{ openDrawer }} />
      </main>

      {drawerOpen ? (
        <button
          className="drawer-backdrop"
          type="button"
          aria-label={t("nav.closeMenu")}
          onClick={closeDrawer}
        />
      ) : null}

      <aside
        className={`calendar-drawer ${drawerOpen ? "is-open" : ""}`}
        aria-label={t("nav.mainMenu")}
        aria-hidden={!drawerOpen}
      >
        <div className="drawer-brand">
          <Link to="/appointments" onClick={closeDrawer}>
            <img src="/assets/logo/solarvisit-symbol.png" alt={t("app.brand")} />
          </Link>

          <button
            type="button"
            onClick={closeDrawer}
            aria-label={t("nav.closeMenu")}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="drawer-nav">
          {DRAWER_ITEMS.map(({ key, icon: Icon, to }) => (
            <NavLink
              key={key}
              to={to}
              className={() =>
                `drawer-link ${isDrawerItemActive(key, location) ? "active" : ""}`
              }
              onClick={closeDrawer}
            >
              <Icon size={21} />
              <span>{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="drawer-user">
          <span>C</span>
          <strong>Christos</strong>

          <button
            type="button"
            onClick={handleLogout}
            aria-label={t("nav.signOut")}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <HeliosFloatingAssistant />
    </div>
  );
}

function isDrawerItemActive(key, location) {
  const params = new URLSearchParams(location.search);
  const status = params.get("status");

  if (key === "calendar") {
    return location.pathname === "/appointments" && !status;
  }

  if (key === "cancelled") {
    return location.pathname === "/appointments" && status === "cancelled";
  }

  if (key === "dailySummary") {
    return location.pathname.startsWith("/daily-summary");
  }

  if (key === "optimizeRoute") {
    return location.pathname.startsWith("/optimize-route");
  }

  if (key === "smsReplies") {
    return location.pathname.startsWith("/sms-replies");
  }

  if (key === "reports") {
    return location.pathname.startsWith("/reports");
  }

  if (key === "overtime") {
    return location.pathname.startsWith("/overtime");
  }

  if (key === "notes") {
    return location.pathname.startsWith("/notes");
  }

  if (key === "shareAppointments") {
    return location.pathname.startsWith("/share-appointments");
  }

  if (key === "devices") {
    return location.pathname.startsWith("/devices");
  }

  if (key === "settings") {
    return location.pathname.startsWith("/settings");
  }

  return false;
}

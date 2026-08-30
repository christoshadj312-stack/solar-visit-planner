import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout.jsx";
import { ProtectedRoute } from "./components/layout/ProtectedRoute.jsx";
import { AuthProvider } from "./hooks/useAuth.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { TodayPage } from "./pages/TodayPage.jsx";
import { CustomersPage } from "./pages/CustomersPage.jsx";
import { CustomerDetailsPage } from "./pages/CustomerDetailsPage.jsx";
import { CustomerFormPage } from "./pages/CustomerFormPage.jsx";
import { AiAssistantPage } from "./pages/AiAssistantPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { OptimizeRoutePage } from "./pages/OptimizeRoutePage.jsx";
import { ReportsPage } from "./pages/ReportsPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { OvertimePage } from "./pages/OvertimePage.jsx";
import { ShareAppointmentsPage } from "./pages/ShareAppointmentsPage.jsx";
import { NotesPage } from "./pages/NotesPage.jsx";
import { DailySummaryPage } from "./pages/DailySummaryPage.jsx";
import { SmsRepliesPage } from "./pages/SmsRepliesPage.jsx";
import { DevicesPage } from "./pages/DevicesPage.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/appointments" replace />} />

          <Route path="daily-summary" element={<DailySummaryPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="today" element={<Navigate to="/appointments" replace />} />
          <Route path="appointments" element={<TodayPage />} />

          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/new" element={<CustomerFormPage />} />
          <Route path="customers/:customerId" element={<CustomerDetailsPage />} />
          <Route path="customers/:customerId/edit" element={<CustomerFormPage />} />

          <Route path="optimize-route" element={<OptimizeRoutePage />} />
          <Route path="sms-replies" element={<SmsRepliesPage />} />
          <Route path="devices" element={<DevicesPage />} />

          <Route path="reports" element={<ReportsPage />} />
          <Route path="ai-assistant" element={<AiAssistantPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="overtime" element={<OvertimePage />} />
          <Route path="share-appointments" element={<ShareAppointmentsPage />} />
          <Route path="notes" element={<NotesPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
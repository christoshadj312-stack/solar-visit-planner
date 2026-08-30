import { AppointmentsCalendar } from "../components/calendar/AppointmentsCalendar.jsx";
import { useCustomers } from "../hooks/useCustomers.js";
import { useTranslation } from "../i18n/index.js";

export function TodayPage() {
  const { customers, loading, error } = useCustomers();
  const { t } = useTranslation();

  if (loading) return <div className="page-loader">{t("share.loading")}</div>;
  if (error) return <p className="form-error">{error}</p>;

  return <AppointmentsCalendar customers={customers} />;
}

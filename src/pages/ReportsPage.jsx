import { useCustomers } from "../hooks/useCustomers.js";
import { useTranslation } from "../i18n/index.js";
import {
  getCustomerArea,
  getTopCounts,
  getTopMonths,
  isCancelledCustomer
} from "../utils/customerInsights.js";

export function ReportsPage() {
  const { customers, loading, error } = useCustomers();
  const { t } = useTranslation();

  if (loading) return <div className="page-loader">{t("reports.loading")}</div>;
  if (error) return <p className="form-error">{error}</p>;

  const scheduled = customers.filter((customer) => String(customer.status || "").toLowerCase() === "scheduled");
  const cancelled = customers.filter(isCancelledCustomer);
  const topMonths = getTopMonths(customers, 5);

  return (
    <section className="workspace-page">
      <header className="workspace-header">
        <div>
          <p>{t("reports.eyebrow")}</p>
          <h1>{t("reports.title")}</h1>
        </div>
      </header>

      <div className="report-metrics">
        <MetricCard label={t("reports.appointments")} value={customers.length} />
        <MetricCard label={t("reports.scheduled")} value={scheduled.length} />
        <MetricCard label={t("reports.cancelled")} value={cancelled.length} />
      </div>

      <div className="report-grid">
        <ReportList title={t("reports.topMonths")} items={topMonths} emptyText={t("reports.noData")} />
      </div>
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <article className="workspace-panel metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function ReportList({ title, items, emptyText }) {
  return (
    <article className="workspace-panel report-list">
      <h2>{title}</h2>
      {items.length ? (
        <ol>
          {items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted-copy">{emptyText}</p>
      )}
    </article>
  );
}

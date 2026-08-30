import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CustomerList } from "../components/customers/CustomerList.jsx";
import { useCustomers } from "../hooks/useCustomers.js";
import { useTranslation } from "../i18n/index.js";
import { compareAppointmentDateTime, todayIso } from "../utils/date.js";



export function CustomersPage() {
  const { customers, stats, loading, error } = useCustomers();
  const { t, locale, raw } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryDate = getValidDateParam(searchParams.get("date"));
  const initialDate = queryDate || todayIso();
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseISO(initialDate)));

  useEffect(() => {
    if (!queryDate || queryDate === selectedDate) return;
    setSelectedDate(queryDate);
    setVisibleMonth(startOfMonth(parseISO(queryDate)));
  }, [queryDate, selectedDate]);

  function selectCalendarDate(dateKey) {
    setSelectedDate(dateKey);
    setSearchParams({ date: dateKey });
  }
  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const visibleCustomers = normalizedQuery
      ? customers
      : customers.filter((customer) => customer.appointment_date === selectedDate);

    return visibleCustomers
      .filter((customer) => {
        if (!normalizedQuery) return true;

        const haystack = [
          customer.full_name,
          customer.phone,
          customer.address,
          customer.email,
          customer.notes,
          customer.status
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort(compareAppointmentDateTime);
  }, [customers, query, selectedDate]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    const monthEnd = endOfMonth(visibleMonth);

    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 0 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 0 })
    });
  }, [visibleMonth]);

  const dateCounts = useMemo(
    () =>
      customers.reduce((counts, customer) => {
        if (!customer.appointment_date) return counts;
        if (isCancelledStatus(customer.status)) return counts;
        counts[customer.appointment_date] = (counts[customer.appointment_date] || 0) + 1;
        return counts;
      }, {}),
    [customers]
  );

  if (loading) return <div className="page-loader">{t("customers.loading")}</div>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <section className="page-stack">
      <div className="stats-grid">
        <Stat label={t("customers.total")} value={stats.total} />
        <Stat label={t("customers.today")} value={stats.today} />
        <Stat label={t("customers.scheduled")} value={stats.scheduled} />
        <Stat label={t("customers.cancelled")} value={stats.cancelled} />
      </div>

      <div className="panel toolbar">
        <input
          type="search"
          placeholder={t("customers.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Link className="button button-warm" to="/customers/new" aria-label={t("customers.addCustomer")}>
          <Plus size={20} />
          {t("common.add")}
        </Link>
      </div>

      <section className="panel customer-month-calendar" aria-label={t("customers.monthAria")}>
        <div className="customer-month-header">
          <button className="icon-button" type="button" onClick={() => setVisibleMonth((month) => subMonths(month, 1))} aria-label={t("calendar.previousMonth")}>
            <ChevronLeft size={18} />
          </button>
          <h2>{format(visibleMonth, "MMMM yyyy", { locale })}</h2>
          <button className="icon-button" type="button" onClick={() => setVisibleMonth((month) => addMonths(month, 1))} aria-label={t("calendar.nextMonth")}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="customer-month-weekdays">
          {raw("calendar.weekdays").map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className="customer-month-grid">
          {calendarDays.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const appointmentCount = dateCounts[dateKey] || 0;
            const isSelected = selectedDate === dateKey;
            const isOutsideMonth = !isSameMonth(day, visibleMonth);

            return (
              <button
                key={dateKey}
                className={[
                  "customer-month-day",
                  isSelected ? "is-active" : "",
                  isOutsideMonth ? "is-outside-month" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                onClick={() => selectCalendarDate(dateKey)}
                aria-pressed={isSelected}
              >
                <strong>{format(day, "d")}</strong>
                {appointmentCount > 0 ? <span>{appointmentCount}</span> : null}
              </button>
            );
          })}
        </div>

        <p className="customer-month-selection">
          {t("customers.showingFor", { date: format(parseISO(selectedDate), "EEEE, d MMMM yyyy", { locale }) })}
        </p>
      </section>

      <CustomerList
        customers={filteredCustomers}
        routeOrderActive={false}
        emptyTitle={t("customers.emptyTitle")}
        emptyMessage={
          query.trim()
            ? t("customers.emptyWithSearch")
            : t("customers.emptyNoSearch")
        }
      />
    </section>
  );
}

function getValidDateParam(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : "";
}
function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}


function isCancelledStatus(status = "") {
  return ["cancelled", "canceled"].includes(String(status).trim().toLowerCase());
}




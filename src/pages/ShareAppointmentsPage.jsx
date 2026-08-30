import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { useCustomers } from "../hooks/useCustomers.js";
import { useTranslation } from "../i18n/index.js";
import { todayIso } from "../utils/date.js";

export function ShareAppointmentsPage() {
  const { customers, loading, error } = useCustomers();
  const { t, locale } = useTranslation();
  const [range, setRange] = useState({ startDate: todayIso(), endDate: todayIso() });
  const [copyMessage, setCopyMessage] = useState("");
  const appointments = useMemo(() => filterAppointments(customers, range.startDate, range.endDate), [customers, range.startDate, range.endDate]);
  const groupedAppointments = useMemo(() => groupAppointmentsByDate(appointments), [appointments]);
  const copiedText = useMemo(() => buildAppointmentListText(groupedAppointments, range.startDate, range.endDate, t, locale), [groupedAppointments, range.startDate, range.endDate, t, locale]);

  function updateRange(event) {
    const { id, value } = event.target;
    setCopyMessage("");
    setRange((current) => {
      const next = { ...current, [id]: value };
      if (next.startDate && next.endDate && next.endDate < next.startDate) {
        return id === "startDate" ? { ...next, endDate: value } : { ...next, startDate: value };
      }
      return next;
    });
  }

  async function copyList() {
    try {
      await navigator.clipboard.writeText(copiedText);
      setCopyMessage(t("share.copied"));
    } catch {
      setCopyMessage(t("share.copyFailed"));
    }
  }

  if (loading) return <div className="page-loader">{t("share.loading")}</div>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <section className="tool-page share-appointments-page">
      <div className="tool-page-header">
        <p>{t("share.eyebrow")}</p>
        <h1>{t("share.title")}</h1>
      </div>

      <div className="simple-tool-form share-range-form">
        <label>
          {t("share.startDate")}
          <input id="startDate" type="date" value={range.startDate} onChange={updateRange} />
        </label>
        <label>
          {t("share.endDate")}
          <input id="endDate" type="date" value={range.endDate} onChange={updateRange} />
        </label>
        <button className="button button-primary" type="button" onClick={copyList} disabled={!appointments.length}>
          <Copy size={18} />
          {t("share.copyList")}
        </button>
      </div>

      <div className="share-summary">
        <strong>{appointments.length}</strong>
        <span>{t("share.selectedRange")}</span>
      </div>

      {copyMessage ? <p className="tool-message">{copyMessage}</p> : null}

      <div className="share-preview" aria-label={t("share.previewAria")}>
        <pre>{copiedText}</pre>
      </div>
    </section>
  );
}

function filterAppointments(customers, startDate, endDate) {
  return customers
    .filter((customer) => {
      const date = customer.appointment_date || "";
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= startDate && date <= endDate;
    })
    .sort((a, b) => {
      const dateCompare = (a.appointment_date || "").localeCompare(b.appointment_date || "");
      if (dateCompare !== 0) return dateCompare;
      return (a.appointment_time || "").localeCompare(b.appointment_time || "");
    });
}

function groupAppointmentsByDate(appointments) {
  return appointments.reduce((groups, appointment) => {
    const date = appointment.appointment_date;
    groups[date] = groups[date] || [];
    groups[date].push(appointment);
    return groups;
  }, {});
}

function buildAppointmentListText(groupedAppointments, startDate, endDate, t, locale) {
  const dates = Object.keys(groupedAppointments).sort();
  const lines = [
    t("share.heading", {
      start: formatDate(startDate, t, locale),
      end: formatDate(endDate, t, locale),
    }),
  ];

  if (!dates.length) {
    lines.push("", t("share.empty"));
    return lines.join("\n");
  }

  dates.forEach((date) => {
    const appointments = groupedAppointments[date] || [];

    const activeAppointments = appointments.filter(
      (appointment) => !isCancelledAppointment(appointment)
    );

    const cancelledAppointments = appointments.filter(isCancelledAppointment);

    lines.push("", formatDate(date, t, locale));

    if (activeAppointments.length) {
      lines.push("", "✅ ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΑ ΡΑΝΤΕΒΟΥ");

      activeAppointments.forEach((appointment) => {
        lines.push(formatAppointmentLine(appointment, t));
      });
    }

    if (cancelledAppointments.length) {
      lines.push("", "❌ ΑΚΥΡΩΜΕΝΑ ΡΑΝΤΕΒΟΥ");

      cancelledAppointments.forEach((appointment) => {
        lines.push(formatCancelledAppointmentLine(appointment, t));
      });
    }
  });

  return lines.join("\n");
}

function isCancelledAppointment(appointment) {
  const status = String(appointment.status || "")
    .trim()
    .toLowerCase();

  return (
    status === "cancelled" ||
    status === "canceled" ||
    status === "cancelled appointment" ||
    status === "canceled appointment" ||
    status === "ακυρωμένο" ||
    status === "ακυρωμενο" ||
    status === "ακυρώθηκε" ||
    status === "ακυρωθηκε"
  );
}

function formatAppointmentLine(appointment, t) {
  return `- ${formatTime(appointment.appointment_time, t)} | ${
    appointment.full_name || t("app.noName")
  } | ${appointment.phone || t("app.noPhone")} | ${
    appointment.address || t("app.noAddress")
  }`;
}

function formatCancelledAppointmentLine(appointment, t) {
  return `- ${formatTime(appointment.appointment_time, t)} | ${
    appointment.full_name || t("app.noName")
  } | ${appointment.phone || t("app.noPhone")} | ${
    appointment.address || t("app.noAddress")
  }`;
}

function formatDate(value, t, locale) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || t("app.noDate");
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale?.code === "el" ? "el-CY" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function formatTime(value, t) {
  if (!value) return t("app.noTime");
  const [hours = "", minutes = ""] = String(value).split(":");
  if (!hours || !minutes) return value;
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

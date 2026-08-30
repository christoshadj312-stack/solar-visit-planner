import { addDays, format, isSameDay, parseISO } from "date-fns";

export function todayIso() {
  return formatLocalIsoDate(new Date());
}

export function addDaysIso(days) {
  return formatLocalIsoDate(addDays(new Date(), days));
}

export function getUpcomingDays(count = 7) {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(new Date(), index);
    return {
      iso: formatLocalIsoDate(date),
      date
    };
  });
}

export function isToday(date) {
  return isSameDay(parseISO(date), new Date());
}

export function isTomorrow(date) {
  return isSameDay(parseISO(date), addDays(new Date(), 1));
}

export function formatAppointment(date, time, locale) {
  if (!date) return isGreekLocale(locale) ? "Χωρίς ραντεβού" : "No appointment";
  const value = parseISO(`${date}T${time || "00:00"}`);
  return format(value, "EEE d MMM, HH:mm", locale ? { locale } : undefined);
}

export function formatAppointmentDateHeading(date, locale) {
  const isGreek = isGreekLocale(locale);
  if (!date) return isGreek ? "Χωρίς ημερομηνία ραντεβού" : "No appointment date";
  if (isToday(date)) return isGreek ? "Σήμερα" : "Today";
  if (isTomorrow(date)) return isGreek ? "Αύριο" : "Tomorrow";
  return format(parseISO(date), "EEEE, d MMMM yyyy", locale ? { locale } : undefined);
}

export function formatDateSelectorTitle(date, locale) {
  const isoDate = typeof date === "string" ? date : formatLocalIsoDate(date);
  const isGreek = isGreekLocale(locale);
  if (isToday(isoDate)) return isGreek ? "Σήμερα" : "Today";
  if (isTomorrow(isoDate)) return isGreek ? "Αύριο" : "Tomorrow";
  return format(parseISO(isoDate), "EEEE", locale ? { locale } : undefined);
}

export function formatDateSelectorWeekday(date, locale) {
  return format(typeof date === "string" ? parseISO(date) : date, "EEEE", locale ? { locale } : undefined);
}

export function formatDateSelectorDayMonth(date, locale) {
  return format(typeof date === "string" ? parseISO(date) : date, "d MMM", locale ? { locale } : undefined);
}

export function compareAppointmentDateTime(a, b) {
  const dateA = a.appointment_date || "9999-12-31";
  const dateB = b.appointment_date || "9999-12-31";
  const dateComparison = dateA.localeCompare(dateB);

  if (dateComparison !== 0) {
    return dateComparison;
  }

  const timeA = a.appointment_time || "23:59";
  const timeB = b.appointment_time || "23:59";
  return timeA.localeCompare(timeB);
}

export function formatTodayLabel(locale) {
  return format(new Date(), "EEEE d MMM", locale ? { locale } : undefined);
}

function formatLocalIsoDate(date) {
  return format(date, "yyyy-MM-dd");
}

function isGreekLocale(locale) {
  return locale?.code === "el";
}

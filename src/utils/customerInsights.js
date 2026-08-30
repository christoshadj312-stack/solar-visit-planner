import { format, isBefore, isSameDay, parseISO, startOfMonth } from "date-fns";
import { compareAppointmentDateTime } from "./date.js";

export function getCustomerArea(customer) {
  const addressParts = (customer.address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (addressParts.length > 1) return addressParts[addressParts.length - 2];
  return addressParts[0] || "Unknown area";
}

export function getStatusKey(status = "") {
  return status.trim().toLowerCase();
}

export function isCancelledCustomer(customer) {
  return ["cancelled", "canceled"].includes(getStatusKey(customer.status));
}

export function getTodayAppointments(customers) {
  const today = new Date();
  return customers
    .filter((customer) => customer.appointment_date && isSameDay(parseISO(customer.appointment_date), today))
    .sort(compareAppointmentDateTime);
}

export function getNextAppointment(customers) {
  const now = new Date();
  return [...customers]
    .filter((customer) => {
      if (!customer.appointment_date) return false;
      const appointmentDate = parseISO(`${customer.appointment_date}T${customer.appointment_time || "00:00"}`);
      return !isBefore(appointmentDate, now) && !isCancelledCustomer(customer);
    })
    .sort(compareAppointmentDateTime)[0] || null;
}

export function getOverdueFollowUps(customers) {
  const today = new Date();
  return customers
    .filter((customer) => {
      if (!customer.appointment_date || isCancelledCustomer(customer)) return false;
      return isBefore(parseISO(customer.appointment_date), startOfDay(today));
    })
    .sort(compareAppointmentDateTime);
}

export function getTopCounts(items, getKey, limit = 5) {
  const counts = new Map();

  items.forEach((item) => {
    const key = getKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export function getTopMonths(customers, limit = 6) {
  return getTopCounts(
    customers.filter((customer) => customer.appointment_date),
    (customer) => format(parseISO(customer.appointment_date), "MMM yyyy"),
    limit
  );
}

export function formatAppointmentDate(customer) {
  if (!customer?.appointment_date) return "No date";
  return format(parseISO(`${customer.appointment_date}T${customer.appointment_time || "00:00"}`), "EEE d MMM, HH:mm");
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

import { CustomerCard } from "./CustomerCard.jsx";
import { EmptyState } from "../common/EmptyState.jsx";
import { compareAppointmentDateTime, formatAppointmentDateHeading } from "../../utils/date.js";
import { useTranslation } from "../../i18n/index.js";

export function CustomerList({ customers, emptyTitle, emptyMessage, routeOrderActive = false }) {
  const { t, locale } = useTranslation();
  if (!customers.length) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  const groupedCustomers = groupCustomersByAppointmentDate(customers, routeOrderActive);

  return (
    <div className="appointment-group-list">
      {groupedCustomers.map((group) => (
        <section className="appointment-group" key={group.date}>
          <div className="appointment-group-header">
            <div>
              <h2>{formatAppointmentDateHeading(group.date, locale)}</h2>
              <p>
                {group.customers.length} {group.customers.length === 1 ? t("customers.appointment") : t("customers.appointments")}
              </p>
            </div>
          </div>

          <div className="customer-list">
            {group.customers.map((customer) => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                routeOrder={routeOrderActive ? customer.route_order : null}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupCustomersByAppointmentDate(customers, routeOrderActive) {
  const groups = new Map();

  [...customers].sort((a, b) => compareCustomerDisplayOrder(a, b, routeOrderActive)).forEach((customer) => {
    const date = customer.appointment_date || "";
    const group = groups.get(date) || [];
    group.push(customer);
    groups.set(date, group);
  });

  return [...groups.entries()].map(([date, groupCustomers]) => ({
    date,
    customers: groupCustomers
  }));
}

function compareCustomerDisplayOrder(a, b, routeOrderActive) {
  if (!routeOrderActive) {
    return compareAppointmentDateTime(a, b);
  }

  const routeOrderA = Number(a.route_order);
  const routeOrderB = Number(b.route_order);
  const hasRouteOrderA = Number.isFinite(routeOrderA);
  const hasRouteOrderB = Number.isFinite(routeOrderB);

  if (hasRouteOrderA && hasRouteOrderB && routeOrderA !== routeOrderB) {
    return routeOrderA - routeOrderB;
  }

  if (hasRouteOrderA !== hasRouteOrderB) {
    return hasRouteOrderA ? -1 : 1;
  }

  return compareAppointmentDateTime(a, b);
}

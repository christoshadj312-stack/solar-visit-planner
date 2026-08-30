import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { StatusBadge } from "../common/StatusBadge.jsx";
import { CustomerActions } from "./CustomerActions.jsx";
import { formatAppointment } from "../../utils/date.js";
import {
  deleteCustomer,
  updateCustomerStatus,
} from "../../services/customerService.js";
import { queueThankYouSms } from "../../services/thankYouSmsService.js";
import {
  approveNextArrivalAfterCompletion,
  getNextScheduledCustomerAfter,
} from "../../services/arrivalAutomationService.js";
import { useTranslation } from "../../i18n/index.js";

export function CustomerCard({
  customer,
  routeOrder,
  afterDeletePath = "/customers",
  afterEditPath = null,
  onDeleted,
}) {
  const navigate = useNavigate();
  const { t, locale } = useTranslation();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showRoofPlan, setShowRoofPlan] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeError, setCompleteError] = useState("");
  const [completeOptions, setCompleteOptions] = useState({
    sendThankYou: true,
    approveArrival: false,
  });
  const [nextArrivalCustomer, setNextArrivalCustomer] = useState(null);
  const [nextArrivalLoading, setNextArrivalLoading] = useState(false);

  const normalizedStatus = customer.status?.toLowerCase();
  const isCancelled = ["cancelled", "canceled"].includes(normalizedStatus);
  const isCompleted = ["completed", "visited", "done", "accepted"].includes(
    normalizedStatus
  );
  const isScheduled = !isCancelled && !isCompleted;
  const hasNotes = Boolean(customer.notes?.trim());
  const hasRoofPlan = Boolean(customer.roof_plan_url);

  async function confirmDelete() {
    setDeleting(true);

    try {
      await deleteCustomer(customer.id);

      if (typeof onDeleted === "function") {
        onDeleted(customer);
        return;
      }

      navigate(afterDeletePath || "/customers", { replace: true });
      window.location.reload();
    } catch (error) {
      alert(error.message || t("customers.unableDelete"));
    } finally {
      setDeleting(false);
    }
  }

  async function handleCancelAppointment() {
    const confirmed = window.confirm(
      `Cancel the appointment for "${customer.full_name}"?`
    );

    if (!confirmed) return;

    try {
      await updateCustomerStatus(customer.id, "Cancelled");
      window.location.reload();
    } catch (error) {
      alert(error.message || t("customers.unableCancel"));
    }
  }

  async function handleCompleteAppointment() {
    setCompleteError("");
    setCompleteOptions({ sendThankYou: true, approveArrival: false });
    setNextArrivalCustomer(null);
    setCompleteModalOpen(true);
    setNextArrivalLoading(true);

    try {
      const nextCustomer = await getNextScheduledCustomerAfter(customer);
      setNextArrivalCustomer(nextCustomer || null);
    } catch {
      setNextArrivalCustomer(null);
    } finally {
      setNextArrivalLoading(false);
    }
  }

  async function confirmCompleteAppointment() {
    setCompleteLoading(true);
    setCompleteError("");

    try {
      const updatedCustomer = await updateCustomerStatus(customer.id, "Completed");
      const completedCustomer = { ...customer, ...updatedCustomer, status: "Completed" };
      const warnings = [];

      if (completeOptions.sendThankYou) {
        try {
          await queueThankYouSms(updatedCustomer.id || customer.id);
        } catch (smsError) {
          warnings.push(smsError.message || t("customers.thankYouQueueFailed"));
        }
      }

      if (completeOptions.approveArrival) {
        try {
          const arrivalResult = await approveNextArrivalAfterCompletion(completedCustomer);
          if (["no_next", "missing_phone", "missing_coordinates", "missing_current_date"].includes(arrivalResult.action)) {
            warnings.push(arrivalResult.message);
          }
        } catch (arrivalError) {
          warnings.push(
            arrivalError.message ||
              "Η επίσκεψη ολοκληρώθηκε, αλλά δεν ενεργοποιήθηκε το SMS άφιξης."
          );
        }
      }

      if (warnings.length) {
        setCompleteError(warnings.join(" "));
        return;
      }

      setCompleteModalOpen(false);
      window.location.reload();
    } catch (error) {
      setCompleteError(error.message || t("customers.unableComplete"));
    } finally {
      setCompleteLoading(false);
    }
  }

  async function handleRescheduleAppointment() {
    const confirmed = window.confirm(
      `Move "${customer.full_name}" back to Scheduled?`
    );

    if (!confirmed) return;

    try {
      await updateCustomerStatus(customer.id, "Scheduled");
      window.location.reload();
    } catch (error) {
      alert(error.message || t("customers.unableReschedule"));
    }
  }

  return (
    <article
      className={`customer-card customer-card-crm ${
        isCancelled ? "customer-card-cancelled" : ""
      }`}
    >
      {routeOrder ? (
        <div className="route-order-badge">
          {t("customers.route")} {routeOrder}
        </div>
      ) : null}

      <header className="customer-card-hero">
        <div className="customer-avatar" aria-hidden="true">
          <UserRound size={22} />
        </div>

        <div className="customer-hero-copy">
          <p className="customer-card-kicker">{t("calendar.appointment")}</p>
          <h2>{customer.full_name || t("app.noName")}</h2>

          <div className="customer-hero-meta">
            <span>
              <CalendarDays size={15} />
              {formatAppointment(
                customer.appointment_date,
                customer.appointment_time,
                locale
              )}
            </span>

            {customer.address ? (
              <span>
                <MapPin size={15} />
                {customer.address}
              </span>
            ) : null}
          </div>
        </div>

        <div className="customer-top-actions">
          <StatusBadge status={customer.status} />

          <Link
            className="small-card-icon"
            to={buildCustomerEditUrl(customer, afterEditPath || afterDeletePath)}
            aria-label={t("customers.editCustomer")}
          >
            <Edit3 size={15} />
          </Link>

          <button
            className="small-card-icon delete-small-icon"
            onClick={() => setDeleteModalOpen(true)}
            type="button"
            aria-label={t("customers.deleteCustomer")}
            title={t("customers.deleteCustomer")}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <div className="customer-crm-grid">
        <section className="customer-section customer-section-appointment">
          <h3>{t("form.appointment")}</h3>

          <div className="customer-field-list">
            <DetailRow
              label={t("form.appointmentDate")}
              value={customer.appointment_date || t("app.noDate")}
              icon={CalendarDays}
            />

            <DetailRow
              label={t("form.appointmentTime")}
              value={customer.appointment_time || t("app.noTime")}
            />
          </div>
        </section>

        <section className="customer-section customer-section-contact">
          <h3>{t("customers.sectionContact")}</h3>

          <div className="customer-field-list">
            <DetailRow
              label={t("form.phone")}
              value={customer.phone || t("app.noPhone")}
              icon={Phone}
            />

            <DetailRow
              label={t("form.email")}
              value={customer.email || t("app.notAvailable")}
              icon={Mail}
            />
          </div>
        </section>

        <section className="customer-section customer-section-address">
          <h3>{t("form.address")}</h3>

          <div className="customer-address-box">
            <MapPin size={17} />
            <span>{customer.address || t("app.noAddress")}</span>
          </div>
        </section>

        {hasRoofPlan ? (
          <section className="customer-section customer-section-roof-plan">
            <h3>Σχέδιο οροφής</h3>

            {!showRoofPlan ? (
              <button
                className="button button-light"
                type="button"
                onClick={() => setShowRoofPlan(true)}
              >
                Προβολή σχεδίου οροφής
              </button>
            ) : (
              <>
                <a
                  className="customer-roof-plan-link"
                  href={customer.roof_plan_url}
                  target="_blank"
                  rel="noreferrer"
                  title="Άνοιγμα σχεδίου οροφής"
                >
                  <img
                    className="customer-roof-plan-image"
                    src={customer.roof_plan_url}
                    alt="Σχέδιο οροφής"
                    loading="lazy"
                    decoding="async"
                  />
                </a>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginTop: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <a
                    className="button button-light"
                    href={customer.roof_plan_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={16} />
                    Άνοιγμα
                  </a>

                  <button
                    className="button button-light"
                    type="button"
                    onClick={() => setShowRoofPlan(false)}
                  >
                    Απόκρυψη
                  </button>
                </div>
              </>
            )}
          </section>
        ) : null}

        <section className="customer-section customer-section-notes">
          <h3>{t("form.notes")}</h3>

          {hasNotes ? (
            <p className="notes customer-notes-text">{customer.notes}</p>
          ) : (
            <p className="customer-empty-text">{t("app.notAvailable")}</p>
          )}
        </section>

        <section className="customer-section customer-section-actions">
          <h3>{t("customers.sectionActions")}</h3>

          <div className="card-status-action">
            {isScheduled ? (
              <div className="appointment-status-actions">
                <button
                  className="button button-primary complete-button"
                  type="button"
                  onClick={handleCompleteAppointment}
                >
                  <CheckCircle2 size={18} />
                  {t("customers.completeVisit")}
                </button>

                <button
                  className="button button-danger complete-button"
                  type="button"
                  onClick={handleCancelAppointment}
                >
                  <XCircle size={18} />
                  {t("customers.cancelAppointment")}
                </button>
              </div>
            ) : null}

            {isCompleted ? (
              <div className="completed-note">
                <CheckCircle2 size={18} />
                {t("customers.completed")}
              </div>
            ) : null}

            {isCancelled ? (
              <div className="appointment-status-actions">
                <div className="completed-note cancelled-note">
                  <XCircle size={18} />
                  {t("customers.cancelled")}
                </div>

                <button
                  className="button button-light complete-button"
                  type="button"
                  onClick={handleRescheduleAppointment}
                >
                  <RotateCcw size={18} />
                  {t("customers.reschedule")}
                </button>
              </div>
            ) : null}
          </div>

          <div className="card-actions-wrap">
            <CustomerActions customer={customer} />
          </div>
        </section>
      </div>

      {completeModalOpen ? (
        <div
          className="confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`complete-${customer.id}`}
        >
          <div className="confirm-panel complete-visit-confirm-panel">
            <h3 id={`complete-${customer.id}`}>Ολοκλήρωση επίσκεψης</h3>
            <p>
              Να ολοκληρωθεί το ραντεβού για <strong>{customer.full_name}</strong>;
            </p>

            <div className="complete-sms-options">
              <label className="complete-sms-option">
                <input
                  type="checkbox"
                  checked={completeOptions.sendThankYou}
                  onChange={(event) =>
                    setCompleteOptions((current) => ({
                      ...current,
                      sendThankYou: event.target.checked,
                    }))
                  }
                  disabled={completeLoading}
                />
                <span>
                  <strong>Αποστολή ευχαριστήριου SMS</strong>
                  <small>Θα μπει στο SMS queue μετά την ολοκλήρωση.</small>
                </span>
              </label>

              <label
                className={`complete-sms-option${
                  !nextArrivalLoading && !nextArrivalCustomer ? " is-disabled" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={completeOptions.approveArrival}
                  onChange={(event) =>
                    setCompleteOptions((current) => ({
                      ...current,
                      approveArrival: event.target.checked,
                    }))
                  }
                  disabled={
                    completeLoading || nextArrivalLoading || !nextArrivalCustomer
                  }
                />
                <span>
                  <strong>Ενεργοποίηση SMS άφιξης για τον επόμενο πελάτη</strong>
                  <small>
                    {nextArrivalLoading
                      ? "Έλεγχος επόμενου ραντεβού..."
                      : nextArrivalCustomer
                        ? `${String(nextArrivalCustomer.appointment_time || "").slice(0, 5)} — ${
                            nextArrivalCustomer.full_name || "Επόμενος πελάτης"
                          }`
                        : "Δεν υπάρχει επόμενο ενεργό ραντεβού για σήμερα."}
                  </small>
                </span>
              </label>
            </div>

            {completeError ? (
              <p className="appointment-action-error">{completeError}</p>
            ) : null}

            <div className="confirm-actions complete-visit-confirm-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={confirmCompleteAppointment}
                disabled={completeLoading}
              >
                <CheckCircle2 size={18} />
                {completeLoading ? "Ολοκλήρωση..." : t("customers.completeVisit")}
              </button>

              <button
                className="button button-light"
                type="button"
                onClick={() => setCompleteModalOpen(false)}
                disabled={completeLoading}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteModalOpen ? (
        <div
          className="confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-${customer.id}`}
        >
          <div className="confirm-panel">
            <h3 id={`delete-${customer.id}`}>
              {t("customers.deleteCustomerQuestion")}
            </h3>

            <p>
              {t("customers.deleteDescription", {
                name: customer.full_name,
              })}
            </p>

            <p className="confirm-warning">{t("customers.deleteWarning")}</p>

            <div className="confirm-actions">
              <button
                className="button button-light"
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleting}
              >
                {t("common.cancel")}
              </button>

              <button
                className="button button-danger"
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
              >
                <Trash2 size={18} />
                {deleting
                  ? t("customers.deleting")
                  : t("customers.deleteCustomerAndAppointment")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function DetailRow({ label, value, icon: Icon }) {
  return (
    <div className="customer-detail-row">
      <span className="customer-detail-label">
        {Icon ? <Icon size={14} /> : null}
        {label}
      </span>

      <strong>{value}</strong>
    </div>
  );
}

function buildCustomerEditUrl(customer, returnToPath) {
  const fallbackDate = getValidAppointmentDate(customer.appointment_date);
  const returnTo = returnToPath || `/customers?date=${fallbackDate}`;

  return `/customers/${customer.id}/edit?returnTo=${encodeURIComponent(
    returnTo
  )}`;
}

function getValidAppointmentDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? value
    : new Date().toISOString().slice(0, 10);
}
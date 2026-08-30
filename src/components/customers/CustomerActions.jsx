import {
  Clock3,
  MapPinned,
  MessageCircle,
  Navigation,
  Phone,
  Send,
} from "lucide-react";
import { useState } from "react";
import {
  callUrl,
  googleMapsUrl,
  smsUrl,
  wazeUrl,
  appointmentReminderMessage,
} from "../../utils/contactLinks.js";
import { queueThankYouSms } from "../../services/thankYouSmsService.js";
import { queueArrivalSoonSms } from "../../services/arrivalSmsService.js";
import { useTranslation } from "../../i18n/index.js";

const HISTORY_KEY = "solarvisitPhotovoltaics.communicationHistory.v1";
const LEGACY_HISTORY_KEY = ["pv", "Vi", "sit", "Planner.communicationHistory.v1"].join("");

export function CustomerActions({ customer }) {
  const { t, locale } = useTranslation();
  const [history, setHistory] = useState(() =>
    readCommunicationHistory(customer.id)
  );
  const [thankYouState, setThankYouState] = useState({
    loading: false,
    message: "",
    error: "",
    queued: false,
  });
  const [arrivalSmsState, setArrivalSmsState] = useState({
    loading: false,
    message: "",
    error: "",
    queued: false,
  });

  const isCompletedAppointment = isCompletedStatus(customer.status);
  const isScheduledAppointment = isScheduledStatus(customer.status);

  function recordCommunication(type, defaultNote = "") {
    const entry = {
      id: createEntryId(),
      type,
      note: defaultNote,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [entry, ...history].slice(0, 20);

    setHistory(nextHistory);
    writeCommunicationHistory(customer.id, nextHistory);
  }

  async function handleThankYouSms() {
    setThankYouState({
      loading: true,
      message: "",
      error: "",
      queued: false,
    });

    try {
      const result = await queueThankYouSms(customer.id);

      const message =
        result.message ||
        (result.duplicate
          ? t("actions.thankYouAlreadyQueued")
          : t("actions.thankYouQueued"));

      setThankYouState({
        loading: false,
        message,
        error: "",
        queued: true,
        duplicate: Boolean(result.duplicate),
        alreadySent: Boolean(result.alreadySent),
      });

      recordCommunication("Thank You SMS", message);
    } catch (error) {
      setThankYouState({
        loading: false,
        message: "",
        error: error.message || t("actions.thankYouUnable"),
        queued: false,
      });
    }
  }


  async function handleArrivalSoonSms() {
    const confirmed = window.confirm(
      "Να μπει στην ουρά SMS ότι είμαστε περίπου 10 λεπτά μακριά;"
    );

    if (!confirmed) return;

    setArrivalSmsState({
      loading: true,
      message: "",
      error: "",
      queued: false,
    });

    try {
      const result = await queueArrivalSoonSms(customer.id);

      const message =
        result.message ||
        (result.duplicate
          ? "Το SMS άφιξης υπάρχει ήδη για αυτό το ραντεβού."
          : "Το SMS άφιξης μπήκε στην ουρά για αποστολή από Android.");

      setArrivalSmsState({
        loading: false,
        message,
        error: "",
        queued: true,
        duplicate: Boolean(result.duplicate),
        alreadySent: Boolean(result.alreadySent),
      });

      recordCommunication("SMS άφιξης", message);
    } catch (error) {
      setArrivalSmsState({
        loading: false,
        message: "",
        error: error.message || "Δεν ήταν δυνατή η αποστολή SMS άφιξης.",
        queued: false,
      });
    }
  }

  return (
    <section className="communication-panel">
      <div className="action-grid action-grid-premium">
        <a
          className="button action-button action-call"
          href={callUrl(customer.phone)}
          onClick={() =>
            recordCommunication(t("actions.call"), t("actions.callStarted"))
          }
          aria-label={t("actions.callCustomer")}
          title={t("actions.call")}
        >
          <Phone size={21} />
          <span>Call</span>
        </a>

        <a
          className="button action-button action-sms"
          href={smsUrl(customer.phone, appointmentReminderMessage(customer))}
          onClick={() =>
            recordCommunication(
              t("actions.message"),
              t("actions.appointmentReminderSms")
            )
          }
          aria-label={t("actions.sendReminderSms")}
          title={t("actions.message")}
        >
          <MessageCircle size={21} />
          <span>SMS</span>
        </a>

        <a
          className="button action-button action-maps action-navigation"
          href={googleMapsUrl(customer.address)}
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            recordCommunication("Google Maps", t("actions.openGoogleMaps"))
          }
          aria-label={t("actions.openGoogleMaps")}
          title="Google Maps"
        >
          <MapPinned size={22} />
          <span>Maps</span>
        </a>

        <a
          className="button action-button action-waze action-navigation"
          href={wazeUrl(customer.address)}
          target="_blank"
          rel="noreferrer"
          onClick={() => recordCommunication("Waze", t("actions.openWaze"))}
          aria-label={t("actions.openWaze")}
          title="Waze"
        >
          <Navigation size={22} />
          <span>Waze</span>
        </a>
      </div>

      {isScheduledAppointment ? (
        <div className="thank-you-sms-panel">
          <button
            className="button button-primary thank-you-sms-button"
            type="button"
            onClick={handleArrivalSoonSms}
            disabled={arrivalSmsState.loading || arrivalSmsState.queued}
          >
            <Clock3 size={18} />
            {arrivalSmsState.loading
              ? "Μπαίνει στην ουρά..."
              : arrivalSmsState.alreadySent
                ? "Έχει ήδη σταλεί"
                : arrivalSmsState.duplicate
                  ? "Είναι ήδη στην ουρά"
                  : arrivalSmsState.queued
                    ? "Στην ουρά"
                    : "SMS: 10 λεπτά μακριά"}
          </button>

          {arrivalSmsState.message ? (
            <p className="thank-you-sms-feedback">{arrivalSmsState.message}</p>
          ) : null}

          {arrivalSmsState.error ? (
            <p className="thank-you-sms-error">{arrivalSmsState.error}</p>
          ) : null}
        </div>
      ) : null}

      {isCompletedAppointment ? (
        <div className="thank-you-sms-panel">
          <button
            className="button button-primary thank-you-sms-button"
            type="button"
            onClick={handleThankYouSms}
            disabled={thankYouState.loading || thankYouState.queued}
          >
            <Send size={18} />
            {thankYouState.loading
              ? t("actions.queueing")
              : thankYouState.alreadySent
                ? t("actions.alreadySent")
                : thankYouState.duplicate
                  ? t("actions.alreadyQueued")
                  : thankYouState.queued
                    ? t("actions.queued")
                    : t("actions.sendThankYouSms")}
          </button>

          {thankYouState.message ? (
            <p className="thank-you-sms-feedback">{thankYouState.message}</p>
          ) : null}

          {thankYouState.error ? (
            <p className="thank-you-sms-error">{thankYouState.error}</p>
          ) : null}
        </div>
      ) : null}

      {history.length ? (
        <div className="communication-history">
          {history.slice(0, 4).map((entry) => (
            <div key={entry.id}>
              <strong>{entry.type}</strong>
              <span>{formatEntryDate(entry.createdAt, locale)}</span>
              {entry.note ? <p>{entry.note}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function isCompletedStatus(status = "") {
  const normalizedStatus = String(status).trim().toLowerCase();

  return ["completed", "visited", "done", "accepted"].includes(
    normalizedStatus
  );
}

function isScheduledStatus(status = "") {
  const normalizedStatus = String(status).trim().toLowerCase();

  return ![
    "completed",
    "visited",
    "done",
    "accepted",
    "cancelled",
    "canceled",
    "rejected",
  ].includes(normalizedStatus);
}

function readCommunicationHistory(customerId) {
  try {
    const allHistory = JSON.parse(
      localStorage.getItem(HISTORY_KEY) ||
        localStorage.getItem(LEGACY_HISTORY_KEY) ||
        "{}"
    );

    const customerHistory = allHistory[customerId];

    return Array.isArray(customerHistory) ? customerHistory : [];
  } catch {
    return [];
  }
}

function writeCommunicationHistory(customerId, history) {
  const allHistory = JSON.parse(
    localStorage.getItem(HISTORY_KEY) ||
      localStorage.getItem(LEGACY_HISTORY_KEY) ||
      "{}"
  );

  allHistory[customerId] = history;

  localStorage.setItem(HISTORY_KEY, JSON.stringify(allHistory));
}

function createEntryId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `communication-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function formatEntryDate(value, locale) {
  return new Intl.DateTimeFormat(locale?.code === "el" ? "el-CY" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
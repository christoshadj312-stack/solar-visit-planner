import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listRouteSmsReplies } from "../services/routeSmsRepliesService.js";
import {
  listSmsDashboardMessages,
  updateSmsDashboardJobStatus,
} from "../services/smsDashboardService.js";

const SMS_STATUS_LABELS = {
  all: "Όλα",
  pending: "Αναμονή αποστολής",
  sent: "Στάλθηκε",
  failed: "Απέτυχε",
  cancelled: "Ακυρώθηκε",
  watching: "GPS παρακολούθηση",
};

const SMS_TYPE_LABELS = {
  reminder: "Υπενθύμιση",
  thank_you: "Ευχαριστήριο",
  route_options: "Επιλογές ώρας",
  arrival: "SMS άφιξης",
  other: "Άλλο",
};

const STATUS_LABELS = {
  waiting_reply: "Αναμονή απάντησης",
  confirmed: "Επιβεβαιώθηκε",
  unavailable: "Δεν μπορεί",
  requested_other: "Ζήτησε άλλη ώρα",
  unclear: "Ασαφής απάντηση",
  cancelled: "Ακυρώθηκε",
  sent: "Στάλθηκε",
};

const STATUS_CLASSES = {
  waiting_reply: "is-waiting",
  confirmed: "is-confirmed",
  unavailable: "is-unavailable",
  requested_other: "is-other",
  unclear: "is-unclear",
  cancelled: "is-cancelled",
  sent: "is-sent",
};

const SMS_STATUS_FILTERS = ["all", "watching", "pending", "sent", "failed", "cancelled"];

export function SmsRepliesPage() {
  const [smsJobs, setSmsJobs] = useState([]);
  const [smsSummary, setSmsSummary] = useState({
    total: 0,
    pending: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    watching: 0,
    sentToday: 0,
    failedToday: 0,
  });

  const [replies, setReplies] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actioningId, setActioningId] = useState("");

  const routeReplyStats = useMemo(() => {
    return replies.reduce(
      (summary, reply) => {
        const status = reply.status || "waiting_reply";

        summary.total += 1;

        if (status === "confirmed") summary.confirmed += 1;
        if (status === "waiting_reply") summary.waiting += 1;
        if (status === "unavailable") summary.unavailable += 1;
        if (status === "requested_other") summary.other += 1;
        if (status === "unclear") summary.unclear += 1;
        if (status === "cancelled") summary.cancelled += 1;

        return summary;
      },
      {
        total: 0,
        confirmed: 0,
        waiting: 0,
        unavailable: 0,
        other: 0,
        unclear: 0,
        cancelled: 0,
      }
    );
  }, [replies]);

  useEffect(() => {
    loadPage();
  }, [statusFilter]);

  async function loadPage() {
    setError("");

    try {
      const [smsData, routeReplies] = await Promise.all([
        listSmsDashboardMessages({
          status: statusFilter,
          limit: 300,
        }),
        listRouteSmsReplies().catch(() => []),
      ]);

      setSmsJobs(smsData.jobs);
      setSmsSummary(smsData.summary);
      setReplies(routeReplies);
    } catch (loadError) {
      setError(loadError.message || "Δεν ήταν δυνατή η φόρτωση των SMS.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    setActionMessage("");
    loadPage();
  }

  async function handleSmsAction(job, action) {
    const jobId = job?.id;

    if (!jobId || actioningId) {
      return;
    }

    const confirmed =
      action !== "cancel" ||
      window.confirm(
        "Θέλεις σίγουρα να ακυρωθεί η αποστολή αυτού του SMS; Αν είναι pending, το Companion δεν θα το στείλει."
      );

    if (!confirmed) {
      return;
    }

    setActioningId(jobId);
    setError("");
    setActionMessage("");

    try {
      const result = await updateSmsDashboardJobStatus({ jobId, action });
      setActionMessage(result.message || "Η ενέργεια ολοκληρώθηκε.");
      await loadPage();
    } catch (actionError) {
      setError(
        actionError.message || "Δεν ήταν δυνατή η αλλαγή κατάστασης του SMS."
      );
    } finally {
      setActioningId("");
    }
  }

  return (
    <div className="sms-replies-page">
      <header className="workspace-header">
        <div>
          <p>Companion Dashboard</p>
          <h1>Κέντρο Μηνυμάτων</h1>
          <span>
            Εδώ βλέπεις όλα τα SMS που μπαίνουν στο sms_queue: υπενθυμίσεις,
            ευχαριστήρια, επιλογές ώρας από το Optimize Route και SMS άφιξης/GPS. Το αυτόματο
            σύστημα συνεχίζει να δουλεύει, αλλά έχεις και χειροκίνητο έλεγχο.
          </span>
        </div>

        <button
          className="button button-primary"
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Ανανέωση..." : "Ανανέωση"}
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {actionMessage ? <p className="settings-feedback">{actionMessage}</p> : null}

      <section className="sms-replies-stats">
        <StatCard label="Σύνολο SMS" value={smsSummary.total} />
        <StatCard label="GPS αναμονή" value={smsSummary.watching || 0} />
        <StatCard label="Αναμονή" value={smsSummary.pending} />
        <StatCard label="Στάλθηκαν" value={smsSummary.sent} />
        <StatCard label="Απέτυχαν" value={smsSummary.failed} />
        <StatCard label="Ακυρώθηκαν" value={smsSummary.cancelled || 0} />
        <StatCard label="Στάλθηκαν σήμερα" value={smsSummary.sentToday} />
      </section>

      <section className="workspace-panel sms-replies-panel">
        <div className="sms-dashboard-toolbar">
          <div>
            <h2>Κατάσταση μηνυμάτων</h2>
            <p>
              Αναμονή σημαίνει ότι το Companion θα το στείλει αυτόματα. Από εδώ
              μπορείς να ακυρώσεις pending/GPS SMS ή να ξαναβάλεις failed/cancelled
              SMS στην ουρά για αποστολή.
            </p>
          </div>

          <div className="sms-dashboard-filters">
            {SMS_STATUS_FILTERS.map((status) => (
              <button
                key={status}
                className={`button ${
                  statusFilter === status ? "button-primary" : "button-light"
                }`}
                type="button"
                onClick={() => setStatusFilter(status)}
              >
                {SMS_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p>Φόρτωση SMS...</p>
        ) : smsJobs.length === 0 ? (
          <p>Δεν υπάρχουν SMS για το επιλεγμένο φίλτρο.</p>
        ) : (
          <div className="sms-dashboard-list">
            {smsJobs.map((job) => (
              <SmsDashboardCard
                key={job.id}
                job={job}
                actioning={actioningId === job.id}
                onAction={handleSmsAction}
              />
            ))}
          </div>
        )}
      </section>

      <section className="sms-replies-stats">
        <StatCard label="Απαντήσεις" value={routeReplyStats.total} />
        <StatCard label="Επιβεβαιωμένα" value={routeReplyStats.confirmed} />
        <StatCard label="Αναμονή" value={routeReplyStats.waiting} />
        <StatCard label="Δεν μπορούν" value={routeReplyStats.unavailable} />
        <StatCard label="Άλλη ώρα" value={routeReplyStats.other} />
        <StatCard label="Ασαφή/Ακυρωμένα" value={routeReplyStats.unclear + routeReplyStats.cancelled} />
      </section>

      <section className="workspace-panel sms-replies-panel">
        <div className="sms-dashboard-toolbar">
          <div>
            <h2>Απαντήσεις επιλογής ώρας</h2>
            <p>
              Εδώ φαίνεται τι απάντησε ο πελάτης στα SMS επιλογής ώρας και αν
              δημιουργήθηκε αυτόματα ραντεβού στο ημερολόγιο.
            </p>
          </div>
        </div>

        {loading ? (
          <p>Φόρτωση απαντήσεων...</p>
        ) : replies.length === 0 ? (
          <p>Δεν υπάρχουν ακόμα απαντήσεις SMS.</p>
        ) : (
          <div className="sms-replies-list">
            {replies.map((reply) => (
              <SmsReplyCard key={reply.id} reply={reply} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SmsDashboardCard({ job, actioning, onAction }) {
  const status = job.status || "pending";
  const type = job.messageType || "other";

  const appointmentDate = job.appointmentDate || "";
  const calendarLink = appointmentDate
    ? `/appointments?month=${appointmentDate.slice(0, 7)}&date=${appointmentDate}`
    : "/appointments";

  const replyStatusLabel = job.replyStatus
    ? STATUS_LABELS[job.replyStatus] || job.replyStatus
    : "-";

  return (
    <article className="sms-reply-card">
      <div className="sms-reply-card-header">
        <div>
          <h3>{job.customerName || "Χωρίς όνομα πελάτη"}</h3>
          <p>{job.phone || "Χωρίς τηλέφωνο"}</p>
        </div>

        <span className={`sms-reply-status is-${status}`}>
          {SMS_STATUS_LABELS[status] || status}
        </span>
      </div>

      <div className="sms-reply-grid">
        <Info label="Τύπος SMS" value={SMS_TYPE_LABELS[type] || type} />
        <Info label="Ημερομηνία επίσκεψης" value={formatDate(appointmentDate)} />
        <Info label="Ώρα / επιλογές" value={formatAppointmentTime(job.appointmentTime)} />
        <Info label="Μπήκε στην ουρά" value={formatDateTime(job.createdAt)} />
        <Info label="Στάλθηκε" value={formatDateTime(job.sentAt)} />
        <Info label="Κατάσταση απάντησης" value={replyStatusLabel} />
      </div>

      {type === "route_options" ? (
        <div className="sms-reply-grid sms-reply-grid-compact">
          <Info label="Επιλογή 1" value={formatAppointmentTime(job.option1Time)} />
          <Info label="Επιλογή 2" value={formatAppointmentTime(job.option2Time)} />
          <Info label="Απάντηση πελάτη" value={job.replyText || "-"} />
        </div>
      ) : null}

      {job.customerAddress ? (
        <p className="sms-reply-warning">{job.customerAddress}</p>
      ) : null}

      {job.error ? <p className="form-error">Error: {job.error}</p> : null}

      <details className="sms-message-details">
        <summary>Προβολή μηνύματος</summary>
        <pre>{job.message || job.messagePreview || "-"}</pre>
      </details>

      <div className="sms-reply-footer">
        <div className="sms-dashboard-actions">
          {status === "pending" ? (
            <button
              className="button button-light sms-action-danger"
              type="button"
              onClick={() => onAction(job, "cancel")}
              disabled={actioning}
            >
              {actioning ? "Γίνεται..." : "Ακύρωση αποστολής"}
            </button>
          ) : null}

          {status === "watching" ? (
            <>
              <button
                className="button button-primary"
                type="button"
                onClick={() => onAction(job, "send_now")}
                disabled={actioning}
              >
                {actioning ? "Γίνεται..." : "Αποστολή τώρα"}
              </button>

              <button
                className="button button-light sms-action-danger"
                type="button"
                onClick={() => onAction(job, "cancel")}
                disabled={actioning}
              >
                {actioning ? "Γίνεται..." : "Ακύρωση GPS"}
              </button>
            </>
          ) : null}

          {status === "failed" || status === "cancelled" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => onAction(job, "resend")}
              disabled={actioning}
            >
              {actioning ? "Γίνεται..." : "Αποστολή ξανά"}
            </button>
          ) : null}

          {status === "sent" && type === "route_options" && job.replyStatus === "waiting_reply" ? (
            <button
              className="button button-light"
              type="button"
              onClick={() => onAction(job, "resend")}
              disabled={actioning}
            >
              {actioning ? "Γίνεται..." : "Επαναποστολή"}
            </button>
          ) : null}
        </div>

        {appointmentDate ? (
          <Link className="button button-light" to={calendarLink}>
            Άνοιγμα ημερολογίου
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="sms-replies-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SmsReplyCard({ reply }) {
  const status = reply.status || "waiting_reply";
  const statusLabel = STATUS_LABELS[status] || status;
  const statusClass = STATUS_CLASSES[status] || "";

  const customerName =
    reply.customer_name || reply.full_name || "Χωρίς όνομα πελάτη";

  const option1Time = formatAppointmentTime(
    reply.option1_time || reply.option_1_time
  );

  const option2Time = formatAppointmentTime(
    reply.option2_time || reply.option_2_time
  );

  const selectedTime = formatAppointmentTime(reply.selected_time);
  const appointmentDate = reply.appointment_date || "";
  const replyDate = reply.reply_received_at || reply.replied_at || "";
  const appointmentCreated = status === "confirmed" && reply.customer_id;

  const calendarLink = appointmentDate
    ? `/appointments?month=${appointmentDate.slice(0, 7)}&date=${appointmentDate}`
    : "/appointments";

  return (
    <article className="sms-reply-card">
      <div className="sms-reply-card-header">
        <div>
          <h3>{customerName}</h3>
          <p>{reply.phone || "Χωρίς τηλέφωνο"}</p>
        </div>

        <span className={`sms-reply-status ${statusClass}`}>{statusLabel}</span>
      </div>

      <div className="sms-reply-grid">
        <Info label="Ημερομηνία επίσκεψης" value={formatDate(appointmentDate)} />
        <Info label="Επιλογή 1" value={option1Time || "-"} />
        <Info label="Επιλογή 2" value={option2Time || "-"} />
        <Info label="Επιλεγμένη ώρα" value={selectedTime || "-"} />
        <Info label="Απάντηση πελάτη" value={reply.reply_text || "-"} />
        <Info label="Ώρα απάντησης" value={formatDateTime(replyDate)} />
      </div>

      <div className="sms-reply-footer">
        {appointmentCreated ? (
          <span className="sms-reply-created">
            Το ραντεβού δημιουργήθηκε αυτόματα.
          </span>
        ) : status === "confirmed" ? (
          <span className="sms-reply-warning">
            Επιβεβαιώθηκε, αλλά δεν φαίνεται συνδεδεμένο ραντεβού.
          </span>
        ) : status === "requested_other" ? (
          <span className="sms-reply-warning">
            Ο πελάτης ζήτησε άλλη ώρα. Θέλει χειροκίνητο έλεγχο.
          </span>
        ) : status === "unavailable" ? (
          <span className="sms-reply-warning">
            Ο πελάτης δεν μπορεί στις προτεινόμενες ώρες.
          </span>
        ) : status === "cancelled" ? (
          <span className="sms-reply-warning">
            Η αποστολή/απάντηση ακυρώθηκε χειροκίνητα.
          </span>
        ) : null}

        {appointmentCreated ? (
          <Link className="button button-light" to={calendarLink}>
            Άνοιγμα ημερολογίου
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function Info({ label, value }) {
  return (
    <div className="sms-reply-info">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function formatAppointmentTime(value) {
  const text = String(value || "");

  if (text.startsWith("route-options")) {
    return text.replace("route-options", "Επιλογές:");
  }

  if (text.includes("arrival-watch")) {
    return text.replace("arrival-watch", "GPS SMS άφιξης");
  }

  if (text.includes("arrival-soon")) {
    return text.replace("arrival-soon", "10 λεπτά μακριά");
  }

  if (text.includes("arrival-eta")) {
    return text.replace("arrival-eta", "Ώρα άφιξης");
  }

  const [hours = "", minutes = ""] = text.split(":");

  if (!hours || !minutes) {
    return text || "-";
  }

  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const [year, month, day] = String(value).slice(0, 10).split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("el-CY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

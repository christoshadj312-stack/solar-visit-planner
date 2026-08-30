import {
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../i18n/index.js";
import {
  listSmsSenderDevices,
  updateSmsSenderDevice,
} from "../services/deviceManagementService.js";

const DEVICE_COPY = {
  el: {
    eyebrow: "SMS Companion",
    title: "Συσκευές",
    description: "Έλεγξε ποια Android κινητά μπορούν να στέλνουν SMS από την εφαρμογή.",
    refresh: "Ανανέωση",
    loading: "Φόρτωση συσκευών...",
    emptyTitle: "Δεν υπάρχουν συσκευές ακόμα",
    emptyText:
      "Άνοιξε την Android εφαρμογή στο κινητό που θα στέλνει SMS και κάνε αίτημα σύνδεσης από τις Ρυθμίσεις.",
    loadError: "Δεν φορτώθηκαν οι συσκευές.",
    updateError: "Δεν έγινε η αλλαγή στη συσκευή.",
    updated: "Η συσκευή ενημερώθηκε.",
    metrics: {
      total: "Σύνολο",
      pending: "Αναμονή",
      active: "Ενεργές",
      disabled: "Απενεργοποιημένες",
    },
    status: {
      pending: "Αναμονή έγκρισης",
      approved: "Εγκεκριμένη",
      rejected: "Απορρίφθηκε",
      disabled: "Απενεργοποιημένη",
      unregistered: "Χωρίς αίτημα",
    },
    unknownSeller: "Χωρίς όνομα πωλητή",
    androidDevice: "Android device",
    phone: "Τηλέφωνο",
    lastSeen: "Last seen",
    request: "Αίτημα",
    condition: "Κατάσταση",
    offline: "Offline τώρα",
    online: "Online πρόσφατα",
    approve: "Έγκριση",
    reject: "Απόρριψη",
    deactivate: "Απενεργοποίηση",
  },
  en: {
    eyebrow: "SMS Companion",
    title: "Devices",
    description: "Control which Android phones can send SMS messages from the app.",
    refresh: "Refresh",
    loading: "Loading devices...",
    emptyTitle: "No devices yet",
    emptyText:
      "Open the Android app on the phone that will send SMS messages and request pairing from Settings.",
    loadError: "Devices could not be loaded.",
    updateError: "The device could not be updated.",
    updated: "Device updated.",
    metrics: {
      total: "Total",
      pending: "Pending",
      active: "Active",
      disabled: "Disabled",
    },
    status: {
      pending: "Waiting approval",
      approved: "Approved",
      rejected: "Rejected",
      disabled: "Disabled",
      unregistered: "No request",
    },
    unknownSeller: "No seller name",
    androidDevice: "Android device",
    phone: "Phone",
    lastSeen: "Last seen",
    request: "Request",
    condition: "Status",
    offline: "Offline now",
    online: "Recently online",
    approve: "Approve",
    reject: "Reject",
    deactivate: "Deactivate",
  },
};

export function DevicesPage() {
  const { language } = useTranslation();
  const copy = DEVICE_COPY[language] || DEVICE_COPY.el;

  const [devices, setDevices] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    disabled: 0,
    active: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedDevices = useMemo(() => {
    const priority = {
      pending: 0,
      approved: 1,
      disabled: 2,
      rejected: 3,
      unregistered: 4,
    };

    return (devices || [])
      .filter(Boolean)
      .sort((first, second) => {
        const firstPriority = priority[first.approvalStatus] ?? 9;
        const secondPriority = priority[second.approvalStatus] ?? 9;

        if (firstPriority !== secondPriority) {
          return firstPriority - secondPriority;
        }

        const secondDate = new Date(second.updatedAt || second.createdAt || 0).getTime();
        const firstDate = new Date(first.updatedAt || first.createdAt || 0).getTime();

        return (Number.isFinite(secondDate) ? secondDate : 0) -
          (Number.isFinite(firstDate) ? firstDate : 0);
      });
  }, [devices]);

  async function loadDevices() {
    setLoading(true);
    setFeedback("");

    try {
      const result = await listSmsSenderDevices();
      setDevices(Array.isArray(result.devices) ? result.devices : []);
      setSummary({
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        disabled: 0,
        active: 0,
        ...(result.summary || {}),
      });
    } catch (error) {
      console.error("Unable to load devices", error);
      setFeedback(error.message || copy.loadError);
    } finally {
      setLoading(false);
    }
  }

  async function updateDevice(deviceId, action) {
    const actionKey = `${deviceId}:${action}`;

    setActionLoading(actionKey);
    setFeedback("");

    try {
      const result = await updateSmsSenderDevice({ deviceId, action });

      setDevices((currentDevices) =>
        (currentDevices || []).map((device) =>
          device.deviceId === deviceId ? result.device || device : device
        )
      );

      setFeedback(result.message || copy.updated);
      await loadDevices();
    } catch (error) {
      console.error("Unable to update device", error);
      setFeedback(error.message || copy.updateError);
    } finally {
      setActionLoading("");
    }
  }

  return (
    <section className="workspace-page devices-page">
      <header className="workspace-header devices-header">
        <div>
          <p>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <span className="settings-header-note">{copy.description}</span>
        </div>

        <button className="button button-light" type="button" onClick={loadDevices} disabled={loading}>
          <RefreshCw size={17} />
          {copy.refresh}
        </button>
      </header>

      {feedback ? <p className="settings-feedback">{feedback}</p> : null}

      <div className="devices-summary-grid">
        <DeviceMetric label={copy.metrics.total} value={summary.total || 0} />
        <DeviceMetric label={copy.metrics.pending} value={summary.pending || 0} />
        <DeviceMetric label={copy.metrics.active} value={summary.active || 0} />
        <DeviceMetric label={copy.metrics.disabled} value={summary.disabled || 0} />
      </div>

      {loading ? (
        <div className="page-loader">{copy.loading}</div>
      ) : sortedDevices.length === 0 ? (
        <article className="workspace-panel devices-empty-panel">
          <Smartphone size={30} />
          <h2>{copy.emptyTitle}</h2>
          <p>{copy.emptyText}</p>
        </article>
      ) : (
        <div className="devices-list">
          {sortedDevices.map((device) => (
            <DeviceCard
              key={device.deviceId || device.id || device.senderPhone}
              device={device}
              copy={copy}
              language={language}
              actionLoading={actionLoading}
              onApprove={() => updateDevice(device.deviceId, "approve")}
              onReject={() => updateDevice(device.deviceId, "reject")}
              onDeactivate={() => updateDevice(device.deviceId, "deactivate")}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DeviceMetric({ label, value }) {
  return (
    <article className="workspace-panel device-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DeviceCard({
  device,
  copy,
  language,
  actionLoading,
  onApprove,
  onReject,
  onDeactivate,
}) {
  const status = device.approvalStatus || "unregistered";
  const isPending = status === "pending";
  const isApproved = status === "approved" && device.isActive;
  const isOffline = !isRecentlyOnline(device.lastSeenAt);

  return (
    <article className={`workspace-panel device-card device-card-${status}`}>
      <div className="device-card-main">
        <div className="device-icon-shell">
          <Smartphone size={22} />
        </div>

        <div className="device-card-copy">
          <div className="device-card-title-row">
            <h2>{device.sellerName || copy.unknownSeller}</h2>
            <span className={`device-status-pill device-status-${status}`}>
              {copy.status[status] || copy.status.unregistered}
            </span>
          </div>

          <p>{device.deviceName || copy.androidDevice}</p>

          <div className="device-meta-grid">
            <DeviceMeta label={copy.phone} value={device.senderPhone || "—"} />
            <DeviceMeta label={copy.lastSeen} value={formatDateTime(device.lastSeenAt, language)} />
            <DeviceMeta label={copy.request} value={formatDateTime(device.requestedAt || device.createdAt, language)} />
            <DeviceMeta label={copy.condition} value={isOffline ? copy.offline : copy.online} />
          </div>
        </div>
      </div>

      <div className="device-card-actions">
        {isPending ? (
          <>
            <button
              className="button button-primary"
              type="button"
              onClick={onApprove}
              disabled={actionLoading === `${device.deviceId}:approve`}
            >
              <CheckCircle2 size={17} />
              {copy.approve}
            </button>

            <button
              className="button button-light danger-button"
              type="button"
              onClick={onReject}
              disabled={actionLoading === `${device.deviceId}:reject`}
            >
              <XCircle size={17} />
              {copy.reject}
            </button>
          </>
        ) : null}

        {isApproved ? (
          <button
            className="button button-light danger-button"
            type="button"
            onClick={onDeactivate}
            disabled={actionLoading === `${device.deviceId}:deactivate`}
          >
            <ShieldCheck size={17} />
            {copy.deactivate}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function DeviceMeta({ label, value }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function isRecentlyOnline(value) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return false;
  }

  return Date.now() - time <= 45 * 60 * 1000;
}

function formatDateTime(value, language = "el") {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(language === "en" ? "en-CY" : "el-CY", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

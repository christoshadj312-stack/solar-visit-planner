import {
  Bell,
  Cloud,
  Download,
  Globe2,
  Smartphone,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAppSettings } from "../hooks/useAppSettings.js";
import { useTranslation } from "../i18n/index.js";
import { useCustomers } from "../hooks/useCustomers.js";
import {
  listSmsSenderDevices,
  normalizeSenderPhone,
  submitSmsSenderDeviceRequest,
} from "../services/deviceManagementService.js";

export function SettingsPage() {
  const { customers, loading, error } = useCustomers();
  const { settings, updateSetting } = useAppSettings();
  const { t } = useTranslation();

  const [feedback, setFeedback] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [senderDevice, setSenderDevice] = useState(null);
  const [senderLoading, setSenderLoading] = useState(true);
  const [senderSaving, setSenderSaving] = useState(false);

  const [currentDeviceId] = useState(readCurrentAndroidDeviceId);
  const [currentDeviceName] = useState(readCurrentAndroidDeviceName);

  const isGreek = settings.language === "el";

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentSenderDevice() {
      if (!currentDeviceId) {
        if (!cancelled) {
          setSenderDevice(null);
          setSenderPhone("");
          setSellerName("");
          setSenderLoading(false);
        }

        return;
      }

      try {
        const { devices } = await listSmsSenderDevices();
        const currentDevice = (devices || []).find(
          (device) => device.deviceId === currentDeviceId
        );

        if (cancelled) {
          return;
        }

        setSenderDevice(currentDevice || null);

        if (currentDevice) {
          setSenderPhone(currentDevice.senderPhone || "");
          setSellerName(currentDevice.sellerName || "");
        }
      } catch (senderError) {
        console.error("Unable to load SMS sender device", senderError);
      } finally {
        if (!cancelled) {
          setSenderLoading(false);
        }
      }
    }

    loadCurrentSenderDevice();

    const intervalId = window.setInterval(loadCurrentSenderDevice, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentDeviceId]);

  const languageLabel =
    settings.language === "el"
      ? t("settings.language.valueEl")
      : t("settings.language.valueEn");

  const notificationLabel = settings.notifications
    ? t("settings.notifications.enabled")
    : t("settings.notifications.disabled");

  const senderOnline = useMemo(() => {
    if (!senderDevice?.lastSeenAt) {
      return false;
    }

    const lastSeenTime = new Date(senderDevice.lastSeenAt).getTime();

    if (!Number.isFinite(lastSeenTime)) {
      return false;
    }

    const connectionLimit = 45 * 60 * 1000;

    return Date.now() - lastSeenTime <= connectionLimit;
  }, [senderDevice]);

  const senderApproved = Boolean(
    currentDeviceId &&
      senderDevice?.isActive &&
      senderDevice?.senderPhone &&
      senderDevice?.approvalStatus === "approved"
  );

  const senderPending = senderDevice?.approvalStatus === "pending";
  const senderRejected = senderDevice?.approvalStatus === "rejected";
  const senderDisabled = senderDevice?.approvalStatus === "disabled";

  const exportRows = useMemo(
    () =>
      customers.map((customer) => ({
        full_name: customer.full_name || "",
        phone: customer.phone || "",
        email: customer.email || "",
        address: customer.address || "",
        status: customer.status || "",
        appointment_date: customer.appointment_date || "",
        appointment_time: customer.appointment_time || "",
      })),
    [customers]
  );

  function saveSetting(key, value, message = t("settings.saved")) {
    updateSetting(key, value);
    setFeedback(message);
  }

  async function requestSenderApproval() {
    if (!currentDeviceId) {
      setFeedback(
        isGreek
          ? "Το αίτημα σύνδεσης μπορεί να γίνει μόνο από την Android εφαρμογή."
          : "The connection request can only be made from the Android app."
      );

      return;
    }

    const normalizedPhone = normalizeSenderPhone(senderPhone);

    if (!normalizedPhone) {
      setFeedback(
        isGreek
          ? "Καταχώρισε έναν έγκυρο αριθμό, π.χ. +35799123456."
          : "Enter a valid number, e.g. +35799123456."
      );

      return;
    }

    setSenderSaving(true);
    setFeedback("");

    try {
      const result = await submitSmsSenderDeviceRequest({
        deviceId: currentDeviceId,
        deviceName: currentDeviceName,
        sellerName,
        senderPhone: normalizedPhone,
      });

      setSenderPhone(normalizedPhone);
      setSenderDevice(result.device || null);
      setFeedback(
        isGreek
          ? "Το αίτημα σύνδεσης στάλθηκε. Περιμένει έγκριση από το web app."
          : "The connection request was sent and is waiting for approval."
      );
    } catch (senderError) {
      console.error("Unable to request SMS sender approval", senderError);

      setFeedback(
        senderError.message ||
          (isGreek
            ? "Δεν στάλθηκε το αίτημα. Δοκίμασε ξανά."
            : "The request was not sent. Please try again.")
      );
    } finally {
      setSenderSaving(false);
    }
  }

  async function toggleNotifications() {
    if (!settings.notifications && "Notification" in window) {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setFeedback(t("settings.permissionDenied"));
        return;
      }
    }

    saveSetting("notifications", !settings.notifications);
  }

  function downloadBackup() {
    downloadFile(
      "solarvisit-photovoltaics-backup.json",
      "application/json",
      JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          settings,
          customers,
        },
        null,
        2
      )
    );

    setFeedback(t("settings.backupDone"));
  }

  function exportCsv() {
    const headers = Object.keys(
      exportRows[0] || {
        full_name: "",
        phone: "",
        email: "",
        address: "",
        status: "",
        appointment_date: "",
        appointment_time: "",
      }
    );

    const csv = [
      headers.join(","),
      ...exportRows.map((row) =>
        headers.map((header) => csvEscape(row[header])).join(",")
      ),
    ].join("\n");

    downloadFile(
      "solarvisit-photovoltaics-export.csv",
      "text/csv;charset=utf-8",
      csv
    );

    setFeedback(t("settings.exportDone"));
  }

  if (loading) {
    return <div className="page-loader">{t("settings.loading")}</div>;
  }

  if (error) {
    return <p className="form-error">{error}</p>;
  }

  const senderStatusLabel = !currentDeviceId
    ? isGreek
      ? "Δεν είναι Android συσκευή"
      : "Not an Android device"
    : senderLoading
      ? isGreek
        ? "Έλεγχος σύνδεσης..."
        : "Checking connection..."
      : senderApproved
        ? isGreek
          ? senderOnline
            ? "Εγκεκριμένο / Online"
            : "Εγκεκριμένο"
          : senderOnline
            ? "Approved / Online"
            : "Approved"
        : senderPending
          ? isGreek
            ? "Αναμονή έγκρισης"
            : "Waiting approval"
          : senderRejected
            ? isGreek
              ? "Απορρίφθηκε"
              : "Rejected"
            : senderDisabled
              ? isGreek
                ? "Απενεργοποιημένο"
                : "Disabled"
              : isGreek
                ? "Μη συνδεδεμένο"
                : "Disconnected";

  const senderStatusClass = !currentDeviceId
    ? "sms-sender-status is-unavailable"
    : senderApproved
      ? "sms-sender-status is-connected"
      : senderPending
        ? "sms-sender-status is-pending"
        : "sms-sender-status is-disconnected";

  const senderDescription = !currentDeviceId
    ? isGreek
      ? "Η σύνδεση αριθμού SMS γίνεται από την Android εφαρμογή στο κινητό που θα στέλνει τα μηνύματα."
      : "SMS sender pairing is done from the Android app on the phone that sends messages."
    : isGreek
      ? "Στείλε αίτημα σύνδεσης για αυτή τη συσκευή. Ο admin το εγκρίνει από τη σελίδα Συσκευές."
      : "Submit a connection request for this device. The admin approves it from the Devices page.";

  return (
    <section className="workspace-page">
      <header className="workspace-header">
        <div>
          <p>{t("settings.eyebrow")}</p>
          <h1>{t("settings.title")}</h1>

          <span className="settings-header-note">
            {isGreek
              ? "Ρύθμισε μόνο τα βασικά που χρειάζεται η εφαρμογή στην καθημερινή χρήση."
              : "Configure the essential settings required for daily use."}
          </span>
        </div>
      </header>

      {feedback ? <p className="settings-feedback">{feedback}</p> : null}

      <div className="settings-grid">
        <SettingsCard
          icon={Smartphone}
          title={isGreek ? "Σύνδεση συσκευής SMS" : "SMS device pairing"}
          description={senderDescription}
          value={senderStatusLabel}
          valueClassName={senderStatusClass}
        >
          <div className="sms-device-request-box">
            {currentDeviceName ? (
              <span className="sms-device-name">{currentDeviceName}</span>
            ) : null}

            <input
              className="sms-sender-phone-input"
              type="text"
              maxLength={80}
              value={sellerName}
              onChange={(event) => setSellerName(event.target.value)}
              placeholder={isGreek ? "Όνομα πωλητή" : "Seller name"}
              disabled={!currentDeviceId || senderSaving || senderApproved}
              aria-label={isGreek ? "Όνομα πωλητή" : "Seller name"}
            />

            <input
              className="sms-sender-phone-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              value={senderPhone}
              onChange={(event) => setSenderPhone(event.target.value)}
              placeholder="+357 99 123456"
              disabled={!currentDeviceId || senderSaving || senderApproved}
              aria-label={isGreek ? "Αριθμός αποστολής SMS" : "SMS sender number"}
            />

            <button
              className="button button-light"
              type="button"
              onClick={requestSenderApproval}
              disabled={!currentDeviceId || senderSaving || senderApproved}
            >
              {senderSaving
                ? isGreek
                  ? "Αποστολή..."
                  : "Sending..."
                : senderPending
                  ? isGreek
                    ? "Αποστολή ξανά"
                    : "Send again"
                  : isGreek
                    ? "Αίτημα σύνδεσης"
                    : "Request connection"}
            </button>

            {senderPending ? (
              <small className="sms-device-help-text">
                {isGreek
                  ? "Περιμένει έγκριση από τη σελίδα Συσκευές στο web app. Μέχρι τότε δεν θα στέλνει SMS."
                  : "Waiting for approval from the Devices page. Until then it will not send SMS."}
              </small>
            ) : null}
          </div>
        </SettingsCard>

        <SettingsCard
          icon={Globe2}
          title={t("settings.language.title")}
          description={t("settings.language.description")}
          value={languageLabel}
        >
          <div className="segmented-control">
            <button
              className={settings.language === "el" ? "is-active" : ""}
              onClick={() => saveSetting("language", "el")}
              type="button"
            >
              {t("settings.language.greek")}
            </button>

            <button
              className={settings.language === "en" ? "is-active" : ""}
              onClick={() => saveSetting("language", "en")}
              type="button"
            >
              {t("settings.language.english")}
            </button>
          </div>
        </SettingsCard>

        <SettingsCard
          icon={Bell}
          title={t("settings.notifications.title")}
          description={t("settings.notifications.description")}
          value={notificationLabel}
        >
          <button className="button button-light" onClick={toggleNotifications} type="button">
            {settings.notifications
              ? t("settings.notifications.disable")
              : t("settings.notifications.enable")}
          </button>
        </SettingsCard>

        <SettingsCard
          icon={Cloud}
          title={t("settings.backup.title")}
          description={t("settings.backup.description")}
          value={`${customers.length} ${t("settings.backup.customers")}`}
        >
          <button className="button button-light" onClick={downloadBackup} type="button">
            {t("settings.backup.button")}
          </button>
        </SettingsCard>

        <SettingsCard
          icon={Download}
          title={t("settings.export.title")}
          description={t("settings.export.description")}
          value="CSV"
        >
          <button className="button button-light" onClick={exportCsv} type="button">
            {t("settings.export.button")}
          </button>
        </SettingsCard>
      </div>
    </section>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  value,
  valueClassName = "",
  children,
}) {
  return (
    <article className="workspace-panel settings-card">
      <div>
        <Icon size={21} />

        <div>
          <h2>{title}</h2>
          <p>{description}</p>

          <strong
            className={["settings-current-value", valueClassName]
              .filter(Boolean)
              .join(" ")}
          >
            {value}
          </strong>
        </div>
      </div>

      <div className="settings-control">{children}</div>
    </article>
  );
}

function readCurrentAndroidDeviceId() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const bridge = window.SolarVisitDevice;

    if (!bridge || typeof bridge.getDeviceId !== "function") {
      return "";
    }

    return String(bridge.getDeviceId() || "").trim();
  } catch (error) {
    console.error("Unable to read Android device ID", error);
    return "";
  }
}

function readCurrentAndroidDeviceName() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const bridge = window.SolarVisitDevice;

    if (!bridge || typeof bridge.getDeviceName !== "function") {
      return "Android device";
    }

    return String(bridge.getDeviceName() || "Android device").trim();
  } catch (error) {
    console.error("Unable to read Android device name", error);
    return "Android device";
  }
}

function csvEscape(value) {
  const text = String(value ?? "");

  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function downloadFile(fileName, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

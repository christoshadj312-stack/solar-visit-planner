import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppSettings } from "../../hooks/useAppSettings.js";
import { useTranslation } from "../../i18n/index.js";
import { saveCustomer } from "../../services/customerService.js";
import { todayIso } from "../../utils/date.js";
import {
  findHolidayForDate,
  loadPublicHolidays,
} from "../../utils/holidayCalendar.js";

const emptyCustomer = {
  full_name: "",
  customer_title: "mr",
  sms_salutation_name: "",
  address: "",
  phone: "",
  email: "",
  notes: "",
  status: "Scheduled",
  appointment_date: "",
  appointment_time: "",
  roof_plan_url: "",
  latitude: "",
  longitude: "",
};

export function CustomerForm({ customer }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useAppSettings();
  const { t } = useTranslation();

  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));
  const requestedDate = getValidDateParam(searchParams.get("date"));
  const requestedTime = getValidTimeParam(searchParams.get("time"));

  const [values, setValues] = useState(() => {
    const normalizedCustomer = customer
      ? {
          ...customer,
          customer_title: normalizeCustomerTitle(customer.customer_title),
          sms_salutation_name: customer.sms_salutation_name || "",
        }
      : {};

    return {
      ...emptyCustomer,
      ...normalizedCustomer,
      appointment_date:
        customer?.appointment_date ||
        requestedDate ||
        emptyCustomer.appointment_date,
      appointment_time:
        customer?.appointment_time ||
        requestedTime ||
        emptyCustomer.appointment_time,
    };
  });

  const [roofPlanFile, setRoofPlanFile] = useState(null);
  const [showExistingRoofPlan, setShowExistingRoofPlan] = useState(false);
  const roofPlanInputRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [publicHolidays, setPublicHolidays] = useState([]);
  const [holidayWarning, setHolidayWarning] = useState("");

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [addressTouched, setAddressTouched] = useState(false);

  /*
   * Back/Cancel returns to the page from which the form was opened.
   * If there is no returnTo value, it returns to the selected appointment date.
   */
  const calendarReturn =
    returnTo || buildCalendarReturn(values.appointment_date);

  const previewUrl = useMemo(() => {
  if (roofPlanFile) {
    return URL.createObjectURL(roofPlanFile);
  }

  if (showExistingRoofPlan && values.roof_plan_url) {
    return values.roof_plan_url;
  }

  return "";
}, [roofPlanFile, showExistingRoofPlan, values.roof_plan_url]);

  const selectedHoliday = useMemo(
    () =>
      findHolidayForDate(
        settings,
        values.appointment_date,
        publicHolidays
      ),
    [settings, values.appointment_date, publicHolidays]
  );

  useEffect(() => {
    let ignore = false;

    const year =
      Number(values.appointment_date?.slice(0, 4)) ||
      new Date().getFullYear();

    async function loadHolidays() {
      const result = await loadPublicHolidays(
        settings.holidayCalendar,
        year
      );

      if (ignore) {
        return;
      }

      setPublicHolidays(result.holidays);
      setHolidayWarning(result.warning);
    }

    loadHolidays();

    return () => {
      ignore = true;
    };
  }, [settings.holidayCalendar, values.appointment_date]);

  useEffect(() => {
    if (!addressTouched) {
      return;
    }

    const query = values.address.trim();

    if (query.length < 2) {
      setAddressSuggestions([]);
      setAddressError("");
      return;
    }

    const timeout = window.setTimeout(async () => {
      setAddressLoading(true);
      setAddressError("");

      try {
        const response = await fetch(
          `/api/address-search?q=${encodeURIComponent(query)}`
        );

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload.error || t("form.unableAddressSuggestions")
          );
        }

        setAddressSuggestions(payload.suggestions || []);

        if (!payload.suggestions?.length) {
          setAddressError(
            payload.warning || t("form.noCyprusSuggestions")
          );
        }
      } catch (addressSearchError) {
        setAddressSuggestions([]);
        setAddressError(
          addressSearchError.message || t("form.unableAddressSuggestions")
        );
      } finally {
        setAddressLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [addressTouched, values.address, t]);

  function updateValue(event) {
    const { id, value } = event.target;

    setValues((current) => ({
      ...current,
      [id]: value,

      /*
       * When the address is manually changed, remove the old coordinates.
       * New coordinates will be added after selecting a suggestion.
       */
      latitude: id === "address" ? "" : current.latitude,
      longitude: id === "address" ? "" : current.longitude,

      /*
       * Changing appointment date/time makes it a Scheduled appointment.
       */
      status: ["appointment_date", "appointment_time"].includes(id)
        ? "Scheduled"
        : current.status,
    }));
  }

  async function selectAddressSuggestion(suggestion) {
    setAddressLoading(true);
    setAddressError("");

    try {
      let latitude = normalizeCoordinate(suggestion.latitude);
      let longitude = normalizeCoordinate(suggestion.longitude);
      let address =
        suggestion.fullAddress ||
        suggestion.address ||
        suggestion.label;

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        const response = await fetch("/api/address-geocode", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address,
            placeId: suggestion.placeId || "",
          }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload.error || t("form.unableGeocode")
          );
        }

        latitude = normalizeCoordinate(payload.latitude);
        longitude = normalizeCoordinate(payload.longitude);
        address =
          payload.formattedAddress ||
          payload.address ||
          address;
      }

      setValues((current) => ({
        ...current,
        address,
        latitude,
        longitude,
      }));

      setAddressSuggestions([]);
      setAddressTouched(false);
    } catch (addressSelectionError) {
      setAddressError(
        addressSelectionError.message || t("form.unableUseAddress")
      );
    } finally {
      setAddressLoading(false);
    }
  }

  function removeRoofPlan() {
    setRoofPlanFile(null);

    setValues((current) => ({
      ...current,
      roof_plan_url: "",
    }));

    if (roofPlanInputRef.current) {
      roofPlanInputRef.current.value = "";
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await saveCustomer(
        {
          ...values,
          customer_title: normalizeCustomerTitle(values.customer_title),
          sms_salutation_name: String(
            values.sms_salutation_name || ""
          ).trim(),
          status: values.status || "Scheduled",
        },
        roofPlanFile,
        []
      );

      const savedDate =
        getValidDateParam(values.appointment_date) || todayIso();

      const saveReturn = returnTo
        ? buildSaveReturn(returnTo, savedDate)
        : buildCalendarReturn(savedDate);

      navigate(saveReturn, {
        replace: true,
      });
    } catch (err) {
      setError(err.message || t("form.unableSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="appointment-form-page"
      onSubmit={handleSubmit}
    >
      <div className="appointment-form-shell">
        <button
          className="appointment-form-back"
          type="button"
          onClick={() => navigate(calendarReturn)}
        >
          &larr; {t("form.back")}
        </button>

        <header className="appointment-form-header">
          <p>{customer ? t("form.edit") : t("form.create")}</p>

          <h1>
            {customer
              ? t("form.editAppointment")
              : t("form.newAppointment")}
          </h1>
        </header>

        {error ? <p className="form-error">{error}</p> : null}

        {selectedHoliday ? (
          <p className="form-warning">
            {t("form.holidayWarning", {
              date: values.appointment_date,
              name: selectedHoliday.name,
            })}
          </p>
        ) : null}

        {holidayWarning ? (
          <p className="form-warning">{holidayWarning}</p>
        ) : null}

        <section className="appointment-form-section">
          <h2>{t("form.customer")}</h2>

          <div className="appointment-form-grid three-columns">
            <label>
              {t("form.fullName")}

              <input
                id="full_name"
                value={values.full_name}
                onChange={updateValue}
                required
              />
            </label>

            <label>
              {t("form.customerTitle")}

              <select
                id="customer_title"
                value={values.customer_title || "mr"}
                onChange={updateValue}
              >
                <option value="mr">{t("form.mr")}</option>
                <option value="ms">{t("form.mrs")}</option>
              </select>
            </label>

            <label>
              {t("form.smsSalutationName")}

              <input
                id="sms_salutation_name"
                value={values.sms_salutation_name || ""}
                onChange={updateValue}
                placeholder="π.χ. Αντωνίου"
              />
            </label>

            <label>
              {t("form.phone")}

              <input
                id="phone"
                type="tel"
                value={values.phone || ""}
                onChange={updateValue}
              />
            </label>

            <label>
              {t("form.email")}

              <input
                id="email"
                type="email"
                value={values.email || ""}
                onChange={updateValue}
              />
            </label>
          </div>
        </section>

        <section className="appointment-form-section">
          <h2>{t("form.appointment")}</h2>

          <div className="appointment-form-grid appointment-fields">
            <label>
              {t("form.appointmentDate")}

              <input
                id="appointment_date"
                type="date"
                value={values.appointment_date || ""}
                onChange={updateValue}
              />
            </label>

            <label>
              {t("form.appointmentTime")}

              <input
                id="appointment_time"
                type="time"
                value={values.appointment_time || ""}
                onChange={updateValue}
              />
            </label>

            <label className="wide">
              {t("form.address")}

              <div className="address-autocomplete">
                <input
                  id="address"
                  value={values.address || ""}
                  onChange={(event) => {
                    setAddressTouched(true);
                    updateValue(event);
                  }}
                  autoComplete="off"
                />

                {addressLoading ? (
                  <span className="address-loading">
                    {t("form.searchingCyprus")}
                  </span>
                ) : null}

                {addressError ? (
                  <span className="address-error">
                    {addressError}
                  </span>
                ) : null}

                {addressSuggestions.length ? (
                  <div
                    className="address-suggestions"
                    role="listbox"
                  >
                    {addressSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        onClick={() =>
                          selectAddressSuggestion(suggestion)
                        }
                      >
                        <strong>
                          {suggestion.mainLine ||
                            suggestion.label}
                        </strong>

                        <span>
                          {suggestion.secondaryLine ||
                            t("form.areaNotAvailable")}
                        </span>

                        <small>
                          {suggestion.isCoordinateLocation
                            ? "Coordinates"
                            : suggestion.latitude && suggestion.longitude
                              ? "Coordinates available"
                              : "Coordinates will be resolved after selection"}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>
          </div>
        </section>

        <section className="appointment-form-section">
          <h2>{t("form.notes")}</h2>

          <label className="notes-field">
            {t("form.notes")}

            <textarea
              id="notes"
              value={values.notes || ""}
              onChange={updateValue}
            />
          </label>
        </section>

        <section className="appointment-form-section roof-files-section">
          <h2>Σχέδιο οροφής</h2>

          <div className="roof-upload-grid roof-upload-grid-single">
            <div className="roof-upload-card">
              <div>
                <strong>Εικόνα / σχέδιο οροφής</strong>

                <span>
                  {roofPlanFile
                    ? roofPlanFile.name
                    : values.roof_plan_url
                      ? "Υπάρχει ήδη εικόνα οροφής"
                      : "Προαιρετικό upload εικόνας"}
                </span>
              </div>

              <input
                ref={roofPlanInputRef}
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setRoofPlanFile(event.target.files?.[0] || null)
                }
              />
            </div>
          </div>

          {values.roof_plan_url && !roofPlanFile && !showExistingRoofPlan ? (
  <div className="roof-preview-wrap appointment-roof-preview">
    <button
      className="button button-light"
      type="button"
      onClick={() => setShowExistingRoofPlan(true)}
    >
      Προβολή υπάρχοντος σχεδίου
    </button>

    <button
      className="button button-light"
      type="button"
      onClick={removeRoofPlan}
    >
      Αφαίρεση εικόνας
    </button>
  </div>
) : null}

{previewUrl ? (
  <div className="roof-preview-wrap appointment-roof-preview">
    <img
      className="roof-preview"
      src={previewUrl}
      alt="Προεπισκόπηση σχεδίου οροφής"
      loading="lazy"
      decoding="async"
    />

    {showExistingRoofPlan && !roofPlanFile ? (
      <button
        className="button button-light"
        type="button"
        onClick={() => setShowExistingRoofPlan(false)}
      >
        Απόκρυψη
      </button>
    ) : null}

    <button
      className="button button-light"
      type="button"
      onClick={removeRoofPlan}
    >
      Αφαίρεση εικόνας
    </button>
  </div>
) : null}
        </section>
      </div>

      <div className="appointment-form-actions">
        <button
          className="button button-light"
          type="button"
          onClick={() => navigate(calendarReturn)}
        >
          {t("form.cancel")}
        </button>

        <button
          className="button button-primary"
          type="submit"
          disabled={saving}
        >
          {saving
            ? t("form.saving")
            : t("form.saveAppointment")}
        </button>
      </div>
    </form>
  );
}

function buildSaveReturn(returnTo, savedDate) {
  if (!returnTo.startsWith("/customers")) {
    return returnTo;
  }

  const [path, query = ""] = returnTo.split("?");
  const params = new URLSearchParams(query);

  params.set("date", savedDate);

  return `${path}?${params.toString()}`;
}

function normalizeCustomerTitle(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "ms" ||
    normalized === "mrs" ||
    normalized === "miss" ||
    normalized === "female" ||
    normalized === "woman" ||
    normalized === "κυρια" ||
    normalized === "κυρία"
  ) {
    return "ms";
  }

  return "mr";
}

function normalizeCoordinate(value) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : null;
}

function getValidDateParam(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? value
    : "";
}

function getValidTimeParam(value) {
  return /^\d{2}:\d{2}$/.test(value || "")
    ? value
    : "";
}

function getSafeReturnTo(value) {
  if (!value || !value.startsWith("/")) {
    return "";
  }

  if (value.startsWith("//")) {
    return "";
  }

  return value;
}

function buildCalendarReturn(date) {
  const safeDate = getValidDateParam(date) || todayIso();

  return `/appointments?month=${safeDate.slice(
    0,
    7
  )}&date=${safeDate}`;
}
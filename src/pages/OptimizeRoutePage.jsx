import {
  AlertTriangle,
  Clock,
  ExternalLink,
  FolderOpen,
  MapPin,
  Plus,
  Route,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RouteAddressInput } from "../components/routes/RouteAddressInput.jsx";
import {
  deleteRoutePlan,
  listRoutePlans,
  saveRoutePlan,
} from "../services/routePlanService.js";
import { optimizePlannedRoute } from "../services/routeOptimizationService.js";
import { queueRouteOptionSms } from "../services/routeOptionSmsService.js";
import { useTranslation } from "../i18n/index.js";

const MAX_CUSTOMER_STOPS = 11;
const FIRST_SUGGESTED_SLOT = "10:00";
const CUSTOMER_SLOT_GAP_MINUTES = 60;
const SECOND_OPTION_OFFSET_MINUTES = 30;

export function OptimizeRoutePage() {
  const { t, language } = useTranslation();
  const [startPoint, setStartPoint] = useState(
    createStartPoint()
  );
  const [stops, setStops] = useState([createStop()]);
  const [routeName, setRouteName] = useState("");
  const [visitDate, setVisitDate] = useState(getTomorrowDateKey());
  const [smsState, setSmsState] = useState({});

  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeResult, setRouteResult] = useState(null);

  const [savedRoutes, setSavedRoutes] = useState([]);
  const [savedRoutesLoading, setSavedRoutesLoading] =
    useState(true);
  const [savedRoutesError, setSavedRoutesError] =
    useState("");

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    loadSavedRoutes();
  }, []);

  const invalidStops = useMemo(
    () => stops.filter((stop) => !hasValidLocation(stop)),
    [stops]
  );

  const canOptimize =
    hasValidLocation(startPoint) &&
    stops.length >= 1 &&
    invalidStops.length === 0 &&
    !routeLoading;

  async function loadSavedRoutes() {
    setSavedRoutesLoading(true);
    setSavedRoutesError("");

    try {
      const plans = await listRoutePlans();
      setSavedRoutes(plans);
    } catch (error) {
      setSavedRoutesError(
        error.message || t("optimizeRoute.loadSavedError")
      );
    } finally {
      setSavedRoutesLoading(false);
    }
  }

  function updateStartPoint(nextStartPoint) {
    setStartPoint({
      ...nextStartPoint,
      full_name: "Starting point",
      is_route_start: true,
    });

    clearRouteResult();
  }

  function updateStop(stopId, updates) {
    setStops((currentStops) =>
      currentStops.map((stop) =>
        stop.id === stopId
          ? {
              ...stop,
              ...updates,
            }
          : stop
      )
    );

    clearRouteResult();
  }

  function addStop() {
    if (stops.length >= MAX_CUSTOMER_STOPS) {
      setRouteError(
        t("optimizeRoute.addUpTo", { count: MAX_CUSTOMER_STOPS })
      );
      return;
    }

    setStops((currentStops) => [
      ...currentStops,
      createStop(),
    ]);

    clearRouteResult();
  }

  function removeStop(stopId) {
    setStops((currentStops) => {
      const remainingStops = currentStops.filter(
        (stop) => stop.id !== stopId
      );

      return remainingStops.length
        ? remainingStops
        : [createStop()];
    });

    clearRouteResult();
  }

  function clearRouteResult() {
    setRouteResult(null);
    setRouteError("");
    setSaveMessage("");
    setSmsState({});
  }

  async function handleOptimizeRoute() {
    setRouteLoading(true);
    setRouteError("");
    setRouteResult(null);
    setSaveMessage("");

    try {
      if (!hasValidLocation(startPoint)) {
        throw new Error(
          t("optimizeRoute.selectStartingSuggestion")
        );
      }

      if (!stops.length) {
        throw new Error(
          t("optimizeRoute.addAtLeastOne")
        );
      }

      if (invalidStops.length) {
        throw new Error(
          t("optimizeRoute.selectEveryCustomerSuggestion")
        );
      }

      const result = await optimizePlannedRoute({
        startPoint,
        stops,
      });

      setRouteResult(result);
    } catch (error) {
      setRouteError(
        error.message || t("optimizeRoute.unableOptimize")
      );
    } finally {
      setRouteLoading(false);
    }
  }

  async function handleSaveRoute() {
    if (!routeResult?.customers?.length) {
      setRouteError(
        t("optimizeRoute.optimizeFirst")
      );
      return;
    }

    if (!routeName.trim()) {
      setRouteError(
        t("optimizeRoute.enterRouteName")
      );
      return;
    }

    setSaving(true);
    setRouteError("");
    setSaveMessage("");

    try {
      const savedRoute = await saveRoutePlan({
        route_name: routeName,
        start_address: startPoint.address,
        start_latitude: startPoint.latitude,
        start_longitude: startPoint.longitude,
        input_stops: stops,
        optimized_stops: routeResult.customers,
        total_distance_meters:
          routeResult.totalDistanceMeters,
        total_duration_seconds:
          routeResult.totalDurationSeconds,
        google_maps_url:
          routeResult.googleMapsRouteUrl,
      });

      setSavedRoutes((currentRoutes) => [
        savedRoute,
        ...currentRoutes,
      ]);

      setSaveMessage(t("optimizeRoute.routeSaved"));
    } catch (error) {
      setRouteError(
        error.message || t("optimizeRoute.unableSave")
      );
    } finally {
      setSaving(false);
    }
  }

  function openSavedRoute(routePlan) {
    const savedInputStops = Array.isArray(
      routePlan.input_stops
    )
      ? routePlan.input_stops
      : [];

    const savedOptimizedStops = Array.isArray(
      routePlan.optimized_stops
    )
      ? routePlan.optimized_stops
      : [];

    setRouteName(routePlan.route_name || "");

    setStartPoint({
      id: "route-start",
      full_name: "Starting point",
      address: routePlan.start_address || "",
      latitude: routePlan.start_latitude,
      longitude: routePlan.start_longitude,
      is_route_start: true,
    });

    setStops(
      savedInputStops.length
        ? savedInputStops
        : [createStop()]
    );

    setRouteResult({
      customers: savedOptimizedStops,
      optimized: true,
      routeMode: "saved_route",
      totalDistanceMeters:
        routePlan.total_distance_meters,
      totalDurationSeconds:
        routePlan.total_duration_seconds,
      googleMapsRouteUrl:
        routePlan.google_maps_url || "",
    });

    setRouteError("");
    setSaveMessage(t("optimizeRoute.savedOpened"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteSavedRoute(routePlan) {
    const confirmed = window.confirm(
      t("optimizeRoute.deleteConfirm", { name: routePlan.route_name })
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(routePlan.id);
    setSavedRoutesError("");

    try {
      await deleteRoutePlan(routePlan.id);

      setSavedRoutes((currentRoutes) =>
        currentRoutes.filter(
          (route) => route.id !== routePlan.id
        )
      );
    } catch (error) {
      setSavedRoutesError(
        error.message || t("optimizeRoute.unableDelete")
      );
    } finally {
      setDeletingId("");
    }
  }


function getSmsStopForRouteOption(stop, customerIndex) {
  const originalStop =
    stops.find(
      (item) =>
        item.id &&
        stop.id &&
        String(item.id) === String(stop.id)
    ) ||
    stops.find(
      (item) =>
        normalizeCyprusPhone(item.phone) &&
        normalizeCyprusPhone(item.phone) ===
          normalizeCyprusPhone(stop.phone)
    ) ||
    stops.find(
      (item) =>
        String(item.full_name || "").trim().toLowerCase() ===
        String(stop.full_name || "").trim().toLowerCase()
    ) ||
    stops[customerIndex];

  return {
    ...stop,
    full_name:
      originalStop?.full_name || stop.full_name || "",
    phone:
      originalStop?.phone || stop.phone || "",
    address:
      stop.address || originalStop?.address || "",
    customer_title: normalizeCustomerTitle(
      originalStop?.customer_title || stop.customer_title
    ),
    sms_salutation_name:
      originalStop?.sms_salutation_name ||
      stop.sms_salutation_name ||
      "",
  };
}


  async function handleSendRouteOptionsSms(stop, customerIndex) {
    const smsKey = stop.id || `route-stop-${customerIndex + 1}`;
    const options = getSuggestedOptionsForCustomerIndex(customerIndex);
    const smsStop = getSmsStopForRouteOption(stop, customerIndex);
    
    setSmsState((current) => ({
      ...current,
      [smsKey]: { loading: true, message: "", error: "" },
    }));

    try {
      const result = await queueRouteOptionSms({
       stop: smsStop,
       visitDate,
       option1Time: options.option1,
       option2Time: options.option2,
     });

      setSmsState((current) => ({
        ...current,
        [smsKey]: {
          loading: false,
          queued: true,
          job: result.job || null,
          message: result.message || t("optimizeRoute.smsQueuedMessage"),
          error: "",
        },
      }));
    } catch (error) {
      setSmsState((current) => ({
        ...current,
        [smsKey]: {
          loading: false,
          message: "",
          error: error.message || t("optimizeRoute.smsQueueError"),
        },
      }));
    }
  }

  const displayedStops =
    routeResult?.customers || [];

  return (
    <section className="workspace-page optimize-route-page">
      <header className="workspace-header">
        <div>
          <p>{t("optimizeRoute.eyebrow")}</p>
          <h1>{t("optimizeRoute.title")}</h1>
        </div>
      </header>

      <section className="workspace-panel route-builder-panel">
        <div className="route-summary-header">
          <h2><span className="route-step-badge">1</span>{t("optimizeRoute.startingPoint")}</h2>
          <p>
            {t("optimizeRoute.chooseStart")}
          </p>
        </div>

        <label className="route-builder-field">
          <span>
            <MapPin size={17} />
            {t("optimizeRoute.startingAddress")}
          </span>

          <RouteAddressInput
            value={startPoint}
            onChange={updateStartPoint}
            placeholder={t("optimizeRoute.searchStartingAddress")}
          />
        </label>

        {startPoint.address &&
        !hasValidLocation(startPoint) ? (
          <p className="route-inline-warning">
            {t("optimizeRoute.selectStartingSuggestion")}
          </p>
        ) : null}
      </section>

      <section className="workspace-panel route-builder-panel">
        <div className="route-summary-header">
          <h2>
            <span className="route-step-badge">2</span>
            {t("optimizeRoute.visitDateTitle")}
            </h2>
          <p>{t("optimizeRoute.visitDateDescription")}</p>
        </div>

        <label className="route-builder-field">
          <span>
            <Clock size={17} />
            {t("optimizeRoute.visitDate")}
          </span>
          <input
            type="date"
            value={visitDate}
            onChange={(event) => {
              setVisitDate(event.target.value);
              setSmsState({});
            }}
          />
        </label>
      </section>

      <section className="workspace-panel route-builder-panel">
        <div className="route-summary-header">
          <h2><span className="route-step-badge">3</span>{t("optimizeRoute.customerAddresses")}</h2>
           <p>{t("optimizeRoute.addCustomers")}</p>
        
        </div>

        <div className="route-builder-stops">
          {stops.map((stop, index) => (
            <article
              className="route-builder-stop"
              key={stop.id}
            >
              <div className="route-builder-stop-header">
                <strong>{t("optimizeRoute.customer", { number: index + 1 })}</strong>

                <button
                  className="icon-button"
                  type="button"
                  onClick={() => removeStop(stop.id)}
                  aria-label={t("optimizeRoute.removeCustomer", { number: index + 1 })}
                >
                  <Trash2 size={17} />
                </button>
              </div>

              <label className="route-builder-field">
                {t("optimizeRoute.customerTitle")}
                <select
                value={stop.customer_title || "mr"}
                onChange={(event) =>
                  updateStop(stop.id, {
                    customer_title: event.target.value,
              
                  })
               }
               >
               <option value="mr">{t("optimizeRoute.titleMr")}</option>
               <option value="ms">{t("optimizeRoute.titleMs")}</option>
               </select>
              </label>
              
              <label className="route-builder-field">
                {t("optimizeRoute.customerName")}
                <input
                  value={stop.full_name}
                  onChange={(event) =>
                    updateStop(stop.id, {
                      full_name: event.target.value,
                    })
                  }
                  placeholder={t("optimizeRoute.customer", { number: index + 1 })}
                />
              </label>

                <label className="route-builder-field">
  {t("optimizeRoute.smsSalutation")}
  <input
    value={stop.sms_salutation_name || ""}
    onChange={(event) =>
      updateStop(stop.id, {
        sms_salutation_name: event.target.value,
      })
    }
    placeholder={t("optimizeRoute.smsSalutationPlaceholder")}
  />
  <small className="muted-copy">
    {t("optimizeRoute.smsSalutationHelp")}
  </small>
</label>

              <label className="route-builder-field">
                {t("optimizeRoute.customerPhone")}
                <input
                  value={stop.phone || ""}
                  onChange={(event) =>
                    updateStop(stop.id, {
                      phone: event.target.value,
                    })
                  }
                  placeholder=""
                />
              </label>

              <label className="route-builder-field">
                {t("optimizeRoute.address")}

                <RouteAddressInput
                  value={stop}
                  onChange={(nextStop) =>
                    updateStop(stop.id, nextStop)
                  }
                  placeholder={t("optimizeRoute.searchCustomerAddress")}
                />
              </label>

              {stop.address &&
              !hasValidLocation(stop) ? (
                <p className="route-inline-warning">
                  {t("optimizeRoute.selectThisAddress")}
                </p>
              ) : null}
            </article>
          ))}
        </div>

        <button
          className="button button-light route-add-stop"
          type="button"
          onClick={addStop}
          disabled={
            stops.length >= MAX_CUSTOMER_STOPS
          }
        >
          <Plus size={18} />
          {t("optimizeRoute.addCustomerAddress")}
        </button>
      </section>

      {routeError ? (
        <p className="route-message route-message-warning">
          <AlertTriangle size={17} />
          {routeError}
        </p>
      ) : null}

      <button
        className="button button-primary route-main-optimize"
        type="button"
        onClick={handleOptimizeRoute}
        disabled={!canOptimize}
      >
        <Route size={19} />
        {routeLoading
          ? t("optimizeRoute.optimizing")
          : t("optimizeRoute.optimize")}
      </button>

      {routeResult ? (
        <section className="workspace-panel route-summary">
          <div className="route-summary-header">
            <h2><span className="route-step-badge">4</span>{t("optimizeRoute.optimizedRoute")}</h2>
            <p>
              {t("optimizeRoute.optimizedDescription")}
            </p>
          </div>

          <div className="route-metrics">
            <Metric
              label={t("optimizeRoute.totalDistance")}
              value={formatDistance(routeResult.totalDistanceMeters, t)}
            />

            <Metric
              label={t("optimizeRoute.drivingTime")}
              value={formatDuration(routeResult.totalDurationSeconds, t)}
            />

            <Metric
              label={t("optimizeRoute.customerStops")}
              value={String(
                Math.max(displayedStops.length - 1, 0)
              )}
            />
          </div>

          <ol className="route-summary-list">
            {displayedStops.map((stop, index) => {
              const isStart = index === 0 || stop.is_route_start;
              const customerIndex = Math.max(index - 1, 0);
              const options = getSuggestedOptionsForCustomerIndex(customerIndex);
              const smsKey = stop.id || `route-stop-${customerIndex + 1}`;
              const currentSmsState = smsState[smsKey] || {};
              const hasPhone = Boolean(normalizeCyprusPhone(stop.phone));

              return (
                <li
                  className="route-summary-item"
                  key={stop.id || index}
                >
                  <span className="route-summary-number">
                    {index + 1}
                  </span>

                  <div>
                    <h3>
                      {isStart
                        ? t("optimizeRoute.startingPoint")
                        : stop.full_name ||
                          t("optimizeRoute.customer", { number: index })}
                    </h3>

                    <p>{stop.address}</p>

                    {!isStart ? (
                      <div className="route-sms-options">
                        <small>
                          {t("optimizeRoute.suggestedTimesPrefix", {
                            date: formatDateForDisplay(visitDate, language),
                          })}{" "}
                          <strong>1) {options.option1}</strong>{" "}
                          {t("optimizeRoute.or")}{" "}
                          <strong>2) {options.option2}</strong>
                        </small>

                        <small>
                          {t("optimizeRoute.phoneDisplay", {
                            phone: stop.phone || t("optimizeRoute.noPhone"),
                          })}
                        </small>

                        <button
                          className="button button-light route-send-options-button"
                          type="button"
                          onClick={() =>
                            handleSendRouteOptionsSms(stop, customerIndex)
                          }
                          disabled={
                            currentSmsState.loading ||
                            currentSmsState.queued ||
                            !hasPhone ||
                            !visitDate
                          }
                        >
                          <Send size={16} />
                          {currentSmsState.loading
                            ? t("optimizeRoute.queueingSms")
                            : currentSmsState.queued
                              ? t("optimizeRoute.smsQueued")
                              : t("optimizeRoute.sendOptionsSms")}
                        </button>

                        {!hasPhone ? (
                          <small className="route-inline-warning">
                            {t("optimizeRoute.phoneRequiredForSms")}
                          </small>
                        ) : null}

                        {currentSmsState.message ? (
                          <small className="form-success">
                            {currentSmsState.message}
                          </small>
                        ) : null}

                        {currentSmsState.error ? (
                          <small className="form-error">
                            {currentSmsState.error}
                          </small>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="route-open-actions">
            {routeResult.googleMapsRouteUrl ? (
              <a
                className="button button-primary"
                href={routeResult.googleMapsRouteUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={18} />
                {t("optimizeRoute.openGoogleMaps")}
              </a>
            ) : null}
          </div>

          <div className="route-save-panel">
            <label className="route-builder-field">
              {t("optimizeRoute.routeName")}
              <input
                value={routeName}
                onChange={(event) => {
                  setRouteName(event.target.value);
                  setSaveMessage("");
                }}
                placeholder={t("optimizeRoute.routeNameExample")}
              />
            </label>

            <button
              className="button button-primary"
              type="button"
              onClick={handleSaveRoute}
              disabled={saving}
            >
              <Save size={18} />
              {saving ? t("common.saving") : t("optimizeRoute.saveRoute")}
            </button>
          </div>

          {saveMessage ? (
            <p className="form-success">
              {saveMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="workspace-panel saved-routes-panel">
        <div className="route-summary-header">
          <h2>{t("optimizeRoute.savedRoutes")}</h2>
          <p>{t("optimizeRoute.savedDescription")}</p>
        </div>

        {savedRoutesError ? (
          <p className="form-error">
            {savedRoutesError}
          </p>
        ) : null}

        {savedRoutesLoading ? (
          <p className="muted-copy">
            {t("optimizeRoute.loadingSaved")}
          </p>
        ) : null}

        {!savedRoutesLoading &&
        !savedRoutes.length ? (
          <p className="muted-copy">
            {t("optimizeRoute.noSaved")}
          </p>
        ) : null}

        {savedRoutes.length ? (
          <div className="saved-routes-list">
            {savedRoutes.map((routePlan) => (
              <article
                className="saved-route-card"
                key={routePlan.id}
              >
                <div>
                  <strong>
                    {routePlan.route_name}
                  </strong>

                  <span>
                    {routePlan.start_address}
                  </span>

                  <small>
                    {formatSavedRouteDetails(routePlan, t, language)}
                  </small>
                </div>

                <div className="saved-route-actions">
                  <button
                    className="button button-light"
                    type="button"
                    onClick={() =>
                      openSavedRoute(routePlan)
                    }
                  >
                    <FolderOpen size={17} />
                    {t("optimizeRoute.open")}
                  </button>

                  <button
                    className="icon-button"
                    type="button"
                    onClick={() =>
                      handleDeleteSavedRoute(routePlan)
                    }
                    disabled={
                      deletingId === routePlan.id
                    }
                    aria-label={t("optimizeRoute.deleteRoute", { name: routePlan.route_name })}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="route-metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function createStartPoint() {
  return {
    id: "route-start",
    full_name: "Starting point",
    address: "",
    latitude: "",
    longitude: "",
    is_route_start: true,
  };
}

function createStop() {
  return {
    id: crypto.randomUUID(),
    full_name: "",
    customer_title: "mr",
    sms_salutation_name: "",
    address: "",
    latitude: "",
    longitude: "",
    status: "Scheduled",
    phone: "",
  };
}

function hasValidLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);

  return (
    String(location?.address || "").trim() &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 34.4 &&
    latitude <= 35.8 &&
    longitude >= 32 &&
    longitude <= 34.8
  );
}

function formatDistance(meters, t = () => "Not available") {
  const numericMeters = Number(meters);

  if (!Number.isFinite(numericMeters)) {
    return t("app.notAvailable");
  }

  if (numericMeters < 1000) {
    return `${Math.round(numericMeters)} m`;
  }

  return `${(numericMeters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds, t = () => "Not available") {
  const numericSeconds = Number(seconds);

  if (!Number.isFinite(numericSeconds)) {
    return t("app.notAvailable");
  }

  const minutes = Math.round(numericSeconds / 60);

  if (minutes < 60) {
    return t("optimizeRoute.minutes", { count: minutes });
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes
    ? t("optimizeRoute.hoursMinutes", {
        hours,
        minutes: remainingMinutes,
      })
    : t("optimizeRoute.hours", { count: hours });
}

function getSuggestedOptionsForCustomerIndex(customerIndex) {
  const firstSlotMinutes = timeToMinutes(FIRST_SUGGESTED_SLOT);
  const option1Minutes =
    firstSlotMinutes + customerIndex * CUSTOMER_SLOT_GAP_MINUTES;

  return {
    option1: minutesToTime(option1Minutes),
    option2: minutesToTime(
      option1Minutes + SECOND_OPTION_OFFSET_MINUTES
    ),
  };
}

function timeToMinutes(value) {
  const [hours = "0", minutes = "0"] = String(value).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function minutesToTime(totalMinutes) {
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getTomorrowDateKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toDateInputValue(date);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(value, language = "el") {
  if (!value) {
    return language === "en" ? "the selected day" : "την επιλεγμένη ημέρα";
  }

  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString(
      language === "en" ? "en-CY" : "el-CY"
    );
  } catch {
    return value;
  }
}

function normalizeCyprusPhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");

  if (digits.startsWith("00357") && digits.length === 13) {
    return `+357${digits.slice(5)}`;
  }

  if (digits.startsWith("357") && digits.length === 11) {
    return `+${digits}`;
  }

  if (digits.length === 8) {
    return `+357${digits}`;
  }

  return "";
}

function normalizeCustomerTitle(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "ms" ||
    normalized === "mrs" ||
    normalized === "miss" ||
    normalized === "female" ||
    normalized === "woman"
  ) {
    return "ms";
  }

  return "mr";
}

function formatSavedRouteDetails(routePlan, t = () => "Not available", language = "el") {
  const optimizedStops = Array.isArray(
    routePlan.optimized_stops
  )
    ? routePlan.optimized_stops
    : [];

  const customerCount = Math.max(
    optimizedStops.length - 1,
    0
  );

  const createdDate = routePlan.created_at
    ? new Date(routePlan.created_at).toLocaleDateString(
        language === "en" ? "en-CY" : "el-CY"
      )
    : "";

  return [
    t("optimizeRoute.customerStopsCount", { count: customerCount }),
    formatDistance(routePlan.total_distance_meters, t),
    createdDate,
  ]
    .filter(Boolean)
    .join(" · ");
}
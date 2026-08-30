import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  CloudSun,
  MapPin,
  NotebookPen,
  Route,
  Save,
  Trash2,
  Pencil,
  UserRound,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "../i18n/index.js";
import { useCustomers } from "../hooks/useCustomers.js";
import { CustomerCard } from "../components/customers/CustomerCard.jsx";
import {
  createDailyNote,
  deleteDailyNote,
  listDailyNotes,
  updateDailyNoteCompleted,
  updateDailyNoteContent,
} from "../services/dailyNotesService.js";

const FALLBACK_WEATHER_LOCATION = {
  latitude: 34.7071,
  longitude: 33.0226,
  source: "fallback",
};

export function DailySummaryPage() {
  const { t, locale } = useTranslation();
  const { customers, loading, error } = useCustomers();

  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState("");

  const [dailyNote, setDailyNote] = useState("");
  const [savedDailyNotes, setSavedDailyNotes] = useState([]);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const todayLabel = format(new Date(), "EEEE d MMMM yyyy", { locale });

  const todaysAppointments = useMemo(() => {
    return customers
      .filter((customer) => customer.appointment_date === todayKey)
      .filter((customer) => !isCancelledAppointment(customer))
      .sort((a, b) =>
        String(a.appointment_time || "").localeCompare(
          String(b.appointment_time || "")
        )
      );
  }, [customers, todayKey]);

  const nextAppointment = useMemo(() => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    return todaysAppointments.find((appointment) => {
      const appointmentMinutes = getMinutesFromTime(
        appointment.appointment_time
      );

      return appointmentMinutes >= nowMinutes;
    });
  }, [todaysAppointments]);

  const weatherLocation = useMemo(() => {
    if (hasValidCoordinates(nextAppointment)) {
      return {
        label: getWeatherLocationLabel(nextAppointment, t),
        latitude: Number(nextAppointment.latitude),
        longitude: Number(nextAppointment.longitude),
        source: "appointment",
      };
    }

    return {
      ...FALLBACK_WEATHER_LOCATION,
      label: t("dailySummary.fallbackLocation"),
    };
  }, [nextAppointment, t]);

  useEffect(() => {
    let ignore = false;

    async function loadDailyNotes() {
      setNoteLoading(true);
      setNoteMessage("");

      try {
        const notes = await listDailyNotes(todayKey);

        if (!ignore) {
          setSavedDailyNotes(notes);
        }
      } catch (error) {
        if (!ignore) {
          setNoteMessage(error.message || t("dailySummary.notesLoadError"));
        }
      } finally {
        if (!ignore) {
          setNoteLoading(false);
        }
      }
    }

    loadDailyNotes();

    return () => {
      ignore = true;
    };
  }, [todayKey, t]);

  useEffect(() => {
    let ignore = false;

    async function loadWeather() {
      setWeather(null);
      setWeatherError("");

      try {
        const response = await fetch(buildWeatherUrl(weatherLocation));

        if (!response.ok) {
          throw new Error("Weather request failed");
        }

        const data = await response.json();

        if (!ignore) {
          setWeather(data.current || null);
        }
      } catch {
        if (!ignore) {
          setWeatherError(t("dailySummary.weatherLoadError"));
        }
      }
    }

    loadWeather();

    return () => {
      ignore = true;
    };
  }, [weatherLocation, t]);

  async function handleSaveDailyNote() {
    const cleanNote = dailyNote.trim();

    if (!cleanNote) {
      setNoteMessage(t("dailySummary.writeNoteFirst"));
      return;
    }

    setNoteSaving(true);
    setNoteMessage("");

    try {
      if (editingNoteId) {
        const updatedNote = await updateDailyNoteContent(editingNoteId, cleanNote);

        setSavedDailyNotes((currentNotes) =>
          currentNotes.map((note) =>
            note.id === updatedNote.id ? updatedNote : note
          )
        );

        setEditingNoteId(null);
        setDailyNote("");
        setNoteMessage(t("dailySummary.noteUpdated"));
        return;
      }

      const newNote = await createDailyNote(todayKey, cleanNote);

      setSavedDailyNotes((currentNotes) => [...currentNotes, newNote]);
      setDailyNote("");
      setNoteMessage(t("dailySummary.noteSaved"));
    } catch (error) {
      setNoteMessage(error.message || t("dailySummary.noteSaveError"));
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleToggleDailyNote(note) {
    setNoteMessage("");

    try {
      const updatedNote = await updateDailyNoteCompleted(
        note.id,
        !note.is_completed
      );

      setSavedDailyNotes((currentNotes) =>
        currentNotes.map((currentNote) =>
          currentNote.id === updatedNote.id ? updatedNote : currentNote
        )
      );
    } catch (error) {
      setNoteMessage(error.message || t("dailySummary.noteUpdateError"));
    }
  }

  async function handleDeleteDailyNote(noteId) {
    setNoteMessage("");

    try {
      await deleteDailyNote(noteId);

      setSavedDailyNotes((currentNotes) =>
        currentNotes.filter((note) => note.id !== noteId)
      );

      setNoteMessage(t("dailySummary.noteDeleted"));
    } catch (error) {
      setNoteMessage(error.message || t("dailySummary.noteDeleteError"));
    }
  }

  function handleEditDailyNote(note) {
    setEditingNoteId(note.id);
    setDailyNote(note.content || "");
    setNoteMessage(t("dailySummary.editingNote"));
  }

  function handleCancelEditDailyNote() {
    setEditingNoteId(null);
    setDailyNote("");
    setNoteMessage("");
  }

  if (loading) {
    return <div className="page-loader">{t("dailySummary.loading")}</div>;
  }

  if (error) {
    return <p className="form-error">{error}</p>;
  }

  return (
    <main className="daily-summary-page">
      <style>{dailySummaryStyles}</style>

      <section className="daily-summary-hero">
        <div>
          <p>{t("dailySummary.title")}</p>
          <h1>{capitalize(todayLabel)}</h1>
          <span>
            {todaysAppointments.length === 1
              ? t("dailySummary.oneAppointmentToday")
              : t("dailySummary.manyAppointmentsToday", {
                  count: todaysAppointments.length,
                })}
          </span>
        </div>

        <div className="daily-summary-hero-icon">
          <CalendarDays size={30} />
        </div>
      </section>

      <section className="daily-summary-grid">
        <article className="daily-summary-card is-next">
          <div className="daily-summary-card-title">
            <Route size={20} />
            <h2>{t("dailySummary.nextAppointment")}</h2>
          </div>

          {nextAppointment ? (
            <button
              className="next-appointment-summary"
              type="button"
              onClick={() => setSelectedAppointment(nextAppointment)}
            >
              <strong>{formatTime(nextAppointment.appointment_time)}</strong>
              <h3>{nextAppointment.full_name || t("app.noName")}</h3>
              <p>
                <MapPin size={16} />
                {nextAppointment.address || t("app.noAddress")}
              </p>
            </button>
          ) : (
            <p className="daily-summary-muted">
              {t("dailySummary.noNextAppointment")}
            </p>
          )}
        </article>

        <article className="daily-summary-card">
          <div className="daily-summary-card-title">
            <CloudSun size={20} />
            <h2>{t("dailySummary.nextAppointmentWeather")}</h2>
          </div>

          <div className="weather-location-label">
            <MapPin size={15} />
            <span>{weatherLocation.label}</span>
          </div>

          {weather ? (
            <div className="weather-summary">
              <strong>{Math.round(weather.temperature_2m)}°C</strong>
              <span>{describeWeather(weather.weather_code, t)}</span>
              <small>
                {t("dailySummary.wind", {
                  speed: Math.round(weather.wind_speed_10m),
                })}
              </small>

              <p className="weather-advice">
                {getWeatherAdvice(weather, t)}
              </p>

              {weatherLocation.source === "fallback" ? (
                <em className="weather-fallback-note">
                  {t("dailySummary.fallbackWeatherNote")}
                </em>
              ) : null}
            </div>
          ) : (
            <p className="daily-summary-muted">
              {weatherError || t("dailySummary.loadingWeather")}
            </p>
          )}
        </article>
      </section>

      <section className="daily-summary-card">
        <div className="daily-summary-card-title">
          <UserRound size={20} />
          <h2>{t("dailySummary.todayAppointments")}</h2>
        </div>

        {todaysAppointments.length ? (
          <div className="daily-appointment-list">
            {todaysAppointments.map((appointment) => (
              <button
                className="daily-appointment-row"
                type="button"
                key={appointment.id}
                onClick={() => setSelectedAppointment(appointment)}
              >
                <strong>{formatTime(appointment.appointment_time)}</strong>

                <span>
                  <b>{appointment.full_name || t("app.noName")}</b>
                  <small>{appointment.address || t("app.noAddress")}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="daily-summary-muted">
            {t("dailySummary.noAppointmentsToday")}
          </p>
        )}
      </section>

      <section className="daily-summary-card">
        <div className="daily-summary-card-title">
          <NotebookPen size={20} />
          <h2>{t("dailySummary.notes")}</h2>
        </div>

        <textarea
          className="daily-note-textarea"
          value={dailyNote}
          onChange={(event) => setDailyNote(event.target.value)}
          placeholder={
            noteLoading
              ? t("dailySummary.loadingNotes")
              : editingNoteId
                ? t("dailySummary.editNotePlaceholder")
                : t("dailySummary.newNotePlaceholder")
          }
          disabled={noteLoading}
        />

        <button
          className="daily-note-save-button"
          type="button"
          onClick={handleSaveDailyNote}
          disabled={noteSaving || noteLoading}
        >
          <Save size={18} />
          {noteSaving
            ? t("common.saving")
            : editingNoteId
              ? t("dailySummary.saveChanges")
              : t("dailySummary.addNote")}
        </button>

        {editingNoteId ? (
          <button
            className="daily-note-cancel-button"
            type="button"
            onClick={handleCancelEditDailyNote}
            disabled={noteSaving || noteLoading}
          >
            {t("dailySummary.cancelEdit")}
          </button>
        ) : null}

        {noteMessage ? (
          <p className="daily-note-message">{noteMessage}</p>
        ) : null}

        <div className="saved-daily-notes">
          {savedDailyNotes.length ? (
            savedDailyNotes.map((note) => (
              <article
                className={
                  "saved-daily-note" +
                  (note.is_completed ? " is-completed" : "")
                }
                key={note.id}
              >
                <button
                  className="saved-daily-note-check"
                  type="button"
                  onClick={() => handleToggleDailyNote(note)}
                  aria-label={
                    note.is_completed
                      ? t("dailySummary.markIncomplete")
                      : t("dailySummary.markCompleted")
                  }
                >
                  {note.is_completed ? (
                    <CheckCircle2 size={21} />
                  ) : (
                    <Circle size={21} />
                  )}
                </button>

                <p>{note.content}</p>

                <button
                  className="saved-daily-note-edit"
                  type="button"
                  onClick={() => handleEditDailyNote(note)}
                  aria-label={t("dailySummary.editNote")}
                >
                  <Pencil size={17} />
                </button>

                <button
                  className="saved-daily-note-delete"
                  type="button"
                  onClick={() => handleDeleteDailyNote(note.id)}
                  aria-label={t("dailySummary.deleteNote")}
                >
                  <Trash2 size={18} />
                </button>
              </article>
            ))
          ) : (
            <p className="daily-summary-muted">
              {t("dailySummary.noSavedNotes")}
            </p>
          )}
        </div>
      </section>

      {selectedAppointment ? (
        <div
          className="daily-summary-customer-modal"
          role="dialog"
          aria-modal="true"
          aria-label={
            selectedAppointment.full_name || t("dailySummary.customerDetails")
          }
        >
          <div className="daily-summary-customer-panel appointment-customer-card-panel">
            <button
              className="daily-summary-customer-close"
              type="button"
              onClick={() => setSelectedAppointment(null)}
              aria-label={t("common.close")}
            >
              <X size={20} />
            </button>

            <CustomerCard
              customer={selectedAppointment}
              afterDeletePath="/daily-summary"
              afterEditPath="/daily-summary"
              onDeleted={() => {
                setSelectedAppointment(null);
                window.location.reload();
              }}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function isCancelledAppointment(appointment) {
  const status = String(appointment?.status || "").trim().toLowerCase();

  return (
    status === "cancelled" ||
    status === "canceled" ||
    status === "cancelled appointment" ||
    status === "canceled appointment" ||
    status === "ακυρωμένο" ||
    status === "ακυρωμενο" ||
    status === "ακυρώθηκε" ||
    status === "ακυρωθηκε"
  );
}

function buildWeatherUrl(location) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");

  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,wind_speed_10m"
  );
  url.searchParams.set("timezone", "Asia/Nicosia");

  return url.toString();
}

function hasValidCoordinates(appointment) {
  const latitude = Number(appointment?.latitude);
  const longitude = Number(appointment?.longitude);

  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function getWeatherLocationLabel(appointment, t) {
  const addressParts = String(appointment?.address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (addressParts.length >= 2) {
    return addressParts[addressParts.length - 2];
  }

  if (addressParts.length === 1) {
    return addressParts[0];
  }

  return appointment?.full_name || t("dailySummary.nextAppointment");
}

function getWeatherAdvice(weather, t) {
  const code = Number(weather?.weather_code);
  const wind = Number(weather?.wind_speed_10m);
  const temperature = Number(weather?.temperature_2m);

  if ([95, 96, 99].includes(code)) {
    return t("dailySummary.adviceStorm");
  }

  if ([61, 63, 65, 80, 81, 82].includes(code)) {
    return t("dailySummary.adviceRain");
  }

  if (Number.isFinite(wind) && wind >= 28) {
    return t("dailySummary.adviceWind");
  }

  if (Number.isFinite(temperature) && temperature >= 36) {
    return t("dailySummary.adviceHeat");
  }

  if ([1, 2, 3].includes(code)) {
    return t("dailySummary.adviceClouds");
  }

  return t("dailySummary.adviceGood");
}

function getMinutesFromTime(value) {
  if (!value) return -1;

  const [hours, minutes] = String(value).split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return -1;
  }

  return hours * 60 + minutes;
}

function formatTime(value) {
  if (!value) return "--:--";
  return String(value).slice(0, 5);
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeWeather(code, t) {
  if ([0].includes(code)) return t("dailySummary.weatherClear");
  if ([1, 2, 3].includes(code)) return t("dailySummary.weatherCloudy");
  if ([45, 48].includes(code)) return t("dailySummary.weatherFog");
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    return t("dailySummary.weatherRain");
  }
  if ([95, 96, 99].includes(code)) return t("dailySummary.weatherStorm");

  return t("dailySummary.weatherCondition");
}

const dailySummaryStyles = `
.daily-summary-page {
  display: grid;
  gap: 16px;
  padding: 8px 0 28px;
}

.daily-summary-hero,
.daily-summary-card {
  border: 1px solid rgba(20, 46, 38, 0.1);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.08);
}

.daily-summary-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  background:
    radial-gradient(circle at top right, rgba(32, 201, 151, 0.18), transparent 18rem),
    #ffffff;
}

.daily-summary-hero p,
.daily-summary-hero h1 {
  margin: 0;
}

.daily-summary-hero p {
  color: var(--leaf);
  font-size: 0.82rem;
  font-weight: 900;
  text-transform: uppercase;
}

.daily-summary-hero h1 {
  margin-top: 4px;
  color: var(--canopy);
  font-size: clamp(1.35rem, 5vw, 2rem);
  letter-spacing: -0.03em;
}

.daily-summary-hero span {
  display: inline-flex;
  margin-top: 8px;
  color: var(--muted);
  font-weight: 850;
}

.daily-summary-hero-icon {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 20px;
  background: rgba(32, 201, 151, 0.12);
  color: var(--canopy);
}

.daily-summary-grid {
  display: grid;
  gap: 14px;
}

.daily-summary-card {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.daily-summary-card-title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.daily-summary-card-title svg {
  color: var(--leaf);
}

.daily-summary-card-title h2 {
  margin: 0;
  color: var(--canopy);
  font-size: 1rem;
}

.next-appointment-summary {
  display: grid;
  gap: 6px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.next-appointment-summary strong {
  width: max-content;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(32, 201, 151, 0.13);
  color: var(--canopy);
  font-weight: 950;
}

.next-appointment-summary h3 {
  margin: 0;
  color: var(--ink);
  font-size: 1.25rem;
}

.next-appointment-summary p {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-weight: 750;
}

.next-appointment-summary:hover h3,
.next-appointment-summary:hover p {
  color: var(--canopy);
}

.weather-location-label {
  width: max-content;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(32, 201, 151, 0.1);
  color: var(--canopy);
  font-size: 0.82rem;
  font-weight: 900;
}

.weather-location-label svg {
  flex: 0 0 auto;
}

.weather-summary {
  display: grid;
  gap: 5px;
}

.weather-summary strong {
  color: var(--canopy);
  font-size: 2rem;
  line-height: 1;
}

.weather-summary span,
.weather-summary small,
.daily-summary-muted {
  color: var(--muted);
  font-weight: 800;
}

.weather-advice {
  margin: 8px 0 0;
  padding: 10px 11px;
  border-radius: 14px;
  background: rgba(20, 46, 38, 0.06);
  color: var(--canopy);
  font-size: 0.86rem;
  font-weight: 850;
  line-height: 1.35;
}

.weather-fallback-note {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.76rem;
  font-style: normal;
  font-weight: 750;
  line-height: 1.35;
}

.daily-appointment-list {
  display: grid;
  gap: 9px;
}

.daily-appointment-row {
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 11px;
  border: 1px solid rgba(20, 46, 38, 0.09);
  border-radius: 16px;
  background: rgba(240, 245, 244, 0.6);
  color: var(--ink);
  text-align: left;
}

.daily-appointment-row strong {
  color: var(--canopy);
  font-size: 0.88rem;
  font-weight: 950;
}

.daily-appointment-row span {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.daily-appointment-row b,
.daily-appointment-row small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.daily-appointment-row b {
  color: var(--ink);
}

.daily-appointment-row small {
  color: var(--muted);
  font-weight: 750;
}
.daily-appointment-row:hover {
  transform: translateY(-1px);
  border-color: rgba(32, 201, 151, 0.28);
  background: rgba(32, 201, 151, 0.08);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.daily-summary-customer-modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(8px);
}

.daily-summary-customer-panel {
  position: relative;
  width: min(980px, 100%);
  max-height: min(88vh, 840px);
  overflow: auto;
  border-radius: 24px;
  background: #ffffff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.26);
}

.daily-summary-customer-close {
  position: sticky;
  top: 12px;
  z-index: 2;
  float: right;
  width: 40px;
  height: 40px;
  margin: 12px 12px -52px auto;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: rgba(254, 226, 226, 0.96);
  color: #b91c1c;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.daily-summary-customer-close:hover {
  background: #fecaca;
}


.daily-note-textarea {
  width: 100%;
  min-height: 118px;
  border: 1px solid rgba(20, 46, 38, 0.12);
  border-radius: 18px;
  background: rgba(248, 251, 250, 0.92);
  color: var(--ink);
  padding: 14px 15px;
  font-size: 0.98rem;
  font-weight: 650;
  line-height: 1.45;
  resize: none;
  outline: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
}

.daily-note-textarea:focus {
  border-color: rgba(19, 130, 101, 0.35);
  box-shadow:
    0 0 0 4px rgba(32, 201, 151, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
}

.daily-note-save-button {
  min-height: 42px;
  width: max-content;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 14px;
  background: var(--canopy);
  color: #ffffff;
  padding: 0 16px;
  font-size: 0.9rem;
  font-weight: 850;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(20, 46, 38, 0.18);
}

.daily-note-save-button svg {
  flex: 0 0 auto;
  width: 17px;
  height: 17px;
}

.daily-note-save-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  box-shadow: none;
}

.daily-note-cancel-button {
  min-height: 40px;
  width: max-content;
  max-width: 100%;
  border: 1px solid rgba(20, 46, 38, 0.14);
  border-radius: 14px;
  background: #ffffff;
  color: var(--canopy);
  padding: 0 14px;
  font-size: 0.86rem;
  font-weight: 850;
  cursor: pointer;
}

.daily-note-cancel-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.daily-note-message {
  width: max-content;
  max-width: 100%;
  margin: -2px 0 0;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(32, 201, 151, 0.1);
  color: var(--canopy);
  font-size: 0.78rem;
  font-weight: 850;
}

.saved-daily-notes {
  display: grid;
  gap: 9px;
}

.saved-daily-note {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 34px 34px;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: 1px solid rgba(20, 46, 38, 0.1);
  border-radius: 16px;
  background: rgba(248, 251, 250, 0.92);
}

.saved-daily-note p {
  margin: 0;
  color: var(--ink);
  font-size: 0.92rem;
  font-weight: 750;
  line-height: 1.35;
  white-space: pre-wrap;
}

.saved-daily-note-check,
.saved-daily-note-edit,
.saved-daily-note-delete {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
}

.saved-daily-note-check {
  color: var(--leaf);
}

.saved-daily-note-edit {
  color: var(--canopy);
}

.saved-daily-note-delete {
  color: #b42318;
}

.saved-daily-note.is-completed {
  background: rgba(32, 201, 151, 0.08);
}

.saved-daily-note.is-completed p {
  color: var(--muted);
  text-decoration: line-through;
}

.saved-daily-notes {
  display: grid;
  gap: 9px;
}

.saved-daily-note {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 34px 34px;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: 1px solid rgba(20, 46, 38, 0.1);
  border-radius: 16px;
  background: rgba(248, 251, 250, 0.92);
}

.saved-daily-note p {
  margin: 0;
  color: var(--ink);
  font-size: 0.92rem;
  font-weight: 750;
  line-height: 1.35;
  white-space: pre-wrap;
}

.saved-daily-note-check,
.saved-daily-note-edit,
.saved-daily-note-delete {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
}

.saved-daily-note-check {
  color: var(--leaf);
}

.saved-daily-note-edit {
  color: var(--canopy);
}

.saved-daily-note-delete {
  color: #b42318;
}

.saved-daily-note.is-completed {
  background: rgba(32, 201, 151, 0.08);
}

.saved-daily-note.is-completed p {
  color: var(--muted);
  text-decoration: line-through;
}

@media (min-width: 820px) {
  .daily-summary-grid {
    grid-template-columns: 1.35fr 0.75fr;
  }
}

@media (max-width: 760px) {
  .daily-summary-page {
    padding: 0 0 24px;
  }

  .daily-summary-hero,
  .daily-summary-card {
    border-radius: 20px;
  }

  .daily-summary-hero {
    padding: 16px;
  }

  .daily-summary-hero-icon {
    width: 50px;
    height: 50px;
    border-radius: 17px;
  }

  .saved-daily-note {
    grid-template-columns: 32px minmax(0, 1fr) 32px 32px;
    padding: 9px;
  }

  .saved-daily-note-check,
  .saved-daily-note-delete {
    width: 32px;
    height: 32px;
  }

  .daily-summary-customer-modal {
    padding: 10px;
    align-items: start;
  }

  .daily-summary-customer-panel {
    max-height: calc(100vh - 20px);
    border-radius: 20px;
  }
}
`;
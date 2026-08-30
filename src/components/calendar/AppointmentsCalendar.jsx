import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths
} from "date-fns";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Menu,
  Plus,
  RotateCcw,
  Search,
  Send,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createCalendarEvent, deleteCalendarEvent, getCalendarEvents, updateCalendarEvent } from "../../services/calendarEventService.js";
import { CustomerCard } from "../customers/CustomerCard.jsx";
import { CalendarEventModal } from "./CalendarEventModal.jsx";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useTranslation } from "../../i18n/index.js";
import { updateCustomerStatus } from "../../services/customerService.js";
import { queueThankYouSms } from "../../services/thankYouSmsService.js";
import {
  approveNextArrivalAfterCompletion,
  getNextScheduledCustomerAfter,
} from "../../services/arrivalAutomationService.js";
import { compareAppointmentDateTime } from "../../utils/date.js";
import { getFallbackHolidays } from "../../utils/holidayCalendar.js";

const HOLIDAY_NAMES_EN = {
  "Πρωτοχρονιά": "New Year's Day",
  "Θεοφάνια": "Epiphany",
  "Καθαρά Δευτέρα": "Clean Monday",
  "Εθνική Επέτειος 25ης Μαρτίου": "Greek Independence Day",
  "Εθνική Επέτειος 1ης Απριλίου": "Cyprus National Day",
  "Μεγάλη Παρασκευή": "Good Friday",
  "Κυριακή του Πάσχα": "Easter Sunday",
  "Δευτέρα του Πάσχα": "Easter Monday",
  "Εργατική Πρωτομαγιά": "Labour Day",
  "Κατακλυσμός – Δευτέρα του Αγίου Πνεύματος": "Whit Monday / Kataklysmos",
  "Κοίμηση της Θεοτόκου": "Assumption Day",
  "Ημέρα Ανεξαρτησίας της Κύπρου": "Cyprus Independence Day",
  "Εθνική Επέτειος 28ης Οκτωβρίου": "Ohi Day",
  "Χριστούγεννα": "Christmas Day",
  "Σύναξη της Υπεραγίας Θεοτόκου": "Boxing Day"
};

const VISIBLE_PER_DAY = 3;
const CALENDAR_VIEWS = new Set(["day", "week", "month"]);
const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 21;
const TIMELINE_HOUR_HEIGHT = 64;
const STATUS_FILTERS = new Set(["scheduled", "completed", "cancelled"]);
const DEFAULT_EVENT_COLOR = "#20c997";
const EVENT_TYPE_COLORS = {
  leave: "#22c55e",
  other: "#203fc9"
};

export function AppointmentsCalendar({ customers }) {
  const { language, locale: dateLocale, raw } = useTranslation();
  const text = raw("calendar");

  const navigate = useNavigate();
  const outletContext = useOutletContext();
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarEventsError, setCalendarEventsError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState(null);

  const [eventForm, setEventForm] = useState({
    title: "",
    event_type: "other",
    color: DEFAULT_EVENT_COLOR,
    start_date: "",
    end_date: "",
    notes: ""
  });

  const [eventFormState, setEventFormState] = useState({
    loading: false,
    deleting: false,
    error: ""
  });

  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [completeCandidate, setCompleteCandidate] = useState(null);
  const [actionState, setActionState] = useState({});
  const [completeOptions, setCompleteOptions] = useState({
    sendThankYou: true,
    approveArrival: false,
  });
  const [nextArrivalCustomer, setNextArrivalCustomer] = useState(null);
  const [nextArrivalLoading, setNextArrivalLoading] = useState(false);

  const statusFilter = normalizeStatusFilter(searchParams.get("status"));
  const currentView = parseViewParam(searchParams.get("view"));
  const activeDate = parseDateParam(searchParams.get("date"));
  const monthDate = parseMonthParam(searchParams.get("month"), activeDate);
  const monthKey = format(monthDate, "yyyy-MM");

  const holidays = useMemo(
    () => getFallbackHolidays("cyprus", monthDate.getFullYear()),
    [monthDate]
  );

  const holidaysByDate = useMemo(
    () =>
      holidays.reduce((groups, holiday) => {
        groups[holiday.date] = holiday;
        return groups;
      }, {}),
    [holidays]
  );

  const activeSearchQuery = searchQuery.trim().length >= 2 ? searchQuery : "";

  const filteredCustomers = useMemo(
    () => filterCustomers(customers, statusFilter, activeSearchQuery, text),
    [customers, activeSearchQuery, statusFilter, text]
  );

  const searchResults = useMemo(
    () =>
      searchQuery.trim().length >= 2
        ? [...filteredCustomers].sort(compareAppointmentDateTime)
        : [],
    [filteredCustomers, searchQuery]
  );

  const customersByDate = useMemo(
    () => groupCustomersByDate(filteredCustomers),
    [filteredCustomers]
  );

  const calendarDays = useMemo(
    () => buildCalendarDays(monthDate),
    [monthDate]
  );

  useEffect(() => {
    async function loadEvents() {
    try {
      setCalendarEventsError("");

      const firstVisibleDate = format(
        calendarDays[0],
        "yyyy-MM-dd"
      );

      const lastVisibleDate = format(
        calendarDays[calendarDays.length - 1],
        "yyyy-MM-dd"
      );

      const events = await getCalendarEvents(
        firstVisibleDate,
        lastVisibleDate
      );

      setCalendarEvents(events);
    } catch (error) {
      setCalendarEvents([]);

      setCalendarEventsError(error.message || text.eventsLoadError);
    }
  }

    if (calendarDays.length) {
      loadEvents();
    }
  }, [calendarDays]);

  const calendarEventsByDate = useMemo(
    () => groupCalendarEventsByDate(calendarEvents),
    [calendarEvents]
  );

useEffect(() => {
  if (!searchOpen) return;

  const focusTimer = window.setTimeout(() => {
    searchInputRef.current?.focus();
  }, 50);

  return () => window.clearTimeout(focusTimer);
}, [searchOpen]);

function openSearchPanel() {
  setSearchOpen(true);
}

function closeSearchPanel() {
  setSearchQuery("");
  setSearchOpen(false);
}

function openSearchResult(customer) {
  const appointmentDate = getValidAppointmentDate(customer.appointment_date);

  if (appointmentDate) {
    setCalendarState(parseISO(appointmentDate), "day");
  }

  setSelectedAppointment(customer);
}


  function setCalendarState(nextDate, nextView = currentView) {
    const dateKey = format(nextDate, "yyyy-MM-dd");
    const next = new URLSearchParams(searchParams);
    next.set("view", nextView);
    next.set("date", dateKey);
    next.set("month", format(nextDate, "yyyy-MM"));
    if (!statusFilter) next.delete("status");
    setSearchParams(next);
  }

  function setCalendarMonth(nextDate) {
    setCalendarState(nextDate, "month");
  }

  function goToday() {
    setCalendarState(new Date(), currentView);
    setMonthPickerOpen(false);
  }

  function goPrevious() {
    if (currentView === "day") {
      setCalendarState(subDays(activeDate, 1), "day");
      return;
    }

    if (currentView === "week") {
      setCalendarState(subDays(activeDate, 7), "week");
      return;
    }

    setCalendarState(subMonths(monthDate, 1), "month");
  }

  function goNext() {
    if (currentView === "day") {
      setCalendarState(addDays(activeDate, 1), "day");
      return;
    }

    if (currentView === "week") {
      setCalendarState(addDays(activeDate, 7), "week");
      return;
    }

    setCalendarState(addMonths(monthDate, 1), "month");
  }

  function updatePickerMonth(event) {
    setCalendarState(
      new Date(monthDate.getFullYear(), Number(event.target.value), 1),
      currentView
    );
  }

  function updatePickerYear(event) {
    setCalendarState(
      new Date(Number(event.target.value), monthDate.getMonth(), 1),
      currentView
    );
  }

  function switchCalendarView(nextView) {
    setCalendarState(activeDate, nextView);
    setMonthPickerOpen(false);
  }

  function openNewAppointment(date = activeDate, time = "") {
    const dateKey = format(date, "yyyy-MM-dd");
    const returnTo = buildCalendarReturnTo(date, statusFilter, currentView);
    const params = new URLSearchParams({
      date: dateKey,
      returnTo
    });

    if (time) {
      params.set("time", time);
    }

    navigate("/customers/new?" + params.toString());
  }

  function openDay(date) {
    setCalendarState(date, "day");
  }

  function openCreateEvent(date) {
    const dateKey = format(date, "yyyy-MM-dd");

    setSelectedCalendarEvent(null);
    setEventForm({
      title: "",
      event_type: "other",
      color: DEFAULT_EVENT_COLOR,
      start_date: dateKey,
      end_date: dateKey,
      notes: ""
    });
    setEventFormState({ loading: false, deleting: false, error: "" });
    setEventModalOpen(true);
  }

  function openEditEvent(event) {
    setSelectedDay(null);
    setSelectedCalendarEvent(event);
    setEventForm({
      title: event.title || "",
      event_type: normalizeCalendarEventType(event.event_type),
      color: event.color || getCalendarEventColor(event),
      start_date: event.start_date || "",
      end_date: event.end_date || event.start_date || "",
      notes: event.notes || ""
    });
    setEventFormState({ loading: false, deleting: false, error: "" });
    setEventModalOpen(true);
  }

  function closeCalendarEventModal() {
    setEventModalOpen(false);
    setSelectedCalendarEvent(null);
    setEventFormState({ loading: false, deleting: false, error: "" });
  }

  async function updateStatus(customer, status) {
    const actionKey = `${customer.id}:${status}`;
    setActionState((current) => ({
      ...current,
      [actionKey]: { loading: true, message: "", error: "" }
    }));

    try {
      await updateCustomerStatus(customer.id, status);
      window.location.reload();
    } catch (error) {
      setActionState((current) => ({
        ...current,
        [actionKey]: {
          loading: false,
          message: "",
          error: error.message || text.updateError
        }
      }));
    }
  }

  async function queueThankYou(customer) {
    const actionKey = `${customer.id}:thank-you`;
    setActionState((current) => ({
      ...current,
      [actionKey]: { loading: true, message: "", error: "" }
    }));

    try {
      const result = await queueThankYouSms(customer.id);

      setActionState((current) => ({
        ...current,
        [actionKey]: {
          loading: false,
          queued: true,
          duplicate: Boolean(result.duplicate),
          alreadySent: Boolean(result.alreadySent),
          message:
            result.message ||
            (result.duplicate ? text.alreadyQueued : text.queued),
          error: ""
        }
      }));

      return result;
    } catch (error) {
      setActionState((current) => ({
        ...current,
        [actionKey]: {
          loading: false,
          message: "",
          error: error.message || text.queueError
        }
      }));
      throw error;
    }
  }

  async function sendThankYouSms(customer) {
    await queueThankYou(customer).catch(() => null);
  }

  async function openCompleteConfirmation(customer) {
    setCompleteCandidate(customer);
    setSelectedAppointment(null);
    setCompleteOptions({ sendThankYou: true, approveArrival: false });
    setNextArrivalCustomer(null);
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

  function cancelCompleteConfirmation() {
    setSelectedAppointment(completeCandidate);
    setCompleteCandidate(null);
    setNextArrivalCustomer(null);
  }

  async function completeVisit(customer) {
    const actionKey = `${customer.id}:Completed`;
    setActionState((current) => ({
      ...current,
      [actionKey]: { loading: true, message: "", error: "" },
    }));

    try {
      const updatedCustomer = await updateCustomerStatus(customer.id, "Completed");
      const completedCustomer = { ...customer, ...updatedCustomer, status: "Completed" };
      const warnings = [];

      if (completeOptions.sendThankYou) {
        try {
          await queueThankYouSms(updatedCustomer.id || customer.id);
        } catch (smsError) {
          warnings.push(
            smsError.message ||
              "Η επίσκεψη ολοκληρώθηκε, αλλά δεν μπήκε το ευχαριστήριο SMS στην ουρά."
          );
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
              "Η επίσκεψη ολοκληρώθηκε, αλλά δεν ενεργοποιήθηκε το SMS άφιξης για τον επόμενο πελάτη."
          );
        }
      }

      if (warnings.length) {
        setActionState((current) => ({
          ...current,
          [actionKey]: {
            loading: false,
            message: text.visitCompleted,
            error: warnings.join(" "),
          },
        }));
        return;
      }

      setCompleteCandidate(null);
      setNextArrivalCustomer(null);
      window.location.reload();
    } catch (error) {
      setActionState((current) => ({
        ...current,
        [actionKey]: {
          loading: false,
          message: "",
          error: error.message || text.updateError,
        },
      }));
    }
  }

async function saveCalendarEvent(event) {
  event.preventDefault();

  setEventFormState({
    loading: true,
    deleting: false,
    error: ""
  });

  try {
    const savedEvent = selectedCalendarEvent
      ? await updateCalendarEvent(selectedCalendarEvent.id, eventForm)
      : await createCalendarEvent(eventForm);

    setCalendarEvents((current) => {
      const nextEvents = selectedCalendarEvent
        ? current.map((calendarEvent) =>
            calendarEvent.id === savedEvent.id ? savedEvent : calendarEvent
          )
        : [...current, savedEvent];

      return nextEvents.sort((a, b) =>
        a.start_date.localeCompare(b.start_date)
      );
    });

    closeCalendarEventModal();

    setEventForm({
      title: "",
      event_type: "other",
      color: DEFAULT_EVENT_COLOR,
      start_date: "",
      end_date: "",
      notes: ""
    });
  } catch (error) {
    setEventFormState({
      loading: false,
      deleting: false,
      error:
        error.message ||
        (selectedCalendarEvent ? text.eventUpdateError : text.eventCreateError)
    });
  }
}

async function handleDeleteCalendarEvent() {
  if (!selectedCalendarEvent) return;

  const confirmed = window.confirm(text.eventDeleteConfirm);
  if (!confirmed) return;

  setEventFormState({
    loading: false,
    deleting: true,
    error: ""
  });

  try {
    await deleteCalendarEvent(selectedCalendarEvent.id);
    setCalendarEvents((current) =>
      current.filter((event) => event.id !== selectedCalendarEvent.id)
    );
    closeCalendarEventModal();
  } catch (error) {
    setEventFormState({
      loading: false,
      deleting: false,
      error: error.message || text.eventDeleteError
    });
  }
}

  return (
    <section className={"appointments-page calendar-home calendar-system-page is-" + currentView} aria-label={text.calendar}>
      <header className="calendar-google-topbar calendar-system-topbar">
       <div className="calendar-topbar-left">
  <button
    className="calendar-menu-icon"
    type="button"
    onClick={outletContext?.openDrawer}
    aria-label={text.openMenu}
  >
    <Menu size={24} />
  </button>

  {currentView === "day" ? (
    <button
      className="calendar-return-month-button"
      type="button"
      onClick={() => setCalendarState(activeDate, "month")}
      aria-label="Πίσω στον μήνα"
    >
      <ChevronLeft size={17} />
      <span>Μήνας</span>
    </button>
  ) : (
    <button
      className="button button-light calendar-today-button"
      type="button"
      onClick={goToday}
    >
      {text.today}
    </button>
  )}

  <button
    className="calendar-round-button"
    type="button"
    onClick={goPrevious}
    aria-label={text.previousMonth}
  >
    <ChevronLeft size={21} />
  </button>

  <button
    className="calendar-round-button"
    type="button"
    onClick={goNext}
    aria-label={text.nextMonth}
  >
    <ChevronRight size={21} />
  </button>

  <button
    className="calendar-month-title"
    type="button"
    onClick={() => {
      if (currentView === "day") {
        setCalendarState(activeDate, "month");
        return;
      }

      setMonthPickerOpen((open) => !open);
    }}
    aria-expanded={monthPickerOpen}
    aria-controls="calendar-month-picker"
  >
    {currentView === "day"
  ? format(activeDate, "EEE d MMM", { locale: dateLocale })
  : format(monthDate, "MMM yyyy", { locale: dateLocale })}

    {currentView !== "day" ? <ChevronDown size={16} /> : null}
  </button>

  {monthPickerOpen && currentView !== "day" ? (
    <div className="calendar-month-picker" id="calendar-month-picker">
      <label>
        {text.month}
        <select value={monthDate.getMonth()} onChange={updatePickerMonth}>
          {Array.from({ length: 12 }, (_, monthIndex) => (
            <option key={monthIndex} value={monthIndex}>
              {format(new Date(2026, monthIndex, 1), "MMMM", { locale: dateLocale })}
            </option>
          ))}
        </select>
      </label>

      <label>
        {text.year}
        <select value={monthDate.getFullYear()} onChange={updatePickerYear}>
          {Array.from({ length: 9 }, (_, index) => monthDate.getFullYear() - 4 + index).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
    </div>
  ) : null}
</div>

        <div className="calendar-topbar-actions">
          <button
            className={
              "calendar-round-button" +
              (searchOpen ? " is-active" : "")
            }
            type="button"
            onClick={() => {
              if (searchOpen) {
                closeSearchPanel();
                return;
              }

              openSearchPanel();
            }}
            aria-label={text.searchAppointments}
            aria-expanded={searchOpen}
          >
            <Search size={20} />
          </button>

         <button
  className="calendar-add-button"
  type="button"
  onClick={() => openCreateEvent(activeDate)}
  aria-label="Νέο event"
>
  <Plus size={20} />
<span>Άδεια</span>
</button>


          <button
            className="calendar-add-button"
            type="button"
            onClick={() => openNewAppointment(activeDate)}
            aria-label={text.newAppointment}
          >
            <Plus size={20} />
            <span>{text.newAppointment}</span>
          </button>
        </div>
      </header>

      <div className="calendar-content-stack">
      {searchOpen ? (
        <section className="calendar-search-panel" aria-label="Αναζήτηση πελάτη">
          <div className="calendar-search-box">
            <Search size={18} />

            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Ψάξε πελάτη με όνομα, τηλέφωνο, διεύθυνση ή ώρα..."
            />

            {searchQuery.trim().length >= 2 ? (
              <span className="calendar-search-results-count">
                {searchResults.length} αποτελέσματα
              </span>
            ) : null}

            {searchQuery ? (
              <button
                className="calendar-search-clear"
                type="button"
                onClick={() => setSearchQuery("")}
              >
                Καθαρισμός
              </button>
            ) : null}

            <button
              className="calendar-search-close"
              type="button"
              onClick={closeSearchPanel}
              aria-label="Κλείσιμο αναζήτησης"
            >
              <X size={18} />
            </button>
          </div>

          {searchQuery.trim().length === 1 ? (
            <p className="calendar-search-empty">
              Γράψε τουλάχιστον 2 χαρακτήρες για αναζήτηση.
            </p>
          ) : null}

          {searchQuery.trim().length >= 2 ? (
            <div className="calendar-search-results-list">
              {searchResults.length ? (
                searchResults.slice(0, 20).map((customer) => (
                  <button
                    key={customer.id}
                    className={
                      "calendar-search-result is-" +
                      getAppointmentStatus(customer.status)
                    }
                    type="button"
                    onClick={() => openSearchResult(customer)}
                  >
                    <strong>{customer.full_name || text.appointment}</strong>
                    <span>
                      {formatAppointmentDateTime(customer, text, dateLocale)}
                    </span>
                    <small>
                      {[customer.phone, getAppointmentArea(customer, text)]
                        .filter(Boolean)
                        .join(" • ")}
                    </small>
                  </button>
                ))
              ) : (
                <p className="calendar-search-empty">
                  Δεν βρέθηκε πελάτης με αυτή την αναζήτηση.
                </p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {calendarEventsError ? <p className="form-warning calendar-events-warning">{calendarEventsError}</p> : null}

      {searchQuery.trim().length >= 2 ? null : (
      <div className="calendar-view-shell">
        {currentView === "day" ? <DayCalendarView date={activeDate} appointments={customersByDate[format(activeDate, "yyyy-MM-dd")] || []} events={calendarEventsByDate[format(activeDate, "yyyy-MM-dd")] || []} holiday={holidaysByDate[format(activeDate, "yyyy-MM-dd")]} text={text} language={language} dateLocale={dateLocale} onOpenAppointment={setSelectedAppointment} onNewAppointment={openNewAppointment} onOpenEvent={openEditEvent} /> : null}
        {currentView === "week" ? <WeekCalendarView date={activeDate} customersByDate={customersByDate} calendarEventsByDate={calendarEventsByDate} holidaysByDate={holidaysByDate} text={text} language={language} dateLocale={dateLocale} onOpenAppointment={setSelectedAppointment} onNewAppointment={openNewAppointment} onOpenDay={openDay} /> : null}
        {currentView === "month" ? <MonthCalendarView monthDate={monthDate} calendarDays={calendarDays} customersByDate={customersByDate} calendarEventsByDate={calendarEventsByDate} holidaysByDate={holidaysByDate} text={text} language={language} onOpenDay={openDay} onOpenAppointment={setSelectedAppointment} onOpenEvent={openEditEvent} /> : null}
      </div>
      )}
      </div>

{selectedAppointment ? (
  <div
    className="appointment-details-modal"
    role="dialog"
    aria-modal="true"
    aria-label={selectedAppointment.full_name || "Στοιχεία πελάτη"}
  >
    <div className="appointment-details-panel appointment-customer-card-panel">
      <button
        className="icon-button appointment-customer-card-close"
        type="button"
        onClick={() => setSelectedAppointment(null)}
        aria-label="Κλείσιμο"
      >
        <X size={20} />
      </button>

      <CustomerCard
  customer={selectedAppointment}
  afterDeletePath={
    "/appointments?view=" +
    currentView +
    "&date=" +
    format(activeDate, "yyyy-MM-dd") +
    "&month=" +
    format(monthDate, "yyyy-MM")
  }
  afterEditPath={
    "/appointments?view=" +
    currentView +
    "&date=" +
    format(activeDate, "yyyy-MM-dd") +
    "&month=" +
    format(monthDate, "yyyy-MM")
  }
  onDeleted={() => {
    setSelectedAppointment(null);
    window.location.reload();
  }}
/>
    </div>
  </div>
) : null}

      {completeCandidate ? (
        <CompleteVisitConfirmModal
          customer={completeCandidate}
          nextCustomer={nextArrivalCustomer}
          nextLoading={nextArrivalLoading}
          options={completeOptions}
          onOptionsChange={setCompleteOptions}
          text={text}
          loading={Boolean(actionState[completeCandidate.id + ":Completed"]?.loading)}
          error={actionState[completeCandidate.id + ":Completed"]?.error}
          onCancel={cancelCompleteConfirmation}
          onConfirm={() => completeVisit(completeCandidate)}
        />
      ) : null}
      {eventModalOpen ? <CalendarEventModal mode={selectedCalendarEvent ? "edit" : "create"} text={text} form={eventForm} formState={eventFormState} onChange={(field, value) => setEventForm((current) => ({ ...current, [field]: value, ...(field === "event_type" && !current.color ? { color: EVENT_TYPE_COLORS[value] || DEFAULT_EVENT_COLOR } : {}) }))} onClose={closeCalendarEventModal} onSubmit={saveCalendarEvent} onDelete={handleDeleteCalendarEvent} /> : null}
    </section>
  );
}


function CalendarViewSelector({ currentView, onChange }) {
  const options = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" }
  ];

  return (
    <div className="calendar-view-selector" aria-label="Calendar view">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={currentView === option.value ? "is-active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DayCalendarView({ date, appointments, events, holiday, text, language, dateLocale, onOpenAppointment, onNewAppointment, onOpenEvent }) {
  const scrollRef = useRef(null);
  const sortedAppointments = useMemo(() => [...appointments].sort(compareAppointmentDateTime), [appointments]);
  const dateKey = format(date, "yyyy-MM-dd");
  const isCurrentDay = isToday(date);
  const currentMinutes = getCurrentDayMinutes();

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const targetMinutes = isCurrentDay
      ? currentMinutes
      : getAppointmentMinutes(sortedAppointments[0]?.appointment_time) || TIMELINE_START_HOUR * 60;
    const targetTop = Math.max(0, minuteToTop(targetMinutes) - 120);
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [dateKey, isCurrentDay, currentMinutes, sortedAppointments]);

  return (
    <section className="calendar-day-view" aria-label="Day calendar view">
   
   <div className="calendar-day-header-row">
  <div className="calendar-day-heading">
    <div>
      <span>{format(date, "EEEE", { locale: dateLocale })}</span>
      <strong>{format(date, "d MMMM yyyy", { locale: dateLocale })}</strong>
    </div>

    {holiday ? <em>{getHolidayName(holiday.name, language)}</em> : null}
  </div>

  {events.length ? (
    <div className="calendar-day-events-inline">
      <CalendarEventStrip
        events={events}
        text={text}
        onOpenEvent={onOpenEvent}
        hideLabel
      />
    </div>
  ) : null}
</div>

    <div className="calendar-timeline-scroll" ref={scrollRef}>
  <DayTimelineList
    appointments={sortedAppointments}
    text={text}
    onOpenAppointment={onOpenAppointment}
    onNewAppointment={(time) => onNewAppointment(date, time)}
  />
</div>
    
    
  </section>
  );

}

function DayTimelineList({
  appointments,
  text,
  onOpenAppointment,
  onNewAppointment,
}) {
  const hours = buildTimelineHours();
  const appointmentsByHour = groupAppointmentsByHour(appointments);

  return (
    <div className="calendar-day-list-timeline">
      {hours.map((hour) => {
        const hourAppointments = appointmentsByHour[hour] || [];
        const hourValue = formatHourValue(hour);

        return (
          <div className="calendar-day-list-hour" key={hour}>
            <button
              className="calendar-day-list-time"
              type="button"
              onClick={() => onNewAppointment(hourValue)}
            >
              {formatHour(hour)}
            </button>

            <div className="calendar-day-list-content">
              {hourAppointments.length ? (
                hourAppointments.map((appointment) => (
                  <button
                    key={appointment.id}
                    className={
                      "calendar-day-list-appointment is-" +
                      getAppointmentStatus(appointment.status)
                    }
                    type="button"
                    onClick={() => onOpenAppointment(appointment)}
                  >
                    <strong>{formatTime(appointment.appointment_time)}</strong>
                    <span>{appointment.full_name || text.appointment}</span>
                    <small>{getAppointmentArea(appointment, text)}</small>
                  </button>
                ))
              ) : (
                <button
                  className="calendar-day-list-empty"
                  type="button"
                  onClick={() => onNewAppointment(hourValue)}
                  aria-label={`${text.newAppointment} ${formatHour(hour)}`}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

 function WeekCalendarView({ date, customersByDate, calendarEventsByDate, holidaysByDate, text, language, dateLocale, onOpenAppointment, onNewAppointment, onOpenDay }) {
  const weekDays = useMemo(() => buildWeekDays(date), [date]);
  const isCurrentWeek = weekDays.some((day) => isToday(day));
  const currentMinutes = getCurrentDayMinutes();

  return (
    <section className="calendar-week-view" aria-label="Week calendar view">
      <div className="calendar-week-days">
        {weekDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          return (
            <button key={dateKey} type="button" className={isToday(day) ? "is-today" : ""} onClick={() => onOpenDay(day)}>
              <span>{format(day, "EEE", { locale: dateLocale })}</span>
              <strong>{format(day, "d")}</strong>
            </button>
          );
        })}
      </div>

      <div className="calendar-week-scroll">
        <div className="calendar-week-grid" style={{ "--calendar-week-days": weekDays.length }}>
          <div className="calendar-week-time-gutter">
            {buildTimelineHours().map((hour) => <span key={hour}>{formatHour(hour)}</span>)}
          </div>
          {weekDays.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const appointments = [...(customersByDate[dateKey] || [])].sort(compareAppointmentDateTime);
            const events = calendarEventsByDate[dateKey] || [];
            const holiday = holidaysByDate[dateKey];
            return (
              <div key={dateKey} className="calendar-week-column">
                {holiday ? <span className="calendar-week-holiday">{getHolidayName(holiday.name, language)}</span> : null}
                {events.length ? <span className="calendar-week-event">{events[0].title}</span> : null}
                <TimelineGrid compact onNewAppointment={(time) => onNewAppointment(day, time)} hideTimeLabels>
                  {isCurrentWeek && isToday(day) ? <CurrentTimeIndicator minutes={currentMinutes} /> : null}
                  {appointments.map((appointment) => (
                    <TimelineAppointmentBlock key={appointment.id} appointment={appointment} text={text} compact onClick={() => onOpenAppointment(appointment)} />
                  ))}
                </TimelineGrid>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MonthCalendarView({ monthDate, calendarDays, customersByDate, calendarEventsByDate, holidaysByDate, text, language, onOpenDay, onOpenAppointment, onOpenEvent }) {
  return (
    <section className="calendar-month-shell calendar-system-month" aria-label="Month calendar view">
      <div className="appointments-month calendar-month-grid-wrap">
        <div className="appointments-weekdays">
          {text.weekdays.map((day) => <div key={day}>{day}</div>)}
        </div>
        <div className="appointments-month-grid">
          {calendarDays.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const appointments = customersByDate[dateKey] || [];
            const dayEvents = calendarEventsByDate[dateKey] || [];
            const holiday = holidaysByDate[dateKey];
            const visibleAppointments = appointments.slice(0, VISIBLE_PER_DAY);
            const moreCount = Math.max(appointments.length - visibleAppointments.length, 0);
            return (
              <button key={dateKey} className={"appointments-day-cell calendar-day-button " + (isSameMonth(day, monthDate) ? "" : "is-outside-month") + " " + (isToday(day) ? "is-today" : "")} type="button" onClick={() => onOpenDay(day)}>
                <span className="appointments-day-number">{format(day, "d")}</span>
                {holiday ? <span className="holiday-chip"><strong>{text.holiday}</strong><em>{getHolidayName(holiday.name, language)}</em></span> : null}
                {dayEvents.map((event) => (
                  <span key={event.id} className={"calendar-event-chip is-" + (event.event_type || "other")} style={getCalendarEventStyle(event)} onClick={(eventClick) => { eventClick.stopPropagation(); onOpenEvent(event); }} role="button" tabIndex={0}>{event.title}</span>
                ))}
                <span className="appointments-day-list">
                  {visibleAppointments.map((customer) => <AppointmentChip key={customer.id} customer={customer} text={text} onClick={(event) => { event.stopPropagation(); onOpenAppointment(customer); }} />)}
                  {moreCount ? <span className="appointments-more">+{moreCount} {text.more}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TimelineGrid({ children, onNewAppointment, compact = false, hideTimeLabels = false }) {
  const hours = buildTimelineHours();
  return (
    <div className={"calendar-timeline " + (compact ? "is-compact" : "")} style={{ height: getTimelineHeight() }}>
      {hours.map((hour) => (
        <button key={hour} className="calendar-time-slot" type="button" style={{ top: minuteToTop(hour * 60) }} onClick={() => onNewAppointment(formatHourValue(hour))}>
          {!hideTimeLabels ? <span>{formatHour(hour)}</span> : null}
        </button>
      ))}
      {children}
    </div>
  );
}

function TimelineAppointmentBlock({
  appointment,
  text,
  onClick,
  compact = false,
}) {
  const startMinutes =
    getAppointmentMinutes(appointment.appointment_time) ??
    TIMELINE_START_HOUR * 60;

  const top = minuteToTop(startMinutes);
  const height = compact ? 44 : 60;

  return (
    <button
      className={
        "calendar-timeline-appointment is-" +
        getAppointmentStatus(appointment.status) +
        (compact ? " is-compact" : "")
      }
      type="button"
      style={{
        top: `${top}px`,
        height: `${height}px`,
      }}
      onClick={onClick}
    >
      <strong>{formatTime(appointment.appointment_time)}</strong>
      <span>{appointment.full_name || text.appointment}</span>

      {!compact ? (
        <small>{getAppointmentArea(appointment, text)}</small>
      ) : null}
    </button>
  );
}

function CalendarEventStrip({
  events,
  text,
  onOpenEvent,
  hideLabel = false,
}) {
  return (
    <section
      className="calendar-all-day-section"
      aria-label={hideLabel ? undefined : text.allDay || "All day"}
    >
      {!hideLabel ? (
        <div className="calendar-all-day-label">
          {text.allDay || "All day"}
        </div>
      ) : null}

      <div className="calendar-all-day-events">
        {events.map((event) => (
          <button
            key={event.id}
            className="calendar-all-day-event"
            type="button"
            style={getCalendarEventStyle(event)}
            onClick={() => onOpenEvent(event)}
          >
            {event.title}
          </button>
        ))}
      </div>
    </section>
  );
}

function CurrentTimeIndicator({ minutes }) {
  return <span className="calendar-current-time" style={{ top: minuteToTop(minutes) }} />;
}

function normalizeCalendarEventType(value) {
  return value === "leave" ? "leave" : "other";
}

function getCalendarEventColor(event) {
  const eventType = normalizeCalendarEventType(event.event_type);
  return event.color || EVENT_TYPE_COLORS[eventType] || DEFAULT_EVENT_COLOR;
}

function getCalendarEventStyle(event) {
  const color = getCalendarEventColor(event);

  return {
    "--event-color": color,
    "--event-color-soft": `${color}1f`
  };
}

function AppointmentChip({ customer, onClick, text }) {
  return (
    <span
      className={`appointment-chip is-${getAppointmentStatus(
        customer.status
      )}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <span className="appointment-chip-line">
        <strong className="appointment-chip-time">
          {formatTime(customer.appointment_time)}
        </strong>
        <span>{shortName(customer.full_name, text)}</span>
      </span>
    </span>
  );
}

function DayAppointmentsModal({
  selectedDay,
  text,
  language,
  dateLocale,
  onClose,
  onOpenAppointment,
  onNewAppointment,
  onNewEvent
}) {
  const appointments = [...selectedDay.appointments].sort(
    compareAppointmentDateTime
  );

  return (
    <div
      className="day-appointments-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-appointments-title"
    >
      <div className="day-appointments-panel">
        <div className="day-appointments-header">
          <div>
            <p>
              {format(selectedDay.date, "EEEE", {
                locale: dateLocale
              })}
            </p>
            <h2 id="day-appointments-title">
              {format(selectedDay.date, "d MMMM yyyy", {
                locale: dateLocale
              })}
            </h2>
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={text.closeAppointments}
          >
            <X size={20} />
          </button>
        </div>

        {appointments.length ? (
          <div className="day-appointments-list">
            {appointments.map((customer) => (
              <button
                key={customer.id}
                className="day-appointment-row"
                type="button"
                onClick={() => onOpenAppointment(customer)}
              >
                <strong>
                  {formatTime(customer.appointment_time)}
                </strong>
                <span>{customer.full_name}</span>
                <small>{getAppointmentArea(customer, text)}</small>
                <em>
                  {getStatusLabel(
                    getAppointmentStatus(customer.status),
                    text
                  )}
                </em>
              </button>
            ))}
          </div>
        ) : (
          <p className="day-appointments-empty">
            {text.noAppointments}
          </p>
        )}

        <div className="day-appointments-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={onNewEvent}
          >
            <Plus size={16} />
            {text.newEvent}
          </button>

          <button
          className="button button-primary"
          type="button"
          onClick={onNewAppointment}
          >
            <Plus size={16}/>
            {text.newAppointment}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppointmentDetailsModal({
  customer,
  actionState,
  text,
  dateLocale,
  onClose,
  onCancel,
  onComplete,
  onReschedule,
  onSendThankYou
}) {
  const status = getAppointmentStatus(customer.status);
  const cancelState =
    actionState[`${customer.id}:Cancelled`] || {};
  const completeState =
    actionState[`${customer.id}:Completed`] || {};
  const rescheduleState =
    actionState[`${customer.id}:Scheduled`] || {};
  const thankYouState =
    actionState[`${customer.id}:thank-you`] || {};

  return (
    <div
      className="appointment-details-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="appointment-details-title"
    >
      <div className="appointment-details-panel">
        <div className="appointment-details-header">
          <div>
            <p>{getStatusLabel(status, text)}</p>
            <h2 id="appointment-details-title">
              {customer.full_name}
            </h2>
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={text.closeDetails}
          >
            <X size={20} />
          </button>
        </div>

        <dl className="appointment-details-list">
          <div>
            <dt>{text.dateTime}</dt>
            <dd>
              {formatAppointmentDateTime(
                customer,
                text,
                dateLocale
              )}
            </dd>
          </div>

          <div>
            <dt>{text.area}</dt>
            <dd>{getAppointmentArea(customer, text)}</dd>
          </div>

          <div>
            <dt>{text.phone}</dt>
            <dd>{customer.phone}</dd>
          </div>

          <div>
            <dt>{text.address}</dt>
            <dd>{customer.address}</dd>
          </div>

          {status === "cancelled" ? (
            <div>
              <dt>{text.cancelledOn}</dt>
              <dd>
                {formatCancellationDate(
                  customer,
                  text,
                  dateLocale
                )}
              </dd>
            </div>
          ) : null}

          {customer.notes ? (
            <div>
              <dt>{text.notes}</dt>
              <dd>{customer.notes}</dd>
            </div>
          ) : null}
        </dl>

        <div className="appointment-details-actions">
          <Link
            className="button button-light"
            to={buildCustomerEditUrl(customer)}
          >
            <Edit3 size={16} />
            {text.edit}
          </Link>

          {status === "scheduled" ? (
            <>
              <button
                className="button button-light"
                type="button"
                onClick={onCancel}
                disabled={cancelState.loading}
              >
                <XCircle size={16} />
                {text.cancel}
              </button>

              <button
                className="button button-primary"
                type="button"
                onClick={onComplete}
                disabled={completeState.loading}
              >
                <CheckCircle2 size={16} />
                {text.completeVisit}
              </button>
            </>
          ) : null}

          {status === "completed" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={onSendThankYou}
              disabled={
                thankYouState.loading || thankYouState.queued
              }
            >
              <Send size={16} />
              {thankYouState.loading
                ? text.queueing
                : thankYouState.alreadySent
                  ? text.alreadySent
                  : thankYouState.duplicate
                    ? text.alreadyQueued
                    : thankYouState.queued
                      ? text.queued
                      : text.sendThankYouSms}
            </button>
          ) : null}

          {status === "cancelled" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={onReschedule}
              disabled={rescheduleState.loading}
            >
              <RotateCcw size={16} />
              {text.reschedule}
            </button>
          ) : null}
        </div>

        {cancelState.error ||
        completeState.error ||
        rescheduleState.error ||
        thankYouState.error ? (
          <p className="appointment-action-error">
            {cancelState.error ||
              completeState.error ||
              rescheduleState.error ||
              thankYouState.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CompleteVisitConfirmModal({
  customer,
  nextCustomer,
  nextLoading,
  options,
  onOptionsChange,
  text,
  loading,
  error,
  onCancel,
  onConfirm,
}) {
  const arrivalUnavailable = !nextLoading && !nextCustomer;

  return (
    <div
      className="confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-visit-title"
    >
      <div className="confirm-panel complete-visit-confirm-panel">
        <h3 id="complete-visit-title">{text.markCompletedTitle}</h3>

        <p>
          {text.markCompletedTextStart}{" "}
          <strong>{customer.full_name}</strong>{" "}
          {text.markCompletedTextEnd}
        </p>

        <div className="complete-sms-options">
          <label className="complete-sms-option">
            <input
              type="checkbox"
              checked={options.sendThankYou}
              onChange={(event) =>
                onOptionsChange((current) => ({
                  ...current,
                  sendThankYou: event.target.checked,
                }))
              }
              disabled={loading}
            />
            <span>
              <strong>Αποστολή ευχαριστήριου SMS</strong>
              <small>Θα μπει στο SMS queue μόλις ολοκληρωθεί η επίσκεψη.</small>
            </span>
          </label>

          <label className={`complete-sms-option${arrivalUnavailable ? " is-disabled" : ""}`}>
            <input
              type="checkbox"
              checked={options.approveArrival}
              onChange={(event) =>
                onOptionsChange((current) => ({
                  ...current,
                  approveArrival: event.target.checked,
                }))
              }
              disabled={loading || nextLoading || arrivalUnavailable}
            />
            <span>
              <strong>Ενεργοποίηση SMS άφιξης για τον επόμενο πελάτη</strong>
              <small>
                {nextLoading
                  ? "Έλεγχος επόμενου ραντεβού..."
                  : nextCustomer
                    ? `${formatCalendarCustomerTime(nextCustomer.appointment_time)} — ${nextCustomer.full_name || "Επόμενος πελάτης"}`
                    : "Δεν υπάρχει επόμενο ενεργό ραντεβού για σήμερα."}
              </small>
            </span>
          </label>
        </div>

        {error ? <p className="appointment-action-error">{error}</p> : null}

        <div className="confirm-actions complete-visit-confirm-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={onConfirm}
            disabled={loading}
          >
            <CheckCircle2 size={16} />
            {loading ? text.completing : text.completeVisit}
          </button>

          <button
            className="button button-light"
            type="button"
            onClick={onCancel}
            disabled={loading}
          >
            {text.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCalendarCustomerTime(value) {
  return String(value || "").slice(0, 5) || "--:--";
}


function parseViewParam(value) {
  const normalized = String(value || "").toLowerCase();
  return CALENDAR_VIEWS.has(normalized) ? normalized : "month";
}

function parseDateParam(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    const parsed = parseISO(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

function buildWeekDays(date) {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function groupAppointmentsByHour(appointments) {
  return appointments.reduce((groups, appointment) => {
    const minutes = getAppointmentMinutes(appointment.appointment_time);
    const hour = minutes
      ? Math.floor(minutes / 60)
      : TIMELINE_START_HOUR;

    if (!groups[hour]) {
      groups[hour] = [];
    }

    groups[hour].push(appointment);

    groups[hour].sort(compareAppointmentDateTime);

    return groups;
  }, {});
}

function buildTimelineHours() {
  const hours = [];
  for (let hour = TIMELINE_START_HOUR; hour <= TIMELINE_END_HOUR; hour += 1) {
    hours.push(hour);
  }
  return hours;
}

function getTimelineHeight() {
  return (TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1) * TIMELINE_HOUR_HEIGHT;
}

function getAppointmentMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minuteToTop(minutes) {
  const clamped = Math.max(TIMELINE_START_HOUR * 60, Math.min(minutes, (TIMELINE_END_HOUR + 1) * 60));
  return ((clamped - TIMELINE_START_HOUR * 60) / 60) * TIMELINE_HOUR_HEIGHT;
}

function getCurrentDayMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function formatHour(hour) {
  return String(hour).padStart(2, "0") + ":00";
}

function formatHourValue(hour) {
  return String(hour).padStart(2, "0") + ":00";
}

function buildCalendarDays(monthDate) {
  const start = startOfWeek(startOfMonth(monthDate), {
    weekStartsOn: 0
  });
  const days = [];

  for (let index = 0; index < 42; index += 1) {
    days.push(
      new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + index
      )
    );
  }

  return days;
}


function groupCalendarEventsByDate(events) {
  return events.reduce((groups, event) => {
    const start = parseISO(event.start_date);
    const end = parseISO(event.end_date);
    let cursor = start;

    while (cursor <= end) {
      const dateKey = format(cursor, "yyyy-MM-dd");

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }

      groups[dateKey].push(event);

      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1
      );
    }

    return groups;
  }, {});
}
function groupCustomersByDate(customers) {
  return customers.reduce((groups, customer) => {
    if (!customer.appointment_date) return groups;

    const list = groups[customer.appointment_date] || [];
    list.push(customer);
    groups[customer.appointment_date] = list.sort(
      compareAppointmentDateTime
    );

    return groups;
  }, {});
}

function filterCustomers(customers, statusFilter, query, text) {
  const normalizedQuery = query.trim().toLowerCase();

  return customers.filter((customer) => {
    if (
      statusFilter &&
      getAppointmentStatus(customer.status) !== statusFilter
    ) {
      return false;
    }

    if (!normalizedQuery) return true;

    return [
      customer.full_name,
      customer.phone,
      customer.address,
      customer.appointment_date,
      customer.appointment_time,
      customer.status,
      getAppointmentArea(customer, text)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function normalizeStatusFilter(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return STATUS_FILTERS.has(normalized) ? normalized : "";
}

function parseMonthParam(value, fallbackDate = new Date()) {
  if (/^\d{4}-\d{2}$/.test(value || "")) {
    const parsed = parseISO(String(value) + "-01");

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1);
}

function buildCalendarReturnTo(date, statusFilter, view = "day") {
  const params = new URLSearchParams({
    view,
    date: format(date, "yyyy-MM-dd"),
    month: format(date, "yyyy-MM")
  });

  if (statusFilter) {
    params.set("status", statusFilter);
  }

  return "/appointments?" + params.toString();
}

function buildCustomerEditUrl(customer) {
  const appointmentDate = getValidAppointmentDate(
    customer.appointment_date
  );
  const params = new URLSearchParams();

  if (appointmentDate) {
    params.set("date", appointmentDate);
    params.set(
      "returnTo",
      buildCalendarReturnTo(
        parseISO(appointmentDate),
        getAppointmentStatus(customer.status)
      )
    );
  }

  const queryString = params.toString();

  return `/customers/${customer.id}/edit${
    queryString ? `?${queryString}` : ""
  }`;
}

function getValidAppointmentDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? value
    : "";
}

function getAppointmentStatus(status = "") {
  const normalizedStatus = String(status)
    .trim()
    .toLowerCase();

  if (
    ["cancelled", "canceled", "rejected"].includes(
      normalizedStatus
    )
  ) {
    return "cancelled";
  }

  if (
    ["completed", "visited", "done", "accepted"].includes(
      normalizedStatus
    )
  ) {
    return "completed";
  }

  return "scheduled";
}

function getStatusLabel(status, text) {
  const normalized = getAppointmentStatus(status);
  return text[normalized] || text.scheduled;
}

function formatAppointmentDateTime(
  customer,
  text,
  dateLocale
) {
  if (!customer.appointment_date) {
    return text.noDate;
  }

  const date = formatDate(
    customer.appointment_date,
    text,
    dateLocale
  );

  return `${date}${
    customer.appointment_time
      ? `, ${formatTime(customer.appointment_time)}`
      : ""
  }`;
}

function formatDate(value, text, dateLocale) {
  try {
    return format(parseISO(value), "d MMM yyyy", {
      locale: dateLocale
    });
  } catch {
    return value || text.noDate;
  }
}

function formatTime(value) {
  try {
    return format(
      parseISO(`2026-01-01T${value}`),
      "HH:mm"
    );
  } catch {
    return value || "";
  }
}

function formatDateTime(value, text, dateLocale) {
  try {
    return format(new Date(value), "d MMM yyyy HH:mm", {
      locale: dateLocale
    });
  } catch {
    return value || text.notRecorded;
  }
}

function formatCancellationDate(
  customer,
  text,
  dateLocale
) {
  if (customer.updated_at) {
    return formatDateTime(
      customer.updated_at,
      text,
      dateLocale
    );
  }

  if (customer.appointment_date) {
    return formatDate(
      customer.appointment_date,
      text,
      dateLocale
    );
  }

  return text.cancellationUnavailable;
}

function getAppointmentArea(customer, text) {
  const addressParts = (customer.address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (addressParts.length > 1) {
    return addressParts[addressParts.length - 2];
  }

  return addressParts[0] || text.areaNotSet;
}

function shortName(name = "", text) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 2) {
    return name || text.appointment;
  }

  return `${parts[0]} ${parts[1]}`;
}

function getHolidayName(name, language) {
  if (language === "el") {
    return name;
  }

  return HOLIDAY_NAMES_EN[name] || name;}
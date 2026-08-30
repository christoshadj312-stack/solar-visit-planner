import { Check, Trash2, X } from "lucide-react";

const EVENT_COLORS = [
  { value: "#20c997", key: "eventColorTeal" },
  { value: "#426a5a", key: "eventColorGreen" },
  { value: "#8b5cf6", key: "eventColorPurple" },
  { value: "#f59e0b", key: "eventColorOrange" },
  { value: "#ef4444", key: "eventColorRed" },
  { value: "#2563eb", key: "eventColorBlue" }
];

export function CalendarEventModal({
  form,
  formState,
  mode = "create",
  text,
  onChange,
  onClose,
  onSubmit,
  onDelete
}) {
  const isEditMode = mode === "edit";
  const displayedEventType = form.event_type === "leave" ? "leave" : "other";

  return (
    <div
      className="confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-event-title"
    >
      <form className="confirm-panel calendar-event-modal" onSubmit={onSubmit}>
        <div className="day-appointments-header">
          <div>
            <p>{text.eventCalendar}</p>
            <h3 id="calendar-event-title">
              {isEditMode ? text.editEvent : text.newEvent}
            </h3>
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={text.closeDetails || text.closeAppointments}
          >
            <X size={20} />
          </button>
        </div>

        <label className="calendar-event-field">
          <span>{text.eventTitle}</span>
          <input
            type="text"
            value={form.title}
            onChange={(event) =>
              onChange("title", event.target.value)
            }
            placeholder={text.eventTitlePlaceholder}
            required
          />
        </label>

        <label className="calendar-event-field">
          <span>{text.eventType}</span>
          <select
            value={displayedEventType}
            onChange={(event) =>
              onChange("event_type", event.target.value)
            }
          >
            <option value="leave">{text.eventLeave}</option>
            <option value="other">{text.eventOther}</option>
          </select>
        </label>

        <div className="calendar-event-date-grid">
          <label className="calendar-event-field">
            <span>{text.eventFrom}</span>
            <input
              type="date"
              value={form.start_date}
              onChange={(event) =>
                onChange("start_date", event.target.value)
              }
              required
            />
            <small>{formatDisplayDate(form.start_date)}</small>
          </label>

          <label className="calendar-event-field">
            <span>{text.eventTo}</span>
            <input
              type="date"
              value={form.end_date}
              min={form.start_date}
              onChange={(event) =>
                onChange("end_date", event.target.value)
              }
              required
            />
            <small>{formatDisplayDate(form.end_date)}</small>
          </label>
        </div>

        <div className="calendar-event-field calendar-event-color-field">
          <span>{text.eventColor}</span>
          <div className="calendar-event-color-list">
            {EVENT_COLORS.map((color) => {
              const selected = form.color === color.value;

              return (
                <button
                  key={color.value}
                  className={`calendar-event-color-swatch${selected ? " is-selected" : ""}`}
                  type="button"
                  style={{ backgroundColor: color.value }}
                  onClick={() => onChange("color", color.value)}
                  aria-label={text[color.key] || text.eventColor}
                  aria-pressed={selected}
                >
                  {selected ? <Check size={15} /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <label className="calendar-event-field">
          <span>{text.eventNotes}</span>
          <textarea
            value={form.notes}
            onChange={(event) =>
              onChange("notes", event.target.value)
            }
            placeholder={text.eventNotesPlaceholder}
          />
        </label>

        {formState.error ? (
          <p className="appointment-action-error">
            {formState.error}
          </p>
        ) : null}

        <div className="confirm-actions">
          {isEditMode ? (
            <button
              className="button button-danger"
              type="button"
              onClick={onDelete}
              disabled={formState.loading || formState.deleting}
            >
              <Trash2 size={16} />
              {formState.deleting ? text.eventDeleting : text.eventDelete}
            </button>
          ) : null}

          <button
            className="button button-primary"
            type="submit"
            disabled={formState.loading || formState.deleting}
          >
            {formState.loading ? text.eventSaving : text.eventSave}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatDisplayDate(value) {
  if (!value) return "";

  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}


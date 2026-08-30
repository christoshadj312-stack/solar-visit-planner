import { useEffect, useMemo, useState } from "react";
import { Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth.jsx";
import { useTranslation } from "../i18n/index.js";
import {
  createOvertimeEntry,
  deleteOvertimeEntry,
  fetchOvertimeEntries,
  updateOvertimeEntry,
} from "../services/overtimeService.js";
import { todayIso } from "../utils/date.js";

export function OvertimePage() {
  const { session } = useAuth();
  const { t, locale } = useTranslation();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    date: todayIso(),
    hours: "",
    note: "",
  });

  const [editingEntryId, setEditingEntryId] = useState("");

  const [shareRange, setShareRange] = useState({
    startDate: todayIso(),
    endDate: todayIso(),
  });

  const [copyMessage, setCopyMessage] = useState("");

  const userId = session?.user?.id;

  const totals = useMemo(() => calculateTotals(entries), [entries]);

  const shareEntries = useMemo(
    () =>
      filterOvertimeEntries(
        entries,
        shareRange.startDate,
        shareRange.endDate
      ),
    [entries, shareRange.startDate, shareRange.endDate]
  );

  const overtimeText = useMemo(
    () =>
      buildOvertimeShareText(
        shareEntries,
        shareRange.startDate,
        shareRange.endDate,
        locale
      ),
    [shareEntries, shareRange.startDate, shareRange.endDate, locale]
  );

  useEffect(() => {
    loadEntries();
  }, [userId]);

  async function loadEntries() {
    if (!userId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await fetchOvertimeEntries(userId);
      setEntries(data);
    } catch (err) {
      setError(err.message || t("overtime.loadError"));
    } finally {
      setLoading(false);
    }
  }

  function updateForm(event) {
    const { id, value } = event.target;
    setForm((current) => ({ ...current, [id]: value }));
  }

  function updateShareRange(event) {
    const { id, value } = event.target;

    setCopyMessage("");

    setShareRange((current) => {
      const next = { ...current, [id]: value };

      if (
        next.startDate &&
        next.endDate &&
        next.endDate < next.startDate
      ) {
        return id === "startDate"
          ? { ...next, endDate: value }
          : { ...next, startDate: value };
      }

      return next;
    });
  }

  async function saveEntry(event) {
    event.preventDefault();

    const hours = parseOvertimeHoursInput(form.hours);

    if (!userId || !form.date || !Number.isFinite(hours) || hours <= 0) {
      setError(
        "Καταχωρίστε έγκυρη υπερωρία. Παράδειγμα: 1.30 ή 1:30 για 1 ώρα και 30 λεπτά."
      );
      return;
    }

    setError("");

    try {
      if (editingEntryId) {
        const updatedEntry = await updateOvertimeEntry(
          userId,
          editingEntryId,
          {
            date: form.date,
            hours,
            note: form.note.trim(),
          }
        );

        setEntries((current) =>
          sortEntriesNewestFirst(
            current.map((entry) =>
              entry.id === editingEntryId ? updatedEntry : entry
            )
          )
        );

        cancelEdit();
        return;
      }

      const newEntry = await createOvertimeEntry(userId, {
        date: form.date,
        hours,
        note: form.note.trim(),
      });

      setEntries((current) =>
        sortEntriesNewestFirst([newEntry, ...current])
      );

      setForm({
        date: form.date,
        hours: "",
        note: "",
      });
    } catch (err) {
      setError(err.message || t("overtime.saveError"));
    }
  }

  function startEdit(entry) {
    setEditingEntryId(entry.id);
    setForm({
      date: entry.date,
      hours: formatHoursForInput(entry.hours),
      note: entry.note || "",
    });
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function cancelEdit() {
    setEditingEntryId("");
    setForm({
      date: todayIso(),
      hours: "",
      note: "",
    });
  }

  async function removeEntry(entryId) {
    setError("");

    try {
      await deleteOvertimeEntry(entryId);
      setEntries((current) =>
        current.filter((entry) => entry.id !== entryId)
      );

      if (editingEntryId === entryId) {
        cancelEdit();
      }
    } catch (err) {
      setError(err.message || t("overtime.deleteError"));
    }
  }

  async function copyOvertimeList() {
    try {
      await navigator.clipboard.writeText(overtimeText);
      setCopyMessage("✓ Οι υπερωρίες αντιγράφηκαν");
    } catch {
      setCopyMessage("Δεν ήταν δυνατή η αντιγραφή.");
    }
  }

  return (
    <section className="tool-page overtime-page">
      <div className="tool-page-header">
        <p>{t("overtime.eyebrow")}</p>
        <h1>{t("overtime.title")}</h1>
      </div>

      <div className="overtime-summary-grid">
        <div>
          <span>{t("overtime.thisWeek")}</span>
          <strong>{formatHours(totals.week)}</strong>
        </div>

        <div>
          <span>{t("overtime.thisMonth")}</span>
          <strong>{formatHours(totals.month)}</strong>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {editingEntryId ? (
        <p className="tool-message">
          Επεξεργάζεσαι υπάρχουσα υπερωρία. Πάτησε αποθήκευση για να
          ενημερωθεί.
        </p>
      ) : null}

      <form className="simple-tool-form" onSubmit={saveEntry}>
        <label>
          {t("overtime.date")}
          <input
            id="date"
            type="date"
            value={form.date}
            onChange={updateForm}
            required
          />
        </label>

        <label>
          {t("overtime.hours")}
          <input
            id="hours"
            type="text"
            inputMode="decimal"
            value={form.hours}
            onChange={updateForm}
            placeholder="π.χ. 1.30 ή 1:30"
            required
          />
          <small>
            Γράψε 1.30 ή 1:30 για 1 ώρα και 30 λεπτά.
          </small>
        </label>

        <label className="wide">
          {t("overtime.note")}
          <input
            id="note"
            value={form.note}
            onChange={updateForm}
            placeholder={t("overtime.optionalNote")}
          />
        </label>

        <button
          className="button button-primary"
          type="submit"
          disabled={!userId}
        >
          {editingEntryId ? <Pencil size={18} /> : <Plus size={18} />}
          {editingEntryId ? "Αποθήκευση αλλαγών" : t("overtime.add")}
        </button>

        {editingEntryId ? (
          <button
            className="button button-light"
            type="button"
            onClick={cancelEdit}
          >
            <X size={18} />
            Ακύρωση edit
          </button>
        ) : null}
      </form>

      <section className="share-overtime-box">
        <div className="tool-page-header compact">
          <p>Αποστολή</p>
          <h2>Αντιγραφή υπερωριών</h2>
        </div>

        <div className="simple-tool-form share-range-form">
          <label>
            Από
            <input
              id="startDate"
              type="date"
              value={shareRange.startDate}
              onChange={updateShareRange}
            />
          </label>

          <label>
            Έως
            <input
              id="endDate"
              type="date"
              value={shareRange.endDate}
              onChange={updateShareRange}
            />
          </label>

          <button
            className="button button-primary"
            type="button"
            onClick={copyOvertimeList}
            disabled={!shareEntries.length}
          >
            <Copy size={18} />
            Αντιγραφή υπερωριών
          </button>
        </div>

        <div className="share-summary">
          <strong>{formatHours(sumHours(shareEntries))}</strong>
          <span>{shareEntries.length} εγγραφές στο επιλεγμένο διάστημα</span>
        </div>

        {copyMessage ? <p className="tool-message">{copyMessage}</p> : null}

        <div className="share-preview" aria-label="Προεπισκόπηση υπερωριών">
          <pre>{overtimeText}</pre>
        </div>
      </section>

      <div className="simple-list">
        {loading ? (
          <p className="empty-state">{t("overtime.loading")}</p>
        ) : entries.length ? (
          entries.map((entry) => (
            <article className="simple-list-card" key={entry.id}>
              <div>
                <strong>{formatDate(entry.date, locale)}</strong>
                <span>
                  {formatHours(entry.hours)}
                  {entry.note ? ` · ${entry.note}` : ""}
                </span>
              </div>

              <button
                className="small-card-icon"
                type="button"
                onClick={() => startEdit(entry)}
                aria-label="Επεξεργασία υπερωρίας"
              >
                <Pencil size={16} />
              </button>

              <button
                className="small-card-icon"
                type="button"
                onClick={() => removeEntry(entry.id)}
                aria-label={t("overtime.deleteAria")}
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))
        ) : (
          <p className="empty-state">{t("overtime.empty")}</p>
        )}
      </div>
    </section>
  );
}

function filterOvertimeEntries(entries, startDate, endDate) {
  return entries
    .filter((entry) => {
      const date = entry.date || "";
      return (
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        date >= startDate &&
        date <= endDate
      );
    })
    .sort((a, b) => {
      const dateCompare = (a.date || "").localeCompare(b.date || "");
      if (dateCompare !== 0) return dateCompare;

      return String(a.createdAt || "").localeCompare(
        String(b.createdAt || "")
      );
    });
}

function buildOvertimeShareText(entries, startDate, endDate, locale) {
  const lines = [
    "ΥΠΕΡΩΡΙΕΣ",
    `${formatDate(startDate, locale)} - ${formatDate(endDate, locale)}`,
  ];

  if (!entries.length) {
    lines.push("", "Δεν υπάρχουν υπερωρίες στο επιλεγμένο διάστημα.");
    return lines.join("\n");
  }

  const groupedEntries = groupEntriesByDate(entries);
  const dates = Object.keys(groupedEntries).sort();

  dates.forEach((date) => {
    lines.push("", formatDate(date, locale));

    groupedEntries[date].forEach((entry) => {
      const note = entry.note ? ` | ${entry.note}` : "";
      lines.push(`- ${formatHours(entry.hours)}${note}`);
    });
  });

  lines.push("", `Σύνολο υπερωριών: ${formatHours(sumHours(entries))}`);

  return lines.join("\n");
}

function groupEntriesByDate(entries) {
  return entries.reduce((groups, entry) => {
    const date = entry.date;
    groups[date] = groups[date] || [];
    groups[date].push(entry);
    return groups;
  }, {});
}

function sumHours(entries) {
  return entries.reduce((total, entry) => {
    return total + (Number(entry.hours) || 0);
  }, 0);
}

function calculateTotals(entries) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const month = now.getMonth();
  const year = now.getFullYear();

  return entries.reduce(
    (totals, entry) => {
      const entryDate = parseLocalDate(entry.date);

      if (Number.isNaN(entryDate.getTime())) {
        return totals;
      }

      const hours = Number(entry.hours) || 0;

      if (entryDate >= weekStart && entryDate <= weekEnd) {
        totals.week += hours;
      }

      if (
        entryDate.getMonth() === month &&
        entryDate.getFullYear() === year
      ) {
        totals.month += hours;
      }

      return totals;
    },
    { week: 0, month: 0 }
  );
}

function parseOvertimeHoursInput(value) {
  const raw = String(value || "").trim().replace(",", ".");

  if (!raw) {
    return Number.NaN;
  }

  const separator = raw.includes(":")
    ? ":"
    : raw.includes(".")
      ? "."
      : "";

  if (!separator) {
    const hours = Number(raw);
    return Number.isFinite(hours) ? hours : Number.NaN;
  }

  const parts = raw.split(separator);

  if (parts.length !== 2) {
    return Number.NaN;
  }

  const [hoursText, minutesText] = parts;

  if (!/^\d+$/.test(hoursText) || !/^\d{1,2}$/.test(minutesText)) {
    return Number.NaN;
  }

  const hours = Number(hoursText);

  let minutes = Number(minutesText);

  /*
   * Με τελεία/κόμμα, το 1.3 σημαίνει 1 ώρα και 30 λεπτά.
   * Με 1.30 σημαίνει επίσης 1 ώρα και 30 λεπτά.
   */
  if (separator !== ":" && minutesText.length === 1) {
    minutes *= 10;
  }

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes >= 60) {
    return Number.NaN;
  }

  return hours + minutes / 60;
}

function formatHoursForInput(hours) {
  const totalMinutes = Math.round((Number(hours) || 0) * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return String(wholeHours);
  }

  return `${wholeHours}.${String(minutes).padStart(2, "0")}`;
}

function formatHours(hours) {
  const totalMinutes = Math.round((Number(hours) || 0) * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (wholeHours <= 0 && minutes <= 0) {
    return "0 h";
  }

  if (minutes === 0) {
    return `${wholeHours} h`;
  }

  return `${wholeHours}:${String(minutes).padStart(2, "0")} h`;
}

function sortEntriesNewestFirst(entries) {
  return [...entries].sort((a, b) => {
    const dateCompare = (b.date || "").localeCompare(a.date || "");

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return String(b.createdAt || "").localeCompare(
      String(a.createdAt || "")
    );
  });
}

function parseLocalDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfWeek(date) {
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);

  return start;
}

function endOfWeek(date) {
  const end = startOfWeek(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return end;
}

function formatDate(value, locale) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    return value || "-";
  }

  return new Intl.DateTimeFormat(
    locale?.code === "el" ? "el-CY" : "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  ).format(parseLocalDate(value));
}
import { useEffect, useMemo, useState } from "react";
import { FileText, NotebookPen, Pin, PinOff, Plus, Save, Search, Trash2, X } from "lucide-react";
import {
  createNote,
  deleteNote,
  getNotes,
  updateNote,
} from "../services/notesService.js";
import { useTranslation } from "../i18n/index.js";

const emptyForm = {
  content: "",
};

const PINNED_NOTES_KEY = "solarvisit.pinnedNotes";

export function NotesPage() {
  const { t, locale } = useTranslation();
  const [notes, setNotes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [pinnedNoteIds, setPinnedNoteIds] = useState(() => readPinnedNoteIds());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = useMemo(() => Boolean(editingId), [editingId]);
  const visibleNotes = useMemo(
    () => sortAndFilterNotes(notes, pinnedNoteIds, searchQuery),
    [notes, pinnedNoteIds, searchQuery]
  );

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    setLoading(true);
    setError("");

    try {
      const data = await getNotes();
      setNotes(data);
    } catch (err) {
      setError(err.message || t("notes.unableLoad"));
    } finally {
      setLoading(false);
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
  }

  function startEdit(note) {
    setEditingId(note.id);
    setForm({
      content: note.content || "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const content = form.content.trim();

    if (!content) {
      setError(t("notes.enterNote"));
      return;
    }

    const title = createTitleFromContent(content, t);

    setSaving(true);

    try {
      if (isEditing) {
        const updatedNote = await updateNote(editingId, {
          title,
          content,
        });

        setNotes((current) =>
          current.map((note) =>
            note.id === editingId ? updatedNote : note
          )
        );
      } else {
        const newNote = await createNote({
          title,
          content,
        });

        setNotes((current) => [newNote, ...current]);
      }

      resetForm();
    } catch (err) {
      setError(err.message || t("notes.unableSave"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(note) {
    const confirmed = window.confirm(t("notes.deleteConfirm"));

    if (!confirmed) {
      return;
    }

    setError("");

    try {
      await deleteNote(note.id);
      setNotes((current) =>
        current.filter((item) => item.id !== note.id)
      );
      setPinnedNoteIds((current) => {
        const next = current.filter((id) => id !== note.id);
        writePinnedNoteIds(next);
        return next;
      });

      if (editingId === note.id) {
        resetForm();
      }
    } catch (err) {
      setError(err.message || t("notes.unableDelete"));
    }
  }

  function togglePin(noteId) {
    setPinnedNoteIds((current) => {
      const isPinned = current.includes(noteId);
      const next = isPinned
        ? current.filter((id) => id !== noteId)
        : [noteId, ...current];

      writePinnedNoteIds(next);
      return next;
    });
  }

  return (
    <main className="page-shell notes-page">
      <style>{notesPageStyles}</style>

      <section className="notes-hero">
        <div className="notes-hero-icon" aria-hidden="true">
          <NotebookPen size={26} />
        </div>

        <div className="notes-hero-copy">
          <p className="eyebrow">{t("notes.eyebrow")}</p>
          <h1>{t("notes.title")}</h1>
          <p>
            {t("notes.description")}
          </p>
        </div>

        <div className="notes-hero-count">
          <strong>{notes.length}</strong>
          <span>{notes.length === 1 ? t("notes.savedNote") : t("notes.savedNotes")}</span>
        </div>
      </section>

      <section className="notes-editor-card">
        <form onSubmit={handleSubmit} className="notes-form">
          <div className="notes-form-header">
            <div>
              <h2>{isEditing ? t("notes.editNote") : t("notes.newNote")}</h2>
              <p>
                {isEditing
                  ? t("notes.editDescription")
                  : t("notes.newDescription")}
              </p>
            </div>

            {isEditing ? (
              <button
                className="notes-ghost-button"
                type="button"
                onClick={resetForm}
              >
                <X size={18} />
                {t("common.cancel")}
              </button>
            ) : null}
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <label className="notes-field">
            <span>{t("notes.note")}</span>
            <textarea
              value={form.content}
              onChange={(event) =>
                updateForm("content", event.target.value)
              }
              rows={7}
              placeholder={t("notes.placeholder")}
              required
            />
          </label>

          <button
            className="notes-submit-button"
            type="submit"
            disabled={saving}
          >
            {isEditing ? <Save size={18} /> : <Plus size={18} />}
            {saving
              ? t("notes.saving")
              : isEditing
                ? t("notes.saveChanges")
                : t("notes.addNote")}
          </button>
        </form>
      </section>

      <section className="notes-list-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("notes.saved")}</p>
            <h2>{t("notes.notesCount", { count: notes.length })}</h2>
          </div>
        </div>

        <label className="notes-search" aria-label={t("notes.searchAria")}>
          <Search size={18} />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("notes.searchPlaceholder")}
          />
        </label>

        {loading ? <p>{t("notes.loading")}</p> : null}

        {!loading && notes.length === 0 ? (
          <section className="notes-empty-state">
            <FileText size={28} />
            <p>{t("notes.empty")}</p>
          </section>
        ) : null}

        {!loading && notes.length > 0 && visibleNotes.length === 0 ? (
          <section className="notes-empty-state">
            <Search size={28} />
            <p>{t("notes.noMatch")}</p>
          </section>
        ) : null}

        <div className="notes-grid">
          {visibleNotes.map((note) => {
            const isPinned = pinnedNoteIds.includes(note.id);

            return (
            <article className={`note-card ${isPinned ? "note-card-pinned" : ""}`} key={note.id}>
              <div className="note-card-header">
                <small>{formatNoteTimestamp(note.updated_at, t, locale)}</small>
              </div>

              <p className="note-content">
                {note.content || t("notes.noDetails")}
              </p>

              <div className="note-actions">
                <button
                  className="notes-ghost-button note-action-button"
                  type="button"
                  onClick={() => togglePin(note.id)}
                  aria-label={isPinned ? t("notes.unpinNote") : t("notes.pinNote")}
                  title={isPinned ? t("notes.unpinNote") : t("notes.pinNote")}
                >
                  {isPinned ? <PinOff size={15} /> : <Pin size={15} />}
                  {isPinned ? t("notes.unpin") : t("notes.pin")}
                </button>

                <button
                  className="notes-ghost-button note-action-button"
                  type="button"
                  onClick={() => startEdit(note)}
                >
                  {t("notes.edit")}
                </button>

                <button
                  className="notes-danger-button note-action-button"
                  type="button"
                  onClick={() => handleDelete(note)}
                >
                  <Trash2 size={15} />
                  {t("notes.delete")}
                </button>
              </div>
            </article>
          );
          })}
        </div>
      </section>
    </main>
  );
}

function createTitleFromContent(content, t) {
  const firstLine = content.split("\n").find((line) => line.trim()) || t("notes.defaultTitle");
  const title = firstLine.trim().slice(0, 80);
  return title || t("notes.defaultTitle");
}

function formatNoteTimestamp(value, t, locale) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return t("notes.lastUpdated");
  }

  const dateText = new Intl.DateTimeFormat(locale?.code === "el" ? "el-CY" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

  const timeText = new Intl.DateTimeFormat(locale?.code === "el" ? "el-CY" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${t("notes.lastUpdated")} · ${dateText} · ${timeText}`;
}

function sortAndFilterNotes(notes, pinnedNoteIds, searchQuery) {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return notes
    .filter((note) => {
      if (!normalizedQuery) return true;

      return String(note.content || "")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .sort((firstNote, secondNote) => {
      const firstPinned = pinnedNoteIds.includes(firstNote.id);
      const secondPinned = pinnedNoteIds.includes(secondNote.id);

      if (firstPinned !== secondPinned) {
        return firstPinned ? -1 : 1;
      }

      return new Date(secondNote.updated_at).getTime() - new Date(firstNote.updated_at).getTime();
    });
}

function readPinnedNoteIds() {
  try {
    const stored = localStorage.getItem(PINNED_NOTES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function writePinnedNoteIds(noteIds) {
  localStorage.setItem(PINNED_NOTES_KEY, JSON.stringify(noteIds));
}

const notesPageStyles = `
  .notes-page {
    display: grid;
    gap: 26px;
  }

  .notes-hero,
  .notes-editor-card,
  .notes-list-section,
  .note-card,
  .notes-empty-state {
    border: 1px solid rgba(31, 95, 69, 0.12);
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 18px 48px rgba(37, 69, 52, 0.13);
    backdrop-filter: blur(16px);
  }

  .notes-hero {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 16px;
    align-items: center;
    padding: clamp(18px, 4vw, 28px);
    border-radius: 28px;
    overflow: hidden;
    position: relative;
  }

  .notes-hero::after {
    content: "";
    position: absolute;
    inset: auto -42px -70px auto;
    width: 180px;
    height: 180px;
    border-radius: 999px;
    background: rgba(243, 178, 60, 0.2);
    pointer-events: none;
  }

  .notes-hero-icon {
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(145deg, var(--canopy), var(--leaf));
    box-shadow: 0 12px 28px rgba(31, 95, 69, 0.2);
  }

  .notes-hero-icon {
    width: 58px;
    height: 58px;
    border-radius: 20px;
  }

  .notes-hero-copy {
    min-width: 0;
  }

  .notes-hero-copy h1 {
    margin: 3px 0 8px;
    color: var(--canopy);
    font-size: clamp(2rem, 7vw, 3.2rem);
    line-height: 0.95;
    letter-spacing: 0;
  }

  .notes-hero-copy p:last-child {
    max-width: 620px;
    margin: 0;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.55;
  }

  .notes-hero-count {
    grid-column: 1 / -1;
    width: max-content;
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(47, 143, 99, 0.1);
    color: var(--canopy);
    font-weight: 850;
  }

  .notes-hero-count strong {
    font-size: 1.05rem;
  }

  .notes-hero-count span {
    color: var(--muted);
    font-size: 0.82rem;
  }

  .notes-editor-card {
    padding: clamp(16px, 4vw, 24px);
    border-radius: 26px;
    position: relative;
  }

  .notes-editor-card::after {
    content: "";
    position: absolute;
    right: clamp(18px, 4vw, 28px);
    bottom: -26px;
    left: clamp(18px, 4vw, 28px);
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(31, 95, 69, 0.22), transparent);
  }

  .notes-form {
    display: grid;
    gap: 16px;
  }

  .notes-form-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .notes-form-header h2,
  .section-heading h2 {
    margin: 0;
    color: var(--canopy);
    font-size: 1.25rem;
    letter-spacing: 0;
  }

  .notes-form-header p {
    margin: 5px 0 0;
    color: var(--muted);
    line-height: 1.45;
  }

  .notes-field {
    display: grid;
    gap: 8px;
    color: var(--soil);
    font-size: 0.86rem;
    font-weight: 850;
  }

  .notes-field input,
  .notes-field textarea {
    width: 100%;
    border: 1px solid rgba(31, 95, 69, 0.14);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.94);
    color: var(--ink);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .notes-field input {
    min-height: 52px;
    padding: 0 15px;
  }

  .notes-field textarea {
    min-height: 104px;
    padding: 14px 15px;
    line-height: 1.55;
    resize: vertical;
  }

  .notes-field input:focus,
  .notes-field textarea:focus {
    border-color: rgba(47, 143, 99, 0.62);
    background: #fff;
    box-shadow: 0 0 0 4px rgba(47, 143, 99, 0.12);
  }

  .notes-submit-button,
  .notes-ghost-button,
  .notes-danger-button {
    min-height: 46px;
    border-radius: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid transparent;
    padding: 0 16px;
    font-weight: 900;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .notes-submit-button:hover,
  .notes-ghost-button:hover,
  .notes-danger-button:hover {
    transform: translateY(-1px);
  }

  .notes-submit-button {
    width: 100%;
    background: linear-gradient(135deg, var(--canopy), var(--leaf));
    color: #fff;
    box-shadow: 0 14px 30px rgba(31, 95, 69, 0.22);
  }

  .notes-submit-button:disabled {
    cursor: not-allowed;
    opacity: 0.72;
    transform: none;
  }

  .notes-ghost-button {
    background: rgba(31, 95, 69, 0.08);
    color: var(--canopy);
  }

  .notes-danger-button {
    background: rgba(185, 79, 67, 0.1);
    color: var(--danger);
  }

  .notes-list-section {
    display: grid;
    gap: 16px;
    margin-top: 8px;
    padding: clamp(16px, 4vw, 22px);
    border-radius: 26px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .notes-search {
    min-height: 48px;
    border: 1px solid rgba(31, 95, 69, 0.14);
    border-radius: 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    background: rgba(255, 255, 255, 0.82);
    color: var(--muted);
  }

  .notes-search input {
    min-height: 46px;
    width: 100%;
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--ink);
    outline: none;
  }

  .notes-search:focus-within {
    border-color: rgba(47, 143, 99, 0.62);
    box-shadow: 0 0 0 4px rgba(47, 143, 99, 0.12);
  }

  .notes-grid {
    display: grid;
    gap: 14px;
  }

  .note-card {
    display: grid;
    gap: 12px;
    padding: 18px;
    border-radius: 22px;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .note-card-pinned {
    border-color: rgba(47, 143, 99, 0.26);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 248, 243, 0.95));
  }

  .note-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 22px 56px rgba(37, 69, 52, 0.16);
  }

  .note-card-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .note-card small {
    display: block;
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 750;
  }

  .note-content {
    margin: 0;
    color: var(--soil);
    font-size: 1rem;
    font-weight: 800;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .note-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .note-action-button {
    min-height: 36px;
    border-radius: 12px;
    padding: 0 12px;
    font-size: 0.8rem;
  }

  .notes-empty-state {
    min-height: 148px;
    border-radius: 22px;
    display: grid;
    place-items: center;
    gap: 8px;
    padding: 24px;
    color: var(--muted);
    text-align: center;
    font-weight: 850;
  }

  .notes-empty-state svg {
    color: var(--leaf);
  }

  @media (min-width: 720px) {
    .notes-page {
      gap: 26px;
    }

    .notes-hero {
      grid-template-columns: auto 1fr auto;
    }

    .notes-hero-count {
      grid-column: auto;
      justify-self: end;
    }

    .notes-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .notes-hero {
      align-items: start;
    }

    .notes-form-header,
    .section-heading {
      align-items: flex-start;
    }

    .notes-form-header {
      flex-direction: column;
    }

    .notes-form-header .notes-ghost-button {
      width: 100%;
    }

    .note-actions {
      justify-content: stretch;
    }

    .note-action-button {
      flex: 1 1 0;
      min-width: 0;
    }
  }
`;

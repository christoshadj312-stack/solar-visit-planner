import { CalendarCheck, Check, CheckSquare, Clock, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { useCustomers } from "../hooks/useCustomers.js";
import { supabase } from "../services/supabaseClient.js";
import {
  formatAppointmentDate,
  getNextAppointment,
  getOverdueFollowUps,
  getTodayAppointments
} from "../utils/customerInsights.js";

export function DashboardPage() {
  const { session } = useAuth();
  const { customers, loading, error } = useCustomers();

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskError, setTaskError] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    loadTasks();
  }, [session?.user?.id]);

  async function loadTasks() {
    if (!session?.user?.id) {
      setTasks([]);
      setTasksLoading(false);
      return;
    }

    setTasksLoading(true);
    setTaskError("");

    const { data, error } = await supabase
      .from("dashboard_tasks")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setTaskError(error.message);
      setTasksLoading(false);
      return;
    }

    setTasks(data || []);
    setTasksLoading(false);
  }

  async function addTask(event) {
    event.preventDefault();

    const title = newTaskTitle.trim();
    if (!title || !session?.user?.id) return;

    setTaskError("");

    const { data, error } = await supabase
      .from("dashboard_tasks")
      .insert({
        user_id: session.user.id,
        title,
        completed: false
      })
      .select()
      .single();

    if (error) {
      setTaskError(error.message);
      return;
    }

    setTasks([data, ...tasks]);
    setNewTaskTitle("");
  }

  function startEditing(task) {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
  }

  async function saveEditedTask(taskId) {
    const title = editingTitle.trim();
    if (!title) return;

    setTaskError("");

    const { data, error } = await supabase
      .from("dashboard_tasks")
      .update({ title })
      .eq("id", taskId)
      .eq("user_id", session.user.id)
      .select()
      .single();

    if (error) {
      setTaskError(error.message);
      return;
    }

    setTasks(tasks.map((task) => (task.id === taskId ? data : task)));
    setEditingTaskId(null);
    setEditingTitle("");
  }

  function cancelEditing() {
    setEditingTaskId(null);
    setEditingTitle("");
  }

  async function toggleTask(taskId) {
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) return;

    const nextCompleted = !currentTask.completed;

    setTaskError("");

    const { data, error } = await supabase
      .from("dashboard_tasks")
      .update({
        completed: nextCompleted,
        completed_at: nextCompleted ? new Date().toISOString() : null
      })
      .eq("id", taskId)
      .eq("user_id", session.user.id)
      .select()
      .single();

    if (error) {
      setTaskError(error.message);
      return;
    }

    setTasks(tasks.map((task) => (task.id === taskId ? data : task)));
  }

  async function deleteTask(taskId) {
    setTaskError("");

    const { error } = await supabase
      .from("dashboard_tasks")
      .delete()
      .eq("id", taskId)
      .eq("user_id", session.user.id);

    if (error) {
      setTaskError(error.message);
      return;
    }

    setTasks(tasks.filter((task) => task.id !== taskId));
  }

  if (loading) return <div className="page-loader">Loading dashboard...</div>;
  if (error) return <p className="form-error">{error}</p>;

  const todayAppointments = getTodayAppointments(customers);
  const nextAppointment = getNextAppointment(customers);
  const overdueFollowUps = getOverdueFollowUps(customers);
  const aiSuggestions = buildAiSuggestions({ todayAppointments, overdueFollowUps, nextAppointment });
  const suggestedTasks = buildSuggestedTasks({ todayAppointments, overdueFollowUps });

  return (
    <section className="workspace-page">
      <header className="workspace-header">
        <div>
          <p>Production dashboard</p>
          <h1>Dashboard</h1>
        </div>
      </header>

      <div className="dashboard-grid">
        <DashboardPanel icon={CalendarCheck} title="Ραντεβού σήμερα">
          {todayAppointments.length ? (
            <ul className="compact-list">
              {todayAppointments.slice(0, 5).map((customer) => (
                <li key={customer.id}>
                  <Link to={`/customers/${customer.id}`}>
                    <strong>{customer.appointment_time}</strong>
                    <span>{customer.full_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">Δεν υπάρχουν ραντεβού σήμερα.</p>
          )}
        </DashboardPanel>

        <DashboardPanel icon={Clock} title="Επόμενο ραντεβού">
          {nextAppointment ? (
            <Link className="next-appointment-card" to={`/customers/${nextAppointment.id}`}>
              <strong>{nextAppointment.full_name}</strong>
              <span>{formatAppointmentDate(nextAppointment)}</span>
              <small>{nextAppointment.address}</small>
            </Link>
          ) : (
            <p className="muted-copy">Δεν υπάρχει επόμενο ραντεβού.</p>
          )}
        </DashboardPanel>

        <DashboardPanel icon={Sparkles} title="AI προτάσεις ημέρας">
          <ul className="plain-task-list">
            {aiSuggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </DashboardPanel>

        <DashboardPanel icon={CheckSquare} title="Σύντομη λίστα εργασιών">
          <form className="dashboard-task-form" onSubmit={addTask}>
            <input
              type="text"
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Προσθήκη νέας εργασίας"
              aria-label="Προσθήκη νέας εργασίας"
            />
            <button className="icon-button" type="submit" aria-label="Προσθήκη εργασίας">
              <Plus size={18} />
            </button>
          </form>

          {taskError ? <p className="form-error">{taskError}</p> : null}

          {tasksLoading ? (
            <p className="muted-copy">Φόρτωση εργασιών...</p>
          ) : tasks.length ? (
            <ul className="editable-task-list">
              {tasks.map((task) => {
                const isEditing = editingTaskId === task.id;

                return (
                  <li className={task.completed ? "is-completed" : ""} key={task.id}>
                    <button
                      className="task-complete-button"
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      aria-label={task.completed ? "Σήμανση ως εκκρεμές" : "Σήμανση ως ολοκληρωμένο"}
                    >
                      {task.completed ? <Check size={16} /> : null}
                    </button>

                    {isEditing ? (
                      <input
                        className="task-edit-input"
                        type="text"
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveEditedTask(task.id);
                          if (event.key === "Escape") cancelEditing();
                        }}
                        aria-label="Επεξεργασία εργασίας"
                        autoFocus
                      />
                    ) : (
                      <span>{task.title}</span>
                    )}

                    <div className="task-actions">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={() => saveEditedTask(task.id)} aria-label="Αποθήκευση εργασίας">
                            <Check size={16} />
                          </button>
                          <button type="button" onClick={cancelEditing} aria-label="Ακύρωση επεξεργασίας">
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEditing(task)} aria-label="Επεξεργασία εργασίας">
                            <Pencil size={16} />
                          </button>
                          <button type="button" onClick={() => deleteTask(task.id)} aria-label="Διαγραφή εργασίας">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="dashboard-task-empty">
              <p>Δεν υπάρχουν αποθηκευμένες εργασίες.</p>
              <span>Προτάσεις ημέρας:</span>
              <ul className="plain-task-list">
                {suggestedTasks.map((task) => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
            </div>
          )}
        </DashboardPanel>

      </div>
    </section>
  );
}

function DashboardPanel({ icon: Icon, title, children }) {
  return (
    <article className="workspace-panel dashboard-panel">
      <h2>
        <Icon size={20} />
        {title}
      </h2>
      {children}
    </article>
  );
}

function buildAiSuggestions({ todayAppointments, overdueFollowUps, nextAppointment }) {
  const suggestions = [];

  if (nextAppointment) suggestions.push(`Προετοίμασε σημειώσεις για ${nextAppointment.full_name}.`);
  if (todayAppointments.length > 1) suggestions.push("Έλεγξε τη σειρά διαδρομής πριν ξεκινήσεις.");
  if (overdueFollowUps.length) suggestions.push(`Κλείσε ${overdueFollowUps.length} καθυστερημένα follow-ups.`);
  if (!suggestions.length) suggestions.push("Δεν υπάρχουν κρίσιμες προτάσεις για σήμερα.");

  return suggestions;
}

function buildSuggestedTasks({ todayAppointments, overdueFollowUps }) {
  return [
    `${todayAppointments.length} σημερινά ραντεβού για έλεγχο`,
    `${overdueFollowUps.length} follow-ups σε εκκρεμότητα`,
    "Έλεγχος φωτογραφιών στέγης πριν την επίσκεψη",
    "Ενημέρωση status μετά από κάθε ραντεβού"
  ];
}
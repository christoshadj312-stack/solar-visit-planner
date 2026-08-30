import {
  MessageCircle,
  Paperclip,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listSmsDashboardMessages } from "../../services/smsDashboardService.js";
import { supabase } from "../../services/supabaseClient.js";

const QUICK_ACTIONS = [
  "Τι έχω σήμερα;",
  "Τι έχω αύριο;",
  "Ποιος είναι ο επόμενος πελάτης;",
  "Πόσα SMS απέτυχαν;",
  "Βρες μου πελάτη",
  "Άνοιξε SMS Center",
];

const NAVIGATION_INTENTS = [
  "ανοιξε",
  "πηγαινε",
  "δειξε",
  "με πηγαινε",
  "open",
  "go to",
  "show",
];

const HELIOS_NAVIGATION_COMMANDS = [
  {
    to: "/appointments",
    label: "τα Ραντεβού για να δημιουργήσεις νέο ραντεβού",
    aliases: [
      "νεο ραντεβου",
      "νεο πελατη",
      "νεος πελατης",
      "new appointment",
      "new customer",
    ],
  },
  {
    to: "/appointments?status=cancelled",
    label: "τα ακυρωμένα ραντεβού",
    aliases: [
      "ακυρωμενα",
      "ακυρωμενα ραντεβου",
      "cancelled",
      "cancelled appointments",
    ],
  },
  {
    to: "/daily-summary",
    label: "το Daily Summary",
    aliases: [
      "daily summary",
      "ημερησια περιληψη",
      "σημερινη περιληψη",
      "daily",
    ],
  },
  {
    to: "/optimize-route",
    label: "το Optimize Route",
    aliases: [
      "optimize route",
      "route",
      "διαδρομη",
      "βελτιστοποιηση διαδρομης",
      "βελτιστοποιηση",
    ],
  },
  {
    to: "/sms-replies",
    label: "το SMS Center",
    aliases: [
      "sms",
      "sms center",
      "μηνυματα",
      "μηνυματων",
      "απαντησεις sms",
      "message center",
    ],
  },
  {
    to: "/reports",
    label: "τα Reports",
    aliases: [
      "reports",
      "αναφορες",
      "στατιστικα",
    ],
  },
  {
    to: "/customers",
    label: "τους πελάτες",
    aliases: [
      "πελατες",
      "customers",
      "λιστα πελατων",
    ],
  },
  {
    to: "/settings",
    label: "τις Ρυθμίσεις",
    aliases: [
      "settings",
      "ρυθμισεις",
    ],
  },
  {
    to: "/overtime",
    label: "τις Υπερωρίες",
    aliases: [
      "overtime",
      "υπερωριες",
    ],
  },
  {
    to: "/share-appointments",
    label: "το Share Appointments",
    aliases: [
      "share appointments",
      "κοινοποιηση ραντεβου",
      "μοιρασμα ραντεβου",
    ],
  },
  {
    to: "/appointments",
    label: "τα Ραντεβού",
    aliases: [
      "ραντεβου",
      "appointments",
      "calendar",
      "ημερολογιο",
    ],
  },
];

const HELIOS_CUSTOMER_SELECT = [
  "id",
  "full_name",
  "address",
  "phone",
  "status",
  "appointment_date",
  "appointment_time",
  "latitude",
  "longitude",
].join(",");

const MAX_CONTEXT_MESSAGES = 12;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.82;

export function HeliosFloatingAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [heliosPosition, setHeliosPosition] = useState(() => {
    if (typeof window === "undefined") return null;

    try {
      const saved = localStorage.getItem("helios-floating-position");
      if (!saved) return null;

      const parsed = JSON.parse(saved);

      if (
        Number.isFinite(parsed?.left) &&
        Number.isFinite(parsed?.top)
      ) {
        return {
          left: parsed.left,
          top: parsed.top,
        };
      }
    } catch {
      // Ignore invalid saved position.
    }

    return null;
  });

  const dragStateRef = useRef({
    dragging: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    buttonWidth: 58,
    buttonHeight: 58,
    lastPosition: null,
  });

  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, open]);

  useEffect(() => {
    if (!heliosPosition || typeof window === "undefined") return undefined;

    function keepHeliosInsideViewport() {
      const nextPosition = clampHeliosPosition(
        heliosPosition.left,
        heliosPosition.top,
        58,
        58
      );

      if (
        nextPosition.left !== heliosPosition.left ||
        nextPosition.top !== heliosPosition.top
      ) {
        setHeliosPosition(nextPosition);
        localStorage.setItem(
          "helios-floating-position",
          JSON.stringify(nextPosition)
        );
      }
    }

    keepHeliosInsideViewport();
    window.addEventListener("resize", keepHeliosInsideViewport);

    return () => {
      window.removeEventListener("resize", keepHeliosInsideViewport);
    };
  }, [heliosPosition]);

  async function sendMessage(messageText = input) {
    const message = String(messageText || "").trim();
    const imageToSend = selectedImage;

    if ((!message && !imageToSend) || loading || imageLoading) return;

    if (message && !imageToSend && runNavigationCommand(message)) {
      return;
    }

    if (message && !imageToSend && resolveHeliosReadOnlyCommand(message)) {
      await runReadOnlyCommand(message);
      return;
    }

    setError("");
    setInput("");
    setSelectedImage(null);
    setLoading(true);

    const userMessage = {
      id: createMessageId(),
      role: "user",
      text: message || "Ανάλυσε αυτή τη φωτογραφία.",
      imagePreview: imageToSend?.preview || "",
      imageName: imageToSend?.name || "",
    };

    setMessages((current) => [...current, userMessage]);

    try {
      if (!supabase) {
        throw new Error("Το Supabase δεν είναι ρυθμισμένο για το Helios AI.");
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;

      if (sessionError || !accessToken) {
        throw new Error("Χρειάζεται να συνδεθείς ξανά για να χρησιμοποιήσεις το Helios AI.");
      }

      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: userMessage.text,
          history: buildConversationHistory(messages),
          image: imageToSend
            ? {
                name: imageToSend.name,
                mimeType: imageToSend.mimeType,
                data: imageToSend.data,
              }
            : null,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Το Helios AI δεν μπόρεσε να απαντήσει τώρα.");
      }

      const reply = String(payload.reply || "").trim();

      if (!reply) {
        throw new Error("Το Helios AI επέστρεψε κενή απάντηση.");
      }

      setMessages((current) => [
        ...current,
        { id: createMessageId(), role: "assistant", text: reply },
      ]);
    } catch (requestError) {
      setError(requestError.message || "Το Helios AI δεν μπόρεσε να απαντήσει τώρα.");
    } finally {
      setLoading(false);
    }
  }

  function runNavigationCommand(commandText) {
    const command = resolveHeliosNavigationCommand(commandText);

    if (!command) {
      return false;
    }

    const userMessage = {
      id: createMessageId(),
      role: "user",
      text: commandText,
      imagePreview: "",
      imageName: "",
    };

    const assistantMessage = {
      id: createMessageId(),
      role: "assistant",
      text: `Άνοιξα ${command.label}.`,
    };

    const targetPath =
      typeof command.to === "function" ? command.to() : command.to;

    setError("");
    setInput("");
    setSelectedImage(null);
    setOpen(true);
    setMessages((current) => [...current, userMessage, assistantMessage]);

    navigate(targetPath);

    window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }, 80);

    return true;
  }

  async function runReadOnlyCommand(commandText) {
    const command = resolveHeliosReadOnlyCommand(commandText);

    if (!command) {
      return false;
    }

    const userMessage = {
      id: createMessageId(),
      role: "user",
      text: commandText,
      imagePreview: "",
      imageName: "",
    };

    setError("");
    setInput("");
    setSelectedImage(null);
    setOpen(true);
    setLoading(true);
    setMessages((current) => [...current, userMessage]);

    try {
      let reply = "";

      if (command.type === "appointments_date") {
        reply = await buildAppointmentsForDateReply(command.date, command.label);
      }

      if (command.type === "appointments_range") {
        reply = await buildAppointmentsForRangeReply(
          command.startDate,
          command.endDate,
          command.label
        );
      }

      if (command.type === "next_appointment") {
        reply = await buildNextAppointmentReply();
      }

      if (command.type === "failed_sms") {
        reply = await buildFailedSmsReply();
      }

      if (command.type === "search_customer") {
        reply = await buildCustomerSearchReply(command.query);
      }

      if (!reply) {
        reply = "Δεν βρήκα κάτι για αυτό το αίτημα.";
      }

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          text: reply,
        },
      ]);
    } catch (readError) {
      setError(
        readError.message ||
          "Δεν μπόρεσα να διαβάσω τα δεδομένα της εφαρμογής τώρα."
      );
    } finally {
      setLoading(false);
    }

    return true;
  }

  function clampHeliosPosition(left, top, buttonWidth = 58, buttonHeight = 58) {
    if (typeof window === "undefined") {
      return { left, top };
    }

    const margin = 10;
    const maxLeft = Math.max(margin, window.innerWidth - buttonWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - buttonHeight - margin);

    return {
      left: Math.min(Math.max(left, margin), maxLeft),
      top: Math.min(Math.max(top, margin), maxTop),
    };
  }

  function handleHeliosPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();

    dragStateRef.current = {
      dragging: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      buttonWidth: rect.width || 58,
      buttonHeight: rect.height || 58,
      lastPosition: {
        left: rect.left,
        top: rect.top,
      },
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleHeliosPointerMove(event) {
    const drag = dragStateRef.current;

    if (!drag.dragging || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (!drag.moved && Math.hypot(deltaX, deltaY) < 6) {
      return;
    }

    drag.moved = true;

    const nextPosition = clampHeliosPosition(
      drag.startLeft + deltaX,
      drag.startTop + deltaY,
      drag.buttonWidth,
      drag.buttonHeight
    );

    drag.lastPosition = nextPosition;
    setHeliosPosition(nextPosition);
  }

  function handleHeliosPointerUp(event) {
    const drag = dragStateRef.current;

    if (!drag.dragging || drag.pointerId !== event.pointerId) return;

    drag.dragging = false;

    if (drag.moved && drag.lastPosition) {
      localStorage.setItem(
        "helios-floating-position",
        JSON.stringify(drag.lastPosition)
      );
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleHeliosPointerCancel(event) {
    const drag = dragStateRef.current;

    if (drag.pointerId === event.pointerId) {
      drag.dragging = false;
      drag.moved = false;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleHeliosClick() {
    if (dragStateRef.current.moved) {
      dragStateRef.current.moved = false;
      return;
    }

    setOpen((current) => !current);
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(input);
  }

  function handleQuickAction(action) {
    sendMessage(action);
  }

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setError("");
    setImageLoading(true);

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Μπορείς να ανεβάσεις μόνο εικόνα.");
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error("Η φωτογραφία είναι πολύ μεγάλη. Δοκίμασε μικρότερη εικόνα.");
      }

      const image = await resizeImageForHelios(file);
      setSelectedImage(image);
      setOpen(true);
      window.setTimeout(() => inputRef.current?.focus(), 80);
    } catch (imageError) {
      setSelectedImage(null);
      setError(imageError.message || "Δεν μπόρεσα να φορτώσω τη φωτογραφία.");
    } finally {
      setImageLoading(false);
    }
  }

  function removeSelectedImage() {
    setSelectedImage(null);
  }

  const canSend = Boolean(input.trim() || selectedImage) && !loading && !imageLoading;

  return (
    <div
      className={`helios-assistant${heliosPosition ? " is-custom-position" : ""}`}
      style={
        heliosPosition
          ? {
              left: `${heliosPosition.left}px`,
              top: `${heliosPosition.top}px`,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
    >
      {open ? (
        <button
          type="button"
          className="helios-click-guard"
          aria-label="Κλείσιμο Helios AI"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {open ? (
        <section
          className="helios-chat-panel"
          role="dialog"
          aria-label="Helios AI"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="helios-chat-header">
            <div className="helios-chat-title">
              <strong>Helios AI</strong>
              <span>
                <i aria-hidden="true" />
                PV chat • Photo advice
              </span>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Κλείσιμο Helios AI"
            >
              <X size={19} />
            </button>
          </header>

          <div className="helios-chat-body">
            <MessageRow role="assistant">
              <p>Γεια σου Χρήστο!</p>

              <p>
                Είμαι ο <strong>Helios AI</strong>. Μπορώ να βοηθήσω με
                το πρόγραμμά σου, αναζήτηση πελατών και πρακτικές ερωτήσεις
                για φωτοβολταϊκά, inverter, μπαταρίες, καλώδια DC/AC,
                προστασίες, σκιάσεις και κουτιά ΑΗΚ.
              </p>

              <p>
                Ρώτα με π.χ. «τι έχω σήμερα;», «ποιος είναι ο επόμενος πελάτης;»
                ή «βρες μου τον πελάτη Ανδρέα». Μπορείς επίσης να μου στείλεις
                φωτογραφία στέγης, σκίασης, εξοπλισμού ή κουτιού ΑΗΚ για αρχική
                συμβουλή. Δεν αντικαθιστώ τελικό έλεγχο ηλεκτρολόγου ή ΑΗΚ.
              </p>
            </MessageRow>

            <div className="helios-quick-actions" aria-label="Γρήγορες ενέργειες Helios AI">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => handleQuickAction(action)}
                  disabled={loading}
                >
                  {action}
                </button>
              ))}
            </div>

            {messages.map((message) => (
              <MessageRow key={message.id} role={message.role}>
                {message.imagePreview ? (
                  <figure className="helios-message-image">
                    <img src={message.imagePreview} alt={message.imageName || "Φωτογραφία"} />
                    {message.imageName ? <figcaption>{message.imageName}</figcaption> : null}
                  </figure>
                ) : null}
                <MarkdownContent text={message.text} />
              </MessageRow>
            ))}

            {loading ? (
              <MessageRow role="assistant" tone="loading">
                <span>Ο Helios σκέφτεται</span>
                <span className="helios-typing-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </MessageRow>
            ) : null}

            {error ? <p className="helios-error">{error}</p> : null}

            <div ref={messagesEndRef} className="helios-scroll-anchor" />
          </div>

          <form className="helios-chat-input" onSubmit={handleSubmit}>
            {selectedImage ? (
              <div className="helios-selected-image">
                <img src={selectedImage.preview} alt={selectedImage.name} />
                <div>
                  <strong>{selectedImage.name}</strong>
                  <span>Έτοιμη για ανάλυση</span>
                </div>
                <button
                  type="button"
                  className="helios-remove-image"
                  onClick={removeSelectedImage}
                  aria-label="Αφαίρεση φωτογραφίας"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : null}

            <div className="helios-chat-input-row">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                hidden
              />

              <button
                className="helios-attach-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || imageLoading}
                aria-label="Ανέβασμα φωτογραφίας"
              >
                {imageLoading ? "..." : <Paperclip size={18} />}
              </button>

              <input
                type="text"
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ρώτα για ΦΒ ή στείλε φωτογραφία..."
                aria-label="Μήνυμα προς το Helios AI"
                maxLength={2000}
                disabled={loading}
              />

              <button type="submit" disabled={!canSend}>
                {loading ? "..." : "Αποστολή"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        className="helios-floating-button"
        type="button"
        onPointerDown={handleHeliosPointerDown}
        onPointerMove={handleHeliosPointerMove}
        onPointerUp={handleHeliosPointerUp}
        onPointerCancel={handleHeliosPointerCancel}
        onClick={handleHeliosClick}
        style={{
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          cursor: dragStateRef.current.dragging ? "grabbing" : "grab",
        }}
        aria-label={open ? "Κλείσιμο Helios AI" : "Άνοιγμα Helios AI"}
      >
        {open ? <X size={24} /> : <MessageCircle size={25} />}
      </button>
    </div>
  );
}

function resolveHeliosNavigationCommand(message) {
  const normalizedMessage = normalizeHeliosCommand(message);

  const hasNavigationIntent = NAVIGATION_INTENTS.some((intent) =>
    normalizedMessage.includes(normalizeHeliosCommand(intent))
  );

  if (!hasNavigationIntent) {
    return null;
  }

  return (
    HELIOS_NAVIGATION_COMMANDS.find((command) =>
      command.aliases.some((alias) =>
        normalizedMessage.includes(normalizeHeliosCommand(alias))
      )
    ) || null
  );
}

function resolveHeliosReadOnlyCommand(message) {
  const normalizedMessage = normalizeHeliosCommand(message);

  if (
    normalizedMessage.includes("απετυχ") ||
    normalizedMessage.includes("failed sms") ||
    normalizedMessage.includes("failed messages")
  ) {
    return {
      type: "failed_sms",
    };
  }

  if (
    normalizedMessage.includes("επομεν") &&
    (normalizedMessage.includes("πελατ") ||
      normalizedMessage.includes("ραντεβου") ||
      normalizedMessage.includes("appointment"))
  ) {
    return {
      type: "next_appointment",
    };
  }

  if (
    normalizedMessage.includes("βρες") ||
    normalizedMessage.includes("ψαξε") ||
    normalizedMessage.includes("search") ||
    normalizedMessage.includes("find")
  ) {
    if (
      normalizedMessage.includes("πελατ") ||
      normalizedMessage.includes("customer")
    ) {
      return {
        type: "search_customer",
        query: extractCustomerSearchQuery(message),
      };
    }
  }

  if (
    normalizedMessage.includes("επομενη εβδομαδα") ||
    normalizedMessage.includes("next week") ||
    normalizedMessage.includes("εβδομαδας")
  ) {
    return {
      type: "appointments_range",
      startDate: addDaysIso(1),
      endDate: addDaysIso(7),
      label: "τις επόμενες 7 ημέρες",
    };
  }

  if (normalizedMessage.includes("μεθαυριο")) {
    return {
      type: "appointments_date",
      date: addDaysIso(2),
      label: "μεθαύριο",
    };
  }

  if (
    normalizedMessage.includes("αυριο") ||
    normalizedMessage.includes("tomorrow")
  ) {
    return {
      type: "appointments_date",
      date: addDaysIso(1),
      label: "αύριο",
    };
  }

  if (
    normalizedMessage.includes("σημερα") ||
    normalizedMessage.includes("today")
  ) {
    return {
      type: "appointments_date",
      date: getTodayIsoDate(),
      label: "σήμερα",
    };
  }

  return null;
}

function normalizeHeliosCommand(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?;:()[\]{}"'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function buildAppointmentsForDateReply(date, label) {
  assertHeliosSupabase();

  const { data, error } = await supabase
    .from("customers")
    .select(HELIOS_CUSTOMER_SELECT)
    .eq("appointment_date", date)
    .eq("status", "Scheduled")
    .order("appointment_time", { ascending: true })
    .limit(30);

  if (error) throw error;

  const appointments = data || [];

  if (appointments.length === 0) {
    return `Δεν βρήκα προγραμματισμένα ραντεβού για ${label}.`;
  }

  return [
    `Για ${label} έχεις ${appointments.length} προγραμματισμένα ραντεβού:`,
    "",
    ...appointments.map((customer, index) =>
      `${index + 1}. ${formatHeliosTime(customer.appointment_time)} — ${getHeliosCustomerName(
        customer
      )}${customer.address ? `\n   ${customer.address}` : ""}`
    ),
  ].join("\n");
}

async function buildAppointmentsForRangeReply(startDate, endDate, label) {
  assertHeliosSupabase();

  const { data, error } = await supabase
    .from("customers")
    .select(HELIOS_CUSTOMER_SELECT)
    .gte("appointment_date", startDate)
    .lte("appointment_date", endDate)
    .eq("status", "Scheduled")
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true })
    .limit(50);

  if (error) throw error;

  const appointments = data || [];

  if (appointments.length === 0) {
    return `Δεν βρήκα προγραμματισμένα ραντεβού για ${label}.`;
  }

  return [
    `Για ${label} έχεις ${appointments.length} προγραμματισμένα ραντεβού:`,
    "",
    ...appointments.map((customer, index) =>
      `${index + 1}. ${formatHeliosDate(customer.appointment_date)} ${formatHeliosTime(
        customer.appointment_time
      )} — ${getHeliosCustomerName(customer)}${
        customer.address ? `\n   ${customer.address}` : ""
      }`
    ),
  ].join("\n");
}

async function buildNextAppointmentReply() {
  assertHeliosSupabase();

  const today = getTodayIsoDate();

  const { data, error } = await supabase
    .from("customers")
    .select(HELIOS_CUSTOMER_SELECT)
    .gte("appointment_date", today)
    .eq("status", "Scheduled")
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true })
    .limit(40);

  if (error) throw error;

  const now = new Date();

  const nextAppointment = (data || [])
    .map((customer) => ({
      customer,
      dateTime: buildCustomerDateTime(customer),
    }))
    .filter((item) => item.dateTime && item.dateTime.getTime() >= now.getTime())
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())[0]?.customer;

  if (!nextAppointment) {
    return "Δεν βρήκα επόμενο προγραμματισμένο ραντεβού.";
  }

  return [
    "Το επόμενο προγραμματισμένο ραντεβού είναι:",
    "",
    `${formatHeliosDate(nextAppointment.appointment_date)} ${formatHeliosTime(
      nextAppointment.appointment_time
    )}`,
    getHeliosCustomerName(nextAppointment),
    nextAppointment.phone ? `Τηλέφωνο: ${nextAppointment.phone}` : "",
    nextAppointment.address ? `Διεύθυνση: ${nextAppointment.address}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildFailedSmsReply() {
  const { jobs, summary } = await listSmsDashboardMessages({
    status: "failed",
    limit: 10,
  });

  const failedCount = summary?.failed || jobs.length || 0;

  if (!failedCount) {
    return "Δεν βλέπω αποτυχημένα SMS αυτή τη στιγμή.";
  }

  return [
    `Βρήκα ${failedCount} αποτυχημένα SMS.`,
    "",
    ...(jobs || []).slice(0, 10).map((job, index) => {
      const customerName =
        job.customerName || job.customer_name || job.full_name || "Πελάτης";
      const phone = job.phone || job.recipientPhone || job.recipient_phone || "";
      const date = job.appointmentDate || job.appointment_date || "";
      const time = job.appointmentTime || job.appointment_time || "";

      return `${index + 1}. ${customerName}${phone ? ` — ${phone}` : ""}${
        date || time ? `\n   ${date} ${time}` : ""
      }`;
    }),
    "",
    "Μπορείς να τα δεις από το SMS Center.",
  ].join("\n");
}

async function buildCustomerSearchReply(query) {
  assertHeliosSupabase();

  const cleanQuery = String(query || "").trim();

  if (!cleanQuery) {
    return "Γράψε μου το όνομα ή μέρος του ονόματος. Παράδειγμα: «Βρες μου πελάτη Ανδρέα».";
  }

  const digits = cleanQuery.replace(/\D/g, "");

  let request = supabase
    .from("customers")
    .select(HELIOS_CUSTOMER_SELECT)
    .order("appointment_date", { ascending: false })
    .order("appointment_time", { ascending: false })
    .limit(8);

  if (digits.length >= 4) {
    request = request.ilike("phone", `%${digits}%`);
  } else {
    request = request.ilike("full_name", `%${cleanQuery}%`);
  }

  const { data, error } = await request;

  if (error) throw error;

  const customers = data || [];

  if (customers.length === 0) {
    return `Δεν βρήκα πελάτη με αναζήτηση: ${cleanQuery}.`;
  }

  return [
    `Βρήκα ${customers.length} αποτέλεσμα/α για "${cleanQuery}":`,
    "",
    ...customers.map((customer, index) =>
      [
        `${index + 1}. ${getHeliosCustomerName(customer)}`,
        customer.phone ? `   Τηλέφωνο: ${customer.phone}` : "",
        customer.appointment_date || customer.appointment_time
          ? `   Ραντεβού: ${formatHeliosDate(
              customer.appointment_date
            )} ${formatHeliosTime(customer.appointment_time)}`
          : "",
        customer.status ? `   Status: ${customer.status}` : "",
        customer.address ? `   ${customer.address}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ].join("\n");
}

function extractCustomerSearchQuery(message) {
  return String(message || "")
    .replace(/βρες/gi, "")
    .replace(/ψαξε/gi, "")
    .replace(/ψάξε/gi, "")
    .replace(/μου/gi, "")
    .replace(/τον/gi, "")
    .replace(/την/gi, "")
    .replace(/πελατη/gi, "")
    .replace(/πελάτη/gi, "")
    .replace(/customer/gi, "")
    .replace(/search/gi, "")
    .replace(/find/gi, "")
    .trim();
}

function getTodayIsoDate() {
  return addDaysIso(0);
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildCustomerDateTime(customer) {
  const date = String(customer?.appointment_date || "").trim();
  const time = String(customer?.appointment_time || "00:00").trim();

  if (!date) return null;

  const [year, month, day] = date.split("-").map(Number);
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})/);

  if (!year || !month || !day || !timeMatch) return null;

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function formatHeliosDate(date) {
  const value = String(date || "").trim();

  if (!value) return "";

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) return value;

  return `${String(day).padStart(2, "0")}/${String(month).padStart(
    2,
    "0"
  )}/${year}`;
}

function formatHeliosTime(time) {
  return String(time || "").trim().slice(0, 5) || "χωρίς ώρα";
}

function getHeliosCustomerName(customer) {
  return String(customer?.full_name || customer?.customerName || "Πελάτης").trim();
}

function assertHeliosSupabase() {
  if (!supabase) {
    throw new Error("Το Supabase δεν είναι διαθέσιμο αυτή τη στιγμή.");
  }
}

function MessageRow({ role, tone = "", children }) {
  const avatar = role === "user" ? "👤" : "🤖";

  return (
    <div className={`helios-message-row is-${role}${tone ? ` is-${tone}` : ""}`}>
      <span className="helios-avatar" aria-hidden="true">
        {avatar}
      </span>
      <div className={`helios-message is-${role}${tone ? ` is-${tone}` : ""}`}>
        {children}
      </div>
    </div>
  );
}

function MarkdownContent({ text }) {
  return <>{parseMarkdownBlocks(text)}</>;
}

function buildConversationHistory(messages) {
  return messages
    .filter((message) => message?.role === "user" || message?.role === "assistant")
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.role,
      text: String(message.text || "").slice(0, 1200),
    }))
    .filter((message) => message.text.trim());
}

function createMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function resizeImageForHelios(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Δεν μπόρεσα να διαβάσω τη φωτογραφία."));

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => reject(new Error("Η φωτογραφία δεν μπορεί να ανοιχτεί."));

      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Δεν μπόρεσα να επεξεργαστώ τη φωτογραφία."));
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        const data = dataUrl.split(",")[1] || "";

        if (!data) {
          reject(new Error("Δεν μπόρεσα να προετοιμάσω τη φωτογραφία."));
          return;
        }

        resolve({
          name: file.name || "photo.jpg",
          mimeType: "image/jpeg",
          data,
          preview: dataUrl,
        });
      };

      img.src = String(reader.result || "");
    };

    reader.readAsDataURL(file);
  });
}

function parseMarkdownBlocks(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const HeadingTag = `h${Math.min(level + 2, 5)}`;
      blocks.push(
        <HeadingTag key={`heading-${index}`}>
          {parseInlineMarkdown(headingMatch[2])}
        </HeadingTag>
      );
      index += 1;
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (unorderedMatch) {
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].trim().match(/^[-*•]\s+(.+)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item.slice(0, 18)}-${itemIndex}`}>{parseInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      const items = [];
      while (index < lines.length) {
        const itemMatch = lines[index].trim().match(/^\d+[.)]\s+(.+)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item.slice(0, 18)}-${itemIndex}`}>{parseInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const paragraphLine = lines[index];
      const paragraphTrimmed = paragraphLine.trim();

      if (!paragraphTrimmed) break;
      if (/^(#{1,3})\s+/.test(paragraphTrimmed)) break;
      if (/^[-*•]\s+/.test(paragraphTrimmed)) break;
      if (/^\d+[.)]\s+/.test(paragraphTrimmed)) break;

      paragraphLines.push(paragraphLine);
      index += 1;
    }

    blocks.push(
      <p key={`p-${index}`}>
        {parseInlineMarkdown(paragraphLines.join("\n"))}
      </p>
    );
  }

  return blocks;
}

function parseInlineMarkdown(text) {
  const nodes = [];
  const pattern = /(\*\*([^*]+)\*\*)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(renderTextWithBreaks(text.slice(lastIndex, match.index), nodes.length));
    }

    if (match[2]) {
      nodes.push(<strong key={`strong-${nodes.length}`}>{renderTextWithBreaks(match[2], nodes.length)}</strong>);
    } else if (match[3] && match[4]) {
      nodes.push(
        <a key={`link-${nodes.length}`} href={match[4]} target="_blank" rel="noreferrer">
          {match[3]}
        </a>
      );
    } else if (match[5]) {
      nodes.push(
        <a key={`url-${nodes.length}`} href={match[5]} target="_blank" rel="noreferrer">
          {match[5]}
        </a>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(renderTextWithBreaks(text.slice(lastIndex), nodes.length));
  }

  return nodes;
}

function renderTextWithBreaks(text, keyPrefix) {
  return String(text)
    .split("\n")
    .flatMap((part, index, parts) => {
      const key = `${keyPrefix}-${index}`;

      if (index === parts.length - 1) {
        return [<span key={key}>{part}</span>];
      }

      return [<span key={key}>{part}</span>, <br key={`${key}-br`} />];
    });
}
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Eye,
  LockKeyhole,
  LogIn,
  Mail,
  MapPin,
  PanelTop
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.jsx";
import { useOnlineStatus } from "../hooks/useOnlineStatus.js";
import { useTranslation } from "../i18n/index.js";
import { isSupabaseConfigured } from "../services/supabaseClient.js";

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(email, password);
      navigate("/today", { replace: true });
    } catch (err) {
      setError(err.message || t("login.unableSignIn"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-brand-hero" aria-label="SolarVisit">
        <div className="login-logo-card">
          <img
            className="login-logo"
            src="/assets/logo/solarvisit-symbol.png"
            alt={t("app.name")}
          />
        </div>

        <div className="login-brand-copy">
          <p className="login-eyebrow">PV Visit Planner</p>

          <h1>{t("app.name")}</h1>

          <p>
            Πρακτικός προγραμματισμός για φωτοβολταϊκά ραντεβού, σχέδια στέγης
            και πλοήγηση.
          </p>
        </div>

        <div className="login-feature-row" aria-label="App features">
          <span>
            <CalendarDays size={16} />
            Ραντεβού
          </span>

          <span>
            <PanelTop size={16} />
            Σχέδια στέγης
          </span>

          <span>
            <MapPin size={16} />
            Πλοήγηση
          </span>
        </div>
      </section>

      <form className="login-panel" onSubmit={handleSubmit}>
        <div className="login-form-header">
          <h2>Σύνδεση</h2>
          <p>Μπες στο πρόγραμμα της ημέρας και στα ραντεβού σου.</p>
        </div>

        {!isSupabaseConfigured ? (
          <p className="config-note">{t("login.supabaseMissing")}</p>
        ) : null}

        {!isOnline ? (
          <p className="offline-login-note">
            Δεν υπάρχει internet. Για νέα σύνδεση χρειάζεται σύνδεση δικτύου.
          </p>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <label>
          {t("login.email")}

          <span className="login-input-wrap">
            <Mail size={19} />
            <input
              type="email"
              placeholder={t("login.email")}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </span>
        </label>

        <label>
          {t("login.password")}

          <span className="login-input-wrap">
            <LockKeyhole size={19} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder={t("login.password")}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <button
              className="login-password-toggle"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label="Εμφάνιση ή απόκρυψη κωδικού"
            >
              <Eye size={19} />
            </button>
          </span>
        </label>

        <button
          className="button button-primary login-submit-button"
          type="submit"
          disabled={loading || !isSupabaseConfigured || !isOnline}
        >
          <LogIn size={22} />
          {loading ? t("login.signingIn") : t("login.signIn")}
        </button>

        <p className="login-access-note">
          Εσωτερική πρόσβαση για SolarVisit.
        </p>
      </form>
    </main>
  );
}
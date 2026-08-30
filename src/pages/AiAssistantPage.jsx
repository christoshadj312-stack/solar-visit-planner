import { Sparkles } from "lucide-react";
import { useTranslation } from "../i18n/index.js";

export function AiAssistantPage() {
  const { t } = useTranslation();
  return (
    <section className="workspace-page ai-assistant-page">
      <header className="workspace-header">
        <div>
          <p>SolarVisit</p>
          <h1>{t("ai.title")}</h1>
        </div>
      </header>

      <div className="workspace-panel ai-assistant-panel">
        <Sparkles size={28} />
        <div>
          <h2>{t("ai.title")}</h2>
          <p>{t("ai.description")}</p>
        </div>
      </div>
    </section>
  );
}
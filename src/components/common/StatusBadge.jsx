import { STATUS_TONE } from "../../config/statuses.js";
import { useTranslation } from "../../i18n/index.js";

export function StatusBadge({ status }) {
  const { t } = useTranslation();

  return (
    <span className="status-badge" data-tone={STATUS_TONE[status] || "green"}>
      {t(`status.${status}`)}
    </span>
  );
}

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus.js";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <WifiOff size={17} />
      <span>
        Δεν υπάρχει σύνδεση. Η εφαρμογή εμφανίζει την τελευταία αποθηκευμένη έκδοση όπου είναι διαθέσιμη.
      </span>
    </div>
  );
}

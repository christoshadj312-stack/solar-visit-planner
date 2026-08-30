import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_CUSTOMERS } from "../demo/demoData.js";
import { listCustomers } from "../services/customerService.js";
import { isSupabaseConfigured } from "../services/supabaseClient.js";
import { isToday } from "../utils/date.js";

export function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (!isSupabaseConfigured) {
        setCustomers(DEMO_CUSTOMERS);
        return;
      }

      const data = await listCustomers();
      setCustomers(data);
    } catch (err) {
      setError(err.message || "Unable to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const todayAppointments = useMemo(
    () => customers.filter((customer) => isToday(customer.appointment_date)),
    [customers]
  );

  const stats = useMemo(
    () => ({
      total: customers.length,
      today: todayAppointments.length,
      scheduled: customers.filter((customer) => customer.status === "Scheduled").length,
      cancelled: customers.filter((customer) => customer.status === "Cancelled").length
    }),
    [customers, todayAppointments.length]
  );

  return { customers, todayAppointments, stats, loading, error, refresh };
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CustomerForm } from "../components/customers/CustomerForm.jsx";
import { getCustomer } from "../services/customerService.js";

export function CustomerFormPage() {
  const { customerId } = useParams();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(Boolean(customerId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!customerId) return;

    getCustomer(customerId)
      .then(setCustomer)
      .catch((err) => setError(err.message || "Unable to load customer"))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="page-loader">Loading customer...</div>;
  if (error) return <p className="form-error">{error}</p>;

  return <CustomerForm customer={customer} />;
}

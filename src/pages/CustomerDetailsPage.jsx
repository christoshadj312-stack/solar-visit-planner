import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { CustomerCard } from "../components/customers/CustomerCard.jsx";
import { useCustomers } from "../hooks/useCustomers.js";

export function CustomerDetailsPage() {
  const { customerId } = useParams();
  const { customers, loading, error } = useCustomers();

  if (loading) return <div className="page-loader">Loading customer...</div>;
  if (error) return <p className="form-error">{error}</p>;

  const customer = customers.find((item) => item.id === customerId);

  if (!customer) {
    return (
      <section className="workspace-page">
        <Link className="button button-light details-back-link" to="/customers">
          <ArrowLeft size={18} />
          Back
        </Link>
        <p className="form-error">Customer not found.</p>
      </section>
    );
  }

  return (
    <section className="workspace-page customer-details-page">
      <Link className="button button-light details-back-link" to="/customers">
        <ArrowLeft size={18} />
        Back
      </Link>
      <CustomerCard customer={customer} />
    </section>
  );
}
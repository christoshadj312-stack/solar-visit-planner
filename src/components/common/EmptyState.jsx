import { Leaf } from "lucide-react";

export function EmptyState({ title, message }) {
  return (
    <section className="panel empty-state">
      <div className="brand-mark">
        <Leaf size={24} />
      </div>
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}

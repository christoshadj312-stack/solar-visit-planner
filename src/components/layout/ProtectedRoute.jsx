import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.jsx";

export function ProtectedRoute({ children }) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <div className="page-loader">Loading planner...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

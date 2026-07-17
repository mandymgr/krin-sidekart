import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { DashboardPage } from "./DashboardPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

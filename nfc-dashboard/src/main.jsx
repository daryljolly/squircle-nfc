import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import NFCDashboard from "./NFCDashboard.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <NFCDashboard />
  </StrictMode>
);

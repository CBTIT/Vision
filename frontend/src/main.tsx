import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext.tsx";

// Handle GitHub Pages 404 redirect - restore the original path that caused the 404
const redirectTo = sessionStorage.getItem("redirectTo");
if (redirectTo) {
  sessionStorage.removeItem("redirectTo");
  // Replace the URL back to what the user tried to visit (without the /Vision/ prefix since basename handles it)
  const pathWithoutBase = redirectTo.replace("/Vision/", "/");
  window.history.replaceState(null, "", pathWithoutBase);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/Vision/">
      <AuthProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

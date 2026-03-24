import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { BrowserRouter } from "react-router-dom";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TooltipProvider>
  </StrictMode>,
);

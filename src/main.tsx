import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import NotchShelf from "./NotchShelf";
import QuickPaste from "./QuickPaste";
import { SettingsProvider } from "./lib/settings-context";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/notch-shelf" element={<NotchShelf />} />
          <Route path="/quick-paste" element={<QuickPaste />} />
        </Routes>
      </BrowserRouter>
    </SettingsProvider>
  </StrictMode>,
);

import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import LandingPage, {
  PricingPage,
  PrivacyPage,
  RefundPage,
  TermsPage,
} from "./LandingPage";
import NotchShelf from "./NotchShelf";
import QuickPaste from "./QuickPaste";
import { SettingsProvider } from "./lib/settings-context";
import "./index.css";

function RootRoute() {
  const isTauri =
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  return isTauri ? <AppShell route={<App />} /> : <LandingPage />;
}

function AppShell({ route }: { route: ReactNode }) {
  return <SettingsProvider>{route}</SettingsProvider>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/app" element={<AppShell route={<App />} />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refund" element={<RefundPage />} />
        <Route path="/notch-shelf" element={<AppShell route={<NotchShelf />} />} />
        <Route path="/quick-paste" element={<AppShell route={<QuickPaste />} />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);

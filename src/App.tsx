import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { APIProvider } from "@vis.gl/react-google-maps";
import { AppProvider, useApp } from "./context/AppContext";
import { Navbar } from "./components/Navbar";
import { HomePage } from "./pages/HomePage";
import { TrackPage } from "./pages/TrackPage";
import { RideStatusPage } from "./pages/RideStatusPage";
import { DriverPage } from "./pages/DriverPage";
import { AdminPage } from "./pages/AdminPage";

function AppShell() {
  const { mapsApiKey, lang, t, quotaExceeded, toast } = useApp();

  const content = (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#fafcfa]">
      {quotaExceeded && (
        <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-900 shadow-sm md:text-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{" "}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-950 underline hover:text-amber-800"
            >
              maps developer site
            </a>{" "}
            for instructions to update your account.
          </span>
        </div>
      )}

      <Navbar />

      <div className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/track" element={<TrackPage />} />
          <Route path="/ride/:code" element={<RideStatusPage />} />
          <Route path="/driver" element={<DriverPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </div>

      <footer className="mt-12 border-t border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-6 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--ink)]">
              {t("brand.name")}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t("brand.tagline")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Link to="/" className="hover:text-[var(--ink)]">
              {t("nav.book")}
            </Link>
            <Link to="/track" className="hover:text-[var(--ink)]">
              {t("nav.track")}
            </Link>
            <Link to="/driver" className="hover:text-[var(--ink)]">
              {t("nav.driver")}
            </Link>
            <Link to="/admin" className="hover:text-[var(--ink)]">
              {t("nav.admin")}
            </Link>
          </div>
        </div>
      </footer>

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-50 rounded-xl bg-[#121714] px-4 py-3 text-center text-xs font-semibold text-white shadow-lg sm:inset-x-auto sm:bottom-5 sm:max-w-sm sm:text-start sm:ltr:right-5 sm:rtl:left-5"
        >
          {toast}
        </div>
      )}
    </div>
  );

  return (
    <BrowserRouter>
      {mapsApiKey ? (
        <APIProvider
          apiKey={mapsApiKey}
          language={lang}
          region="EG"
          libraries={["places", "routes", "marker"]}
        >
          {content}
        </APIProvider>
      ) : (
        content
      )}
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

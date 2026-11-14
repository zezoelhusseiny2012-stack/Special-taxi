import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { useApp } from "../context/AppContext";

export function Navbar() {
  const { lang, setLang, t, user, signIn, logout } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: "/", label: t("nav.book"), end: true },
    { to: "/track", label: t("nav.track"), end: false },
    { to: "/driver", label: t("nav.driver"), end: false },
    { to: "/admin", label: t("nav.admin"), end: false },
  ];

  const handleAuthClick = async () => {
    try {
      if (user) {
        await logout();
      } else {
        await signIn();
      }
    } catch (err) {
      console.error("Authentication error:", err);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 md:gap-8">
        {/* Zone 1: Brand Wordmark */}
        <Link
          to="/"
          className="flex min-w-0 shrink-0 items-center gap-2 whitespace-nowrap text-base font-extrabold tracking-tight text-[var(--ink)] sm:gap-2.5 sm:text-lg"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#12813F] text-white">
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3.5 16v-2.2l3.2-1 2.2-3.3a1.5 1.5 0 0 1 1.3-.7h5.6c.5 0 1 .3 1.3.7l2.2 3.3 3.2 1V16" />
              <rect x="9.5" y="5.5" width="5" height="2.6" rx="0.8" fill="currentColor" stroke="none" />
              <circle cx="7.8" cy="16.5" r="1.8" />
              <circle cx="16.2" cy="16.5" r="1.8" />
            </svg>
          </span>
          <span className="font-display truncate">
            {t("brand.name")}
          </span>
        </Link>

        {/* Zone 2: Clean Single-Line Nav Links */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 whitespace-nowrap border-b-2 py-1 text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "border-[#12813F] text-[#12813F]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Zone 3: Primary Action & Language Toggle */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--surface)] sm:min-h-[34px]"
          >
            {lang === "en" ? "العربية" : "English"}
          </button>

          {user ? (
            <button
              type="button"
              onClick={handleAuthClick}
              title={user.email || t("nav.logout")}
              className="hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[#e5efe8] sm:inline-flex"
            >
              <span className="max-w-[120px] truncate">
                {user.displayName || user.email?.split("@")[0]}
              </span>
              <LogOut className="h-3.5 w-3.5 text-[var(--muted)]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAuthClick}
              className="hidden shrink-0 whitespace-nowrap rounded-lg bg-[#12813F] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#0D6430] sm:inline-flex"
            >
              {t("nav.login")}
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink)] md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[var(--border)] bg-white px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive
                      ? "bg-[var(--brand-soft)] text-[#12813F]"
                      : "text-[var(--ink)] hover:bg-[var(--surface)]"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                void handleAuthClick();
              }}
              className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#12813F] px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              {user
                ? `${t("nav.logout")} (${user.displayName || user.email})`
                : t("nav.login")}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}

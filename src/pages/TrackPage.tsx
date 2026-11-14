import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { formatDateTime, formatFare } from "../lib/i18n";
import { useApp } from "../context/AppContext";
import { Booking } from "../types";
import { StatusBadge } from "../components/StatusBadge";

export function TrackPage() {
  const { lang, t, user, authReady, signIn } = useApp();
  const navigate = useNavigate();

  const [codeInput, setCodeInput] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authReady || !user) {
      setBookings([]);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "bookings"),
      where("customerId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Booking, "id">),
        }));
        setBookings(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, "bookings");
      }
    );

    return () => unsubscribe();
  }, [authReady, user]);

  const handleLookup = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = codeInput.trim().toUpperCase();
    if (!cleaned) return;
    navigate(`/ride/${encodeURIComponent(cleaned)}`);
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-[var(--ink)] sm:text-3xl">
        {t("track.title")}
      </h1>
      <p className="mt-1.5 text-sm text-[var(--muted)]">
        {t("track.subtitle")}
      </p>

      <form onSubmit={handleLookup} className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)] ltr:left-3.5 rtl:right-3.5" />
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder={t("track.codePlaceholder")}
            dir="ltr"
            className="h-12 w-full rounded-xl border border-[var(--border)] bg-white text-base font-medium text-[var(--ink)] focus:border-[#12813F] focus:outline-none focus:ring-2 focus:ring-[#12813F]/15 sm:h-11 sm:text-sm ltr:pl-10 ltr:pr-4 rtl:pr-10 rtl:pl-4"
          />
        </div>
        <button
          type="submit"
          disabled={!codeInput.trim()}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#12813F] px-5 text-sm font-semibold text-white transition hover:bg-[#0D6430] disabled:opacity-50 sm:h-11"
        >
          {t("track.lookup")}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </form>

      <section className="mt-7 sm:mt-8">
        <h2 className="text-base font-bold text-[var(--ink)]">
          {t("track.myRides")}
        </h2>

        {!authReady || loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : !user ? (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-6 text-center">
            <p className="text-sm text-[var(--muted)]">
              {t("track.signInPrompt")}
            </p>
            <button
              type="button"
              onClick={() => void signIn()}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#12813F] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0D6430]"
            >
              {t("nav.login")}
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-6 text-center">
            <p className="text-sm text-[var(--muted)]">{t("track.noRides")}</p>
            <Link
              to="/"
              className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#12813F] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0D6430]"
            >
              {t("nav.book")}
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {bookings.map((b) => (
              <Link
                key={b.id}
                to={`/ride/${b.code}`}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 transition hover:border-[#12813F] sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono-tabular text-xs font-bold text-[var(--ink)]">
                      {b.code}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {formatDateTime(b.requested_time, lang)}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-semibold text-[var(--ink)]">
                    {b.pickup_label}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    → {b.destination_label}
                  </p>
                </div>

                <div className="flex w-full shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5 sm:w-auto sm:justify-end sm:border-t-0 sm:pt-0">
                  <span className="tabular-nums text-sm font-bold text-[var(--ink)]">
                    {formatFare(b.fare, lang)}
                  </span>
                  <StatusBadge status={b.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

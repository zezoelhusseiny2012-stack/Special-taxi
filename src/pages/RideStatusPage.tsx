import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Car,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  XCircle,
} from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  formatDateTime,
  formatFare,
  formatWhatsAppLink,
} from "../lib/i18n";
import { useApp } from "../context/AppContext";
import { Booking } from "../types";
import { RouteMap } from "../components/RouteMap";
import { StatusBadge } from "../components/StatusBadge";

export function RideStatusPage() {
  const { code } = useParams<{ code: string }>();
  const { lang, t, user, authReady, signIn, showToast } = useApp();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (!user || !code) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    const ref = doc(db, "bookings", code);

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setBooking(null);
          setNotFound(true);
        } else {
          setBooking({ id: snap.id, ...(snap.data() as Omit<Booking, "id">) });
          setNotFound(false);
        }
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        if (err.code === "permission-denied") {
          setNotFound(true);
          return;
        }
        handleFirestoreError(err, OperationType.GET, `bookings/${code}`);
      }
    );

    return () => unsubscribe();
  }, [authReady, user, code]);

  const handleCancel = async () => {
    if (!booking || booking.status !== "pending") return;
    setCancelling(true);
    try {
      await updateDoc(doc(db, "bookings", booking.code), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(err, OperationType.UPDATE, `bookings/${booking.code}`)
      );
      showToast(t("admin.cancelledToast"));
    } finally {
      setCancelling(false);
    }
  };

  if (!authReady || loading) {
    return (
      <main className="mx-auto flex max-w-4xl items-center justify-center gap-2 px-4 py-20 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("status.loading")}
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8">
          <h1 className="text-xl font-bold text-[var(--ink)]">
            {t("status.title")}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {t("track.signInPrompt")}
          </p>
          <button
            type="button"
            onClick={() => void signIn()}
            className="mt-5 rounded-xl bg-[#12813F] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0D6430]"
          >
            {t("nav.login")}
          </button>
        </div>
      </main>
    );
  }

  if (notFound || !booking) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8">
          <XCircle className="mx-auto h-9 w-9 text-[var(--muted)]" />
          <h1 className="mt-3 text-xl font-bold text-[var(--ink)]">
            {t("status.notFound")}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {t("status.notFoundHint")}
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex rounded-xl bg-[#12813F] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0D6430]"
          >
            {t("status.newRide")}
          </Link>
        </div>
      </main>
    );
  }

  const statusHeadings: Record<Booking["status"], { title: string; body: string }> = {
    pending: { title: t("status.pending"), body: t("status.pendingBody") },
    accepted: { title: t("status.accepted"), body: t("status.acceptedBody") },
    declined: { title: t("status.declined"), body: t("status.declinedBody") },
    completed: { title: t("status.completed"), body: t("status.completedBody") },
    cancelled: { title: t("status.cancelled"), body: t("status.cancelledBody") },
  };

  const stepIndex =
    booking.status === "completed"
      ? 3
      : booking.status === "accepted"
      ? 2
      : booking.status === "pending"
      ? 1
      : 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="grid items-stretch gap-5 sm:gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--muted)]">
                  {t("status.code")}
                </p>
                <p className="font-mono-tabular mt-0.5 text-lg font-bold text-[var(--ink)]">
                  {booking.code}
                </p>
              </div>
              <StatusBadge status={booking.status} />
            </div>

            <div className="mt-5 border-t border-[var(--border)] pt-5">
              <h1 className="text-xl font-extrabold text-[var(--ink)]">
                {statusHeadings[booking.status].title}
              </h1>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                {statusHeadings[booking.status].body}
              </p>

              {stepIndex > 0 && (
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    { num: 1, label: t("status.step1") },
                    { num: 2, label: t("status.step2") },
                    { num: 3, label: t("status.step3") },
                  ].map((step) => {
                    const active = stepIndex >= step.num;
                    return (
                      <div key={step.num} className="min-w-0">
                        <div
                          className={`h-1.5 rounded-full ${
                            active ? "bg-[#12813F]" : "bg-[var(--border)]"
                          }`}
                        />
                        <p
                          className={`mt-1.5 truncate text-xs font-medium ${
                            active ? "text-[var(--ink)]" : "text-[var(--muted)]"
                          }`}
                        >
                          {step.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-5 text-sm">
              <div className="min-w-0">
                <p className="text-xs text-[var(--muted)]">
                  {t("booking.pickup")}
                </p>
                <p className="break-words font-semibold text-[var(--ink)]">
                  {booking.pickup_label}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[var(--muted)]">
                  {t("booking.dropoff")}
                </p>
                <p className="break-words font-semibold text-[var(--ink)]">
                  {booking.destination_label}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-4 sm:gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--muted)]">
                    {t("status.pickupAt")}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--ink)]">
                    {formatDateTime(booking.requested_time, lang)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[var(--muted)]">
                    {t("booking.distance")}
                  </p>
                  <p className="tabular-nums mt-0.5 text-xs font-semibold text-[var(--ink)]">
                    {booking.distance_km} {t("booking.km")}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[var(--muted)]">
                    {t("booking.fare")}
                  </p>
                  <p className="tabular-nums mt-0.5 text-sm font-extrabold text-[#12813F]">
                    {formatFare(booking.fare, lang)}
                  </p>
                </div>
              </div>
            </div>

            {booking.driverName && (
              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-xs font-semibold text-[var(--muted)]">
                  {t("status.driver")}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#12813F]">
                      <Car className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--ink)]">
                        {booking.driverName}
                      </p>
                      {booking.driverPlate && (
                        <p className="truncate text-xs text-[var(--muted)]">
                          {booking.driverPlate}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {(booking.driverPhone || booking.driverWhatsapp) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {booking.driverPhone && (
                      <a
                        href={`tel:${booking.driverPhone}`}
                        className="inline-flex min-h-[44px] min-w-[130px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#12813F] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0D6430]"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {t("status.call")}
                      </a>
                    )}
                    {booking.driverWhatsapp && (
                      <a
                        href={formatWhatsAppLink(booking.driverWhatsapp)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] min-w-[130px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--surface)]"
                      >
                        <MessageCircle className="h-3.5 w-3.5 text-[#12813F]" />
                        {t("status.whatsapp")}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2.5">
              {booking.status === "pending" && (
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={handleCancel}
                  className="inline-flex min-h-[44px] min-w-[140px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                >
                  {cancelling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {t("status.cancelRide")}
                </button>
              )}

              <Link
                to="/"
                className="inline-flex min-h-[44px] min-w-[140px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--surface)]"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-[#12813F]" />
                {t("status.newRide")}
              </Link>
            </div>
            <p className="mt-3 text-center text-xs text-[var(--muted)]">
              {t("status.refreshHint")}
            </p>
          </div>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <RouteMap
            pickup={{
              label: booking.pickup_label,
              lat: booking.pickup_lat,
              lng: booking.pickup_lng,
            }}
            destination={{
              label: booking.destination_label,
              lat: booking.destination_lat,
              lng: booking.destination_lng,
            }}
            className="h-[280px] min-h-[280px] sm:h-[360px] sm:min-h-[360px] lg:h-full lg:min-h-[540px]"
          />
        </div>
      </div>
    </main>
  );
}

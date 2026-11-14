import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  AlertTriangle,
  Check,
  Loader2,
  MapPin,
  Phone,
  ShieldAlert,
  X,
} from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { formatDateTime, formatFare } from "../lib/i18n";
import { useApp } from "../context/AppContext";
import { Booking } from "../types";
import { RouteMap } from "../components/RouteMap";
import { StatusBadge } from "../components/StatusBadge";

type DriverTab = "incoming" | "active" | "completed" | "declined";

export function DriverPage() {
  const {
    lang,
    t,
    user,
    authReady,
    isDriver,
    driverProfile,
    pricing,
    signIn,
    logout,
    showToast,
  } = useApp();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DriverTab>("incoming");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [togglingAvail, setTogglingAvail] = useState(false);
  const [expandedMapId, setExpandedMapId] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady) return;
    if (!user || !isDriver) {
      setBookings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setBookings(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Booking, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, "bookings");
      }
    );

    return () => unsubscribe();
  }, [authReady, user, isDriver]);

  const incoming = useMemo(
    () => bookings.filter((b) => b.status === "pending"),
    [bookings]
  );
  const active = useMemo(
    () => bookings.filter((b) => b.status === "accepted"),
    [bookings]
  );
  const completed = useMemo(
    () => bookings.filter((b) => b.status === "completed"),
    [bookings]
  );
  const declined = useMemo(
    () =>
      bookings.filter(
        (b) => b.status === "declined" || b.status === "cancelled"
      ),
    [bookings]
  );

  const visibleList =
    tab === "incoming"
      ? incoming
      : tab === "active"
      ? active
      : tab === "completed"
      ? completed
      : declined;

  const hasOverlap = (candidate: Booking): boolean => {
    const candTime = new Date(candidate.requested_time).getTime();
    if (Number.isNaN(candTime)) return false;
    const candEnd =
      candTime + (candidate.duration_min + pricing.buffer_minutes) * 60000;

    return active.some((existing) => {
      const exTime = new Date(existing.requested_time).getTime();
      if (Number.isNaN(exTime)) return false;
      const exEnd =
        exTime + (existing.duration_min + pricing.buffer_minutes) * 60000;
      return candTime < exEnd && exTime < candEnd;
    });
  };

  const handleAccept = async (booking: Booking) => {
    setBusyId(booking.code);
    try {
      await updateDoc(doc(db, "bookings", booking.code), {
        status: "accepted",
        driverName:
          driverProfile?.full_name ||
          user?.displayName ||
          "Special Taxi Driver",
        driverPhone: driverProfile?.phone || "",
        driverWhatsapp: driverProfile?.whatsapp || "",
        driverPlate: driverProfile?.plate || "",
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `bookings/${booking.code}`
        )
      );
      showToast(t("driver.acceptedToast"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (booking: Booking) => {
    setBusyId(booking.code);
    try {
      await updateDoc(doc(db, "bookings", booking.code), {
        status: "declined",
        driverName: driverProfile?.full_name || "",
        driverPhone: driverProfile?.phone || "",
        driverWhatsapp: driverProfile?.whatsapp || "",
        driverPlate: driverProfile?.plate || "",
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `bookings/${booking.code}`
        )
      );
      showToast(t("driver.declinedToast"));
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async (booking: Booking) => {
    setBusyId(booking.code);
    try {
      await updateDoc(doc(db, "bookings", booking.code), {
        status: "completed",
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `bookings/${booking.code}`
        )
      );
      showToast(t("driver.completedToast"));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleAvailability = async () => {
    if (!driverProfile) return;
    setTogglingAvail(true);
    try {
      await updateDoc(doc(db, "drivers", "primary"), {
        available: !driverProfile.available,
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(err, OperationType.UPDATE, "drivers/primary")
      );
    } finally {
      setTogglingAvail(false);
    }
  };

  if (!authReady || loading) {
    return (
      <main className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-4 py-20 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading")}
      </main>
    );
  }

  const handleSwitchAccount = async () => {
    try {
      await logout();
      await signIn();
    } catch (err) {
      console.error("Account switch failed:", err);
    }
  };

  if (!user || !isDriver) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8">
          <ShieldAlert className="mx-auto h-9 w-9 text-[#12813F]" />
          <h1 className="mt-3 text-xl font-bold text-[var(--ink)]">
            {t("driver.notDriver")}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {t("driver.notDriverHint")}
          </p>
          {user && user.email && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              {t("auth.signedInAs")}{" "}
              <span className="font-semibold text-[var(--ink)]" dir="ltr">
                {user.email}
              </span>
            </p>
          )}
          <button
            type="button"
            onClick={() => (user ? void handleSwitchAccount() : void signIn())}
            className="mt-5 rounded-xl bg-[#12813F] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0D6430]"
          >
            {user ? t("auth.switchAccount") : t("nav.login")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-[var(--ink)] sm:text-3xl">
            {t("driver.title")}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t("driver.subtitle")} · {t("driver.autoRefresh")}
          </p>
        </div>

        {driverProfile && (
          <button
            type="button"
            disabled={togglingAvail}
            onClick={handleToggleAvailability}
            className={`inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2.5 text-xs font-bold transition sm:w-auto ${
              driverProfile.available
                ? "border-[#c4e6d0] bg-[#eaf6ee] text-[#12813F]"
                : "border-[var(--border)] bg-white text-[var(--muted)]"
            }`}
          >
            {togglingAvail ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {driverProfile.available
              ? t("driver.available")
              : t("driver.unavailable")}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-5 grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--surface)] p-1 sm:mt-6 sm:flex">
        {(
          [
            { key: "incoming", label: `${t("driver.incoming")} (${incoming.length})` },
            { key: "active", label: `${t("driver.active")} (${active.length})` },
            { key: "completed", label: `${t("driver.completed")} (${completed.length})` },
            { key: "declined", label: `${t("driver.declined")} (${declined.length})` },
          ] as Array<{ key: DriverTab; label: string }>
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:min-h-[38px] sm:px-3 ${
              tab === item.key
                ? "bg-white text-[var(--ink)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>

      <section className="mt-5 space-y-4 sm:mt-6">
        {visibleList.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--muted)]">
            {tab === "incoming" ? t("driver.noIncoming") : t("driver.empty")}
          </div>
        ) : (
          visibleList.map((booking) => {
            const overlap = booking.status === "pending" && hasOverlap(booking);
            const isExpanded = expandedMapId === booking.code;

            return (
              <article
                key={booking.id}
                className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono-tabular text-xs font-bold text-[var(--ink)]">
                        {booking.code}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {formatDateTime(booking.requested_time, lang)}
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-base font-bold text-[var(--ink)]">
                      {booking.customer_name}
                    </h2>
                    <a
                      href={`tel:${booking.phone}`}
                      dir="ltr"
                      className="mt-1 inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-[#12813F] hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {booking.phone}
                    </a>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-base font-extrabold text-[var(--ink)]">
                      {formatFare(booking.fare, lang)}
                    </span>
                    <StatusBadge status={booking.status} />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--muted)]">
                      {t("booking.pickup")}
                    </p>
                    <p className="break-words font-medium text-[var(--ink)]">
                      {booking.pickup_label}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--muted)]">
                      {t("booking.dropoff")}
                    </p>
                    <p className="break-words font-medium text-[var(--ink)]">
                      {booking.destination_label}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                  <span className="tabular-nums">
                    {booking.distance_km} {t("booking.km")} · {booking.duration_min}{" "}
                    {t("booking.min")}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="break-words">
                    {t("driver.notes")}: {booking.notes || t("driver.noNotes")}
                  </span>
                </div>

                {overlap && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {t("driver.overlap")}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4 sm:gap-2.5">
                  {booking.status === "pending" && (
                    <>
                      <button
                        type="button"
                        disabled={busyId === booking.code}
                        onClick={() => handleAccept(booking)}
                        className="inline-flex min-h-[44px] min-w-[120px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#12813F] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0D6430] disabled:opacity-50 sm:flex-initial"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {t("driver.accept")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === booking.code}
                        onClick={() => handleDecline(booking)}
                        className="inline-flex min-h-[44px] min-w-[100px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50 sm:flex-initial"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t("driver.decline")}
                      </button>
                    </>
                  )}

                  {booking.status === "accepted" && (
                    <button
                      type="button"
                      disabled={busyId === booking.code}
                      onClick={() => handleComplete(booking)}
                      className="inline-flex min-h-[44px] min-w-[140px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#12813F] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0D6430] disabled:opacity-50 sm:flex-initial"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t("driver.complete")}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedMapId(isExpanded ? null : booking.code)
                    }
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--surface)] sm:w-auto"
                  >
                    <MapPin className="h-3.5 w-3.5 text-[#12813F]" />
                    {isExpanded ? t("driver.hideRoute") : t("driver.showRoute")}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-4">
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
                      className="h-[260px] min-h-[260px] sm:h-[300px] sm:min-h-[300px]"
                    />
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}

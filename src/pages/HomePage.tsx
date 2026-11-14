import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowRight, Calendar, Clock, Loader2 } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  calculateFare,
  formatFare,
  generateBookingCode,
  isValidEgyptianPhone,
} from "../lib/i18n";
import { useApp } from "../context/AppContext";
import { PlacePoint, RouteMetrics } from "../types";
import { PlaceSearchInput } from "../components/PlaceSearchInput";
import { RouteMap } from "../components/RouteMap";

function getDefaultScheduleDate() {
  const now = new Date(Date.now() + 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function getDefaultScheduleTime() {
  const now = new Date(Date.now() + 60 * 60 * 1000);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function HomePage() {
  const { lang, t, user, signIn, pricing, showToast } = useApp();
  const navigate = useNavigate();

  const [pickup, setPickup] = useState<PlacePoint | null>(null);
  const [destination, setDestination] = useState<PlacePoint | null>(null);
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [whenMode, setWhenMode] = useState<"now" | "later">("now");
  const [scheduleDate, setScheduleDate] = useState(getDefaultScheduleDate);
  const [scheduleTime, setScheduleTime] = useState(getDefaultScheduleTime);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.displayName && !customerName) {
      setCustomerName(user.displayName);
    }
  }, [user, customerName]);

  const handleRouteComputed = useCallback((nextMetrics: RouteMetrics | null) => {
    setMetrics(nextMetrics);
  }, []);

  const estimatedFare = metrics
    ? calculateFare(metrics.distanceKm, pricing)
    : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!pickup || !destination || !customerName.trim() || !phone.trim()) {
      setFormError(t("err.requiredFields"));
      return;
    }

    if (!isValidEgyptianPhone(phone)) {
      setFormError(t("err.phone"));
      return;
    }

    let requestedTimeIso = new Date().toISOString();
    if (whenMode === "later") {
      const parsed = new Date(`${scheduleDate}T${scheduleTime}`);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        setFormError(t("err.pastTime"));
        return;
      }
      requestedTimeIso = parsed.toISOString();
    }

    setSubmitting(true);
    try {
      let activeUser = user;
      if (!activeUser) {
        activeUser = await signIn();
      }
      if (!activeUser) {
        setSubmitting(false);
        return;
      }

      const code = generateBookingCode();
      const distanceKm = metrics?.distanceKm ?? 0;
      const durationMin = metrics?.durationMin ?? 0;
      const fare = calculateFare(distanceKm, pricing);

      const bookingPayload = {
        code,
        customerId: activeUser.uid,
        customerEmail: (activeUser.email || "").slice(0, 200),
        customer_name: customerName.trim().slice(0, 100),
        phone: phone.trim().slice(0, 25),
        notes: notes.trim().slice(0, 500),
        pickup_label: pickup.label.slice(0, 300),
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        destination_label: destination.label.slice(0, 300),
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        distance_km: distanceKm,
        duration_min: durationMin,
        fare,
        when_mode: whenMode,
        requested_time: requestedTimeIso,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, "bookings", code), bookingPayload).catch((err) =>
        handleFirestoreError(err, OperationType.CREATE, `bookings/${code}`)
      );

      navigate(`/ride/${code}`);
    } catch (err) {
      console.error("Failed to create booking:", err);
      showToast(t("err.generic"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Hero Title + Clean Unboxed Trust Line */}
      <section className="mb-5 sm:mb-8">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#12813F]">
          <span>{t("home.badge")}</span>
          <span aria-hidden="true" className="text-[var(--muted)]">·</span>
          <span className="text-[var(--muted)]">{t("booking.trust1")}</span>
          <span aria-hidden="true" className="text-[var(--muted)]">·</span>
          <span className="text-[var(--muted)]">{t("booking.trust3")}</span>
        </div>
        <h1 className="text-balance mt-2 max-w-2xl text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:mt-2.5 sm:text-4xl lg:text-5xl">
          {t("home.title")}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)] sm:mt-2.5 sm:text-base">
          {t("home.subtitle")}
        </p>
      </section>

      {/* Primary 2-Column Booking Split */}
      <section className="grid items-stretch gap-5 sm:gap-6 lg:grid-cols-12">
        {/* Left: Booking Form */}
        <form
          onSubmit={handleSubmit}
          className="flex min-w-0 flex-col justify-between rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-6 lg:col-span-5"
        >
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-bold text-[var(--ink)]">
                01. {t("booking.stepRoute")}
              </h2>
              <div className="mt-3 space-y-3.5">
                <PlaceSearchInput
                  label={t("booking.pickup")}
                  placeholder={t("booking.pickupPlaceholder")}
                  value={pickup}
                  onChange={setPickup}
                  dotColor="#12813F"
                  allowGeolocation
                />
                <PlaceSearchInput
                  label={t("booking.dropoff")}
                  placeholder={t("booking.dropoffPlaceholder")}
                  value={destination}
                  onChange={setDestination}
                  dotColor="#121714"
                />
              </div>
            </div>

            {/* Live Fare & Distance Summary */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              {calculatingRoute ? (
                <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#12813F]" />
                  {t("booking.calculating")}
                </div>
              ) : routeError ? (
                <p className="text-xs font-medium text-red-700">{routeError}</p>
              ) : metrics && estimatedFare !== null ? (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-[var(--muted)]">
                      {t("booking.distance")}
                    </p>
                    <p className="tabular-nums mt-0.5 text-base font-bold text-[var(--ink)]">
                      {metrics.distanceKm} {t("booking.km")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--muted)]">
                      {t("booking.duration")}
                    </p>
                    <p className="tabular-nums mt-0.5 text-base font-bold text-[var(--ink)]">
                      {metrics.durationMin} {t("booking.min")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--muted)]">
                      {t("booking.fare")}
                    </p>
                    <p className="tabular-nums mt-0.5 text-base font-extrabold text-[#12813F]">
                      {formatFare(estimatedFare, lang)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs font-medium text-[var(--muted)]">
                  {t("booking.farePending")}
                </p>
              )}
            </div>

            {/* Step 2: Time + Passenger Details */}
            <div className="border-t border-[var(--border)] pt-5">
              <h2 className="text-sm font-bold text-[var(--ink)]">
                02. {t("booking.stepDetails")}
              </h2>

              <div className="mt-3">
                <span className="mb-1.5 block text-xs font-semibold text-[var(--ink)]">
                  {t("booking.when")}
                </span>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--surface)] p-1">
                  <button
                    type="button"
                    onClick={() => setWhenMode("now")}
                    className={`flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-xs font-semibold transition sm:h-9 ${
                      whenMode === "now"
                        ? "bg-white text-[var(--ink)] shadow-sm"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {t("booking.now")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWhenMode("later")}
                    className={`flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-xs font-semibold transition sm:h-9 ${
                      whenMode === "later"
                        ? "bg-white text-[var(--ink)] shadow-sm"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {t("booking.later")}
                  </button>
                </div>

                {whenMode === "later" && (
                  <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <label className="block min-w-0">
                      <span className="mb-1 block text-xs text-[var(--muted)]">
                        {t("booking.date")}
                      </span>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-base text-[var(--ink)] focus:border-[#12813F] focus:outline-none sm:h-10 sm:text-sm"
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1 block text-xs text-[var(--muted)]">
                        {t("booking.time")}
                      </span>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-base text-[var(--ink)] focus:border-[#12813F] focus:outline-none sm:h-10 sm:text-sm"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs font-semibold text-[var(--ink)]">
                    {t("booking.name")}
                  </span>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={t("booking.namePlaceholder")}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-base text-[var(--ink)] focus:border-[#12813F] focus:outline-none focus:ring-2 focus:ring-[#12813F]/15 sm:text-sm"
                  />
                </label>

                <label className="block min-w-0">
                  <span className="mb-1 block text-xs font-semibold text-[var(--ink)]">
                    {t("booking.phone")}
                  </span>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    maxLength={25}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t("booking.phonePlaceholder")}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-base text-[var(--ink)] focus:border-[#12813F] focus:outline-none focus:ring-2 focus:ring-[#12813F]/15 sm:text-sm"
                  />
                </label>
              </div>

              <label className="mt-3 block">
                <span className="mb-1 flex items-center justify-between text-xs font-semibold text-[var(--ink)]">
                  <span>{t("booking.notes")}</span>
                  <span className="font-normal text-[var(--muted)]">
                    {t("booking.optional")}
                  </span>
                </span>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("booking.notesPlaceholder")}
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-base text-[var(--ink)] focus:border-[#12813F] focus:outline-none focus:ring-2 focus:ring-[#12813F]/15 sm:text-sm"
                />
              </label>
            </div>
          </div>

          <div className="mt-5">
            {formError && (
              <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || calculatingRoute}
              className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#12813F] px-5 text-sm font-bold text-white transition hover:bg-[#0D6430] disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("booking.submitting")}
                </>
              ) : (
                <>
                  {user ? t("booking.submit") : t("booking.signInAndSubmit")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </>
              )}
            </button>
            <p className="mt-2.5 text-center text-xs text-[var(--muted)]">
              {t("booking.approx")}
            </p>
          </div>
        </form>

        {/* Right: Live Google Map */}
        <div className="min-w-0 lg:col-span-7">
          <RouteMap
            pickup={pickup}
            destination={destination}
            onRouteComputed={handleRouteComputed}
            onRouteError={setRouteError}
            onCalculatingChange={setCalculatingRoute}
            className="h-[300px] min-h-[300px] sm:h-[380px] sm:min-h-[380px] lg:h-full lg:min-h-[600px]"
          />
        </div>
      </section>
    </main>
  );
}

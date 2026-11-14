import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { Loader2, MapPin, ShieldAlert, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { BOOTSTRAP_ADMIN_EMAIL, formatDateTime, formatFare } from "../lib/i18n";
import { useApp } from "../context/AppContext";
import { Booking, DriverProfile, PricingSettings } from "../types";
import { RouteMap } from "../components/RouteMap";
import { StatusBadge } from "../components/StatusBadge";

interface AdminEntry {
  id: string;
  email: string;
}

type AdminFilter = "all" | "active" | "completed" | "declined";

export function AdminPage() {
  const {
    lang,
    t,
    user,
    authReady,
    isAdmin,
    pricing,
    driverProfile,
    signIn,
    logout,
    showToast,
  } = useApp();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AdminFilter>("all");
  const [mapBooking, setMapBooking] = useState<Booking | null>(null);

  const [settingsForm, setSettingsForm] = useState<PricingSettings>(pricing);
  const [savingSettings, setSavingSettings] = useState(false);

  const [driverForm, setDriverForm] = useState<
    Omit<DriverProfile, "available" | "updatedAt">
  >({
    full_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    plate: "",
  });
  const [savingDriver, setSavingDriver] = useState(false);

  const [newAdminUid, setNewAdminUid] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);

  useEffect(() => {
    setSettingsForm(pricing);
  }, [pricing]);

  useEffect(() => {
    if (driverProfile) {
      setDriverForm({
        full_name: driverProfile.full_name || "",
        email: driverProfile.email || "",
        phone: driverProfile.phone || "",
        whatsapp: driverProfile.whatsapp || "",
        plate: driverProfile.plate || "",
      });
    }
  }, [driverProfile]);

  useEffect(() => {
    if (!authReady) return;
    if (!user || !isAdmin) {
      setBookings([]);
      setAdmins([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    const unsubscribeBookings = onSnapshot(
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

    const unsubscribeAdmins = onSnapshot(
      collection(db, "admins"),
      (snap) => {
        setAdmins(
          snap.docs.map((d) => ({
            id: d.id,
            email: String((d.data() as { email?: string }).email || ""),
          }))
        );
      },
      (err) => {
        console.warn("Admins list error:", err.message);
      }
    );

    return () => {
      unsubscribeBookings();
      unsubscribeAdmins();
    };
  }, [authReady, user, isAdmin]);

  const stats = useMemo(() => {
    return {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === "pending").length,
      accepted: bookings.filter((b) => b.status === "accepted").length,
      completed: bookings.filter((b) => b.status === "completed").length,
      declined: bookings.filter(
        (b) => b.status === "declined" || b.status === "cancelled"
      ).length,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    if (filter === "active") {
      return bookings.filter(
        (b) => b.status === "pending" || b.status === "accepted"
      );
    }
    if (filter === "completed") {
      return bookings.filter((b) => b.status === "completed");
    }
    if (filter === "declined") {
      return bookings.filter(
        (b) => b.status === "declined" || b.status === "cancelled"
      );
    }
    return bookings;
  }, [bookings, filter]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await setDoc(doc(db, "settings", "pricing"), {
        base_fare: Math.max(0, Number(settingsForm.base_fare) || 0),
        per_km_rate: Math.max(0, Number(settingsForm.per_km_rate) || 0),
        minimum_fare: Math.max(0, Number(settingsForm.minimum_fare) || 0),
        buffer_minutes: Math.max(0, Number(settingsForm.buffer_minutes) || 0),
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(err, OperationType.WRITE, "settings/pricing")
      );
      showToast(t("admin.settingsSaved"));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveDriver = async () => {
    if (!driverForm.full_name.trim() || !driverForm.email.trim()) {
      showToast(t("common.required"));
      return;
    }
    setSavingDriver(true);
    try {
      await setDoc(doc(db, "drivers", "primary"), {
        full_name: driverForm.full_name.trim().slice(0, 120),
        email: driverForm.email.trim().slice(0, 200),
        phone: driverForm.phone.trim().slice(0, 30),
        whatsapp: driverForm.whatsapp.trim().slice(0, 30),
        plate: driverForm.plate.trim().slice(0, 40),
        available: driverProfile?.available ?? true,
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(err, OperationType.WRITE, "drivers/primary")
      );
      showToast(t("admin.driverSaved"));
    } finally {
      setSavingDriver(false);
    }
  };

  const handleCancelBooking = async (booking: Booking) => {
    await updateDoc(doc(db, "bookings", booking.code), {
      status: "cancelled",
      updatedAt: serverTimestamp(),
    }).catch((err) =>
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${booking.code}`)
    );
    showToast(t("admin.cancelledToast"));
  };

  const handleAddAdmin = async () => {
    const uid = newAdminUid.trim();
    const email = newAdminEmail.trim().toLowerCase();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid) || email.length < 3 || email.length > 200) {
      showToast(t("common.required"));
      return;
    }
    setSavingAdmin(true);
    try {
      await setDoc(doc(db, "admins", uid), {
        email,
        createdAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(err, OperationType.CREATE, `admins/${uid}`)
      );
      setNewAdminUid("");
      setNewAdminEmail("");
      showToast(t("admin.adminAdded"));
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (uid: string) => {
    await deleteDoc(doc(db, "admins", uid)).catch((err) =>
      handleFirestoreError(err, OperationType.DELETE, `admins/${uid}`)
    );
    showToast(t("admin.adminRemoved"));
  };

  const handleSwitchAccount = async () => {
    try {
      await logout();
      await signIn();
    } catch (err) {
      console.error("Account switch failed:", err);
    }
  };

  if (!authReady || loading) {
    return (
      <main className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-20 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading")}
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8">
          <ShieldAlert className="mx-auto h-9 w-9 text-[#12813F]" />
          <h1 className="mt-3 text-xl font-bold text-[var(--ink)]">
            {t("admin.notAdmin")}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {t("admin.notAdminHint")}
          </p>
          <p className="mt-3 rounded-xl bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">
            {t("admin.requiredEmailHint")}{" "}
            <span className="font-semibold text-[var(--ink)]" dir="ltr">
              {BOOTSTRAP_ADMIN_EMAIL}
            </span>
          </p>
          {user && user.email && (
            <p className="mt-2 text-xs text-[var(--muted)]">
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
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:space-y-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#12813F]">
            {t("admin.title")}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[var(--ink)] sm:text-3xl">
            {t("admin.subtitle")}
          </h1>
        </div>
        <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-[#12813F]/25 bg-[var(--brand-soft)] px-3 py-2 text-xs font-semibold text-[#0D6430] sm:px-3.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#12813F]" />
          <span className="shrink-0">{t("admin.activeBadge")}</span>
          {user.email && (
            <span className="truncate text-[var(--ink)]" dir="ltr">
              ({user.email})
            </span>
          )}
        </div>
      </header>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: t("admin.total"), val: stats.total },
          { label: t("admin.pendingCount"), val: stats.pending },
          { label: t("admin.acceptedCount"), val: stats.accepted },
          { label: t("admin.completedCount"), val: stats.completed },
          { label: t("admin.declinedCount"), val: stats.declined },
        ].map((item, idx) => (
          <div
            key={item.label}
            className={`rounded-2xl border border-[var(--border)] bg-white p-4 ${
              idx === 4 ? "col-span-2 sm:col-span-1" : ""
            }`}
          >
            <p className="text-xs text-[var(--muted)]">{item.label}</p>
            <p className="tabular-nums mt-1 text-2xl font-extrabold text-[var(--ink)]">
              {item.val}
            </p>
          </div>
        ))}
      </section>

      {/* Bookings */}
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-5">
          <h2 className="text-base font-bold text-[var(--ink)]">
            {t("admin.bookings")}
          </h2>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface)] p-1 sm:flex sm:flex-wrap">
            {(
              [
                { key: "all", label: t("admin.filterAll") },
                { key: "active", label: t("admin.filterActive") },
                { key: "completed", label: t("admin.filterCompleted") },
                { key: "declined", label: t("admin.filterDeclined") },
              ] as Array<{ key: AdminFilter; label: string }>
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`min-h-[40px] whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:min-h-[34px] sm:px-3 ${
                  filter === f.key
                    ? "bg-white text-[var(--ink)] shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                <span className="truncate">{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted)]">
            {t("admin.empty")}
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="divide-y divide-[var(--border)] md:hidden">
              {filteredBookings.map((b) => (
                <div key={b.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-tabular text-xs font-bold text-[var(--ink)]">
                          {b.code}
                        </span>
                        <span className="text-xs text-[var(--muted)]">
                          {formatDateTime(b.requested_time, lang)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-bold text-[var(--ink)]">
                        {b.customer_name}
                      </p>
                      <a
                        href={`tel:${b.phone}`}
                        dir="ltr"
                        className="text-xs font-semibold text-[#12813F]"
                      >
                        {b.phone}
                      </a>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge status={b.status} />
                      <span className="tabular-nums text-sm font-extrabold text-[var(--ink)]">
                        {formatFare(b.fare, lang)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-0.5 text-xs">
                    <p className="break-words font-medium text-[var(--ink)]">
                      {b.pickup_label}
                    </p>
                    <p className="break-words text-[var(--muted)]">
                      → {b.destination_label}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setMapBooking(b)}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface)]"
                    >
                      <MapPin className="h-3.5 w-3.5 text-[#12813F]" />
                      {t("admin.openMap")}
                    </button>
                    {(b.status === "pending" || b.status === "accepted") && (
                      <button
                        type="button"
                        onClick={() => handleCancelBooking(b)}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        {t("admin.cancelBooking")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-start text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--surface)]/60 text-xs text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">
                      {t("admin.colRef")}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {t("admin.colCustomer")}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {t("admin.colRoute")}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {t("admin.colWhen")}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {t("admin.colFare")}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">
                      {t("admin.colStatus")}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-[var(--surface)]/40">
                      <td className="font-mono-tabular whitespace-nowrap px-4 py-3 text-xs font-bold text-[var(--ink)]">
                        {b.code}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--ink)]">
                          {b.customer_name}
                        </p>
                        <p className="text-xs text-[var(--muted)]" dir="ltr">
                          {b.phone}
                        </p>
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <p className="truncate text-xs font-medium text-[var(--ink)]">
                          {b.pickup_label}
                        </p>
                        <p className="truncate text-xs text-[var(--muted)]">
                          → {b.destination_label}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">
                        {formatDateTime(b.requested_time, lang)}
                      </td>
                      <td className="tabular-nums whitespace-nowrap px-4 py-3 font-bold text-[var(--ink)]">
                        {formatFare(b.fare, lang)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-end">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMapBooking(b)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface)]"
                          >
                            <MapPin className="h-3.5 w-3.5 text-[#12813F]" />
                            {t("admin.openMap")}
                          </button>
                          {(b.status === "pending" || b.status === "accepted") && (
                            <button
                              type="button"
                              onClick={() => handleCancelBooking(b)}
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              {t("admin.cancelBooking")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Settings & Driver Account */}
      <section className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-6">
          <h2 className="text-base font-bold text-[var(--ink)]">
            {t("admin.settings")}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                { key: "base_fare", label: t("admin.baseFare") },
                { key: "per_km_rate", label: t("admin.perKm") },
                { key: "minimum_fare", label: t("admin.minFare") },
                { key: "buffer_minutes", label: t("admin.buffer") },
              ] as const
            ).map((field) => (
              <label key={field.key} className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                  {field.label}
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={settingsForm[field.key]}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({
                      ...prev,
                      [field.key]: Number(e.target.value),
                    }))
                  }
                  className="tabular-nums h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-base font-semibold text-[var(--ink)] focus:border-[#12813F] focus:outline-none sm:text-sm"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={savingSettings}
            onClick={handleSaveSettings}
            className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#12813F] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0D6430] disabled:opacity-55 sm:w-auto"
          >
            {savingSettings && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("admin.saveSettings")}
          </button>
        </div>

        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-6">
          <h2 className="text-base font-bold text-[var(--ink)]">
            {t("admin.driverAccount")}
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t("admin.inviteHint")}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0 sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                {t("admin.driverName")}
              </span>
              <input
                type="text"
                maxLength={120}
                value={driverForm.full_name}
                onChange={(e) =>
                  setDriverForm((prev) => ({ ...prev, full_name: e.target.value }))
                }
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-base font-semibold text-[var(--ink)] focus:border-[#12813F] focus:outline-none sm:text-sm"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                {t("admin.driverEmail")}
              </span>
              <input
                type="email"
                dir="ltr"
                maxLength={200}
                value={driverForm.email}
                onChange={(e) =>
                  setDriverForm((prev) => ({ ...prev, email: e.target.value }))
                }
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-base font-semibold text-[var(--ink)] focus:border-[#12813F] focus:outline-none sm:text-sm"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                {t("admin.driverPlate")}
              </span>
              <input
                type="text"
                maxLength={40}
                value={driverForm.plate}
                onChange={(e) =>
                  setDriverForm((prev) => ({ ...prev, plate: e.target.value }))
                }
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-base font-semibold text-[var(--ink)] focus:border-[#12813F] focus:outline-none sm:text-sm"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                {t("admin.driverPhone")}
              </span>
              <input
                type="tel"
                dir="ltr"
                maxLength={30}
                value={driverForm.phone}
                onChange={(e) =>
                  setDriverForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-base font-semibold text-[var(--ink)] focus:border-[#12813F] focus:outline-none sm:text-sm"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                {t("admin.driverWhatsapp")}
              </span>
              <input
                type="tel"
                dir="ltr"
                maxLength={30}
                value={driverForm.whatsapp}
                onChange={(e) =>
                  setDriverForm((prev) => ({ ...prev, whatsapp: e.target.value }))
                }
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-base font-semibold text-[var(--ink)] focus:border-[#12813F] focus:outline-none sm:text-sm"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={savingDriver}
            onClick={handleSaveDriver}
            className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#12813F] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0D6430] disabled:opacity-55 sm:w-auto"
          >
            {savingDriver && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("admin.saveDriver")}
          </button>
        </div>
      </section>

      {/* Admin Access Management */}
      <section className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--ink)]">
              {t("admin.accessTitle")}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {t("admin.accessHint")}
            </p>
          </div>
          <div className="max-w-full rounded-xl bg-[var(--surface)] px-3 py-2 text-xs">
            <span className="text-[var(--muted)]">{t("admin.addAdminUid")}: </span>
            <span className="font-mono-tabular break-all font-semibold text-[var(--ink)]" dir="ltr">
              {user.uid}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-[var(--muted)]">
              {t("admin.registeredAdmins")}
            </h3>
            <ul className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              {admins.length === 0 ? (
                <li className="px-4 py-3 text-xs text-[var(--muted)]" dir="ltr">
                  {BOOTSTRAP_ADMIN_EMAIL} ({t("admin.primaryOwner")})
                </li>
              ) : (
                admins.map((entry) => {
                  const isPrimaryOwner =
                    entry.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
                  const isSelf = entry.id === user.uid;
                  return (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:flex-nowrap sm:gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[var(--ink)]" dir="ltr">
                          {entry.email || entry.id}
                        </p>
                        <p className="font-mono-tabular truncate text-xs text-[var(--muted)]" dir="ltr">
                          {entry.id}
                        </p>
                      </div>
                      {isPrimaryOwner || isSelf ? (
                        <span className="shrink-0 rounded-lg bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-semibold text-[#0D6430]">
                          {isPrimaryOwner ? t("admin.primaryOwner") : t("admin.activeBadge")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleRemoveAdmin(entry.id)}
                          className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("admin.removeAdmin")}
                        </button>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                  {t("admin.addAdminUid")}
                </span>
                <input
                  type="text"
                  dir="ltr"
                  maxLength={128}
                  value={newAdminUid}
                  onChange={(e) => setNewAdminUid(e.target.value)}
                  placeholder="Firebase Auth UID"
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-base font-semibold text-[var(--ink)] focus:border-[#12813F] focus:outline-none sm:text-sm"
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                  {t("admin.addAdminEmail")}
                </span>
                <input
                  type="email"
                  dir="ltr"
                  maxLength={200}
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="name@gmail.com"
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-base font-semibold text-[var(--ink)] focus:border-[#12813F] focus:outline-none sm:text-sm"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={savingAdmin}
              onClick={() => void handleAddAdmin()}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--ink)] transition hover:bg-[var(--surface)] disabled:opacity-55 sm:w-auto"
            >
              {savingAdmin ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 text-[#12813F]" />
              )}
              {t("admin.addAdminBtn")}
            </button>
          </div>
        </div>
      </section>

      {mapBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-white p-4 shadow-xl sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono-tabular text-xs font-bold text-[#12813F]">
                  {mapBooking.code}
                </p>
                <p className="truncate text-sm font-bold text-[var(--ink)]">
                  {mapBooking.customer_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMapBooking(null)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface)] sm:h-9 sm:w-9"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <RouteMap
              pickup={{
                label: mapBooking.pickup_label,
                lat: mapBooking.pickup_lat,
                lng: mapBooking.pickup_lng,
              }}
              destination={{
                label: mapBooking.destination_label,
                lat: mapBooking.destination_lat,
                lng: mapBooking.destination_lng,
              }}
              className="h-[260px] min-h-[260px] sm:h-[360px] sm:min-h-[360px]"
            />
          </div>
        </div>
      )}
    </main>
  );
}

import { CheckCircle2, Clock, Navigation, XCircle } from "lucide-react";
import { BookingStatus } from "../types";
import { useApp } from "../context/AppContext";

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { lang } = useApp();

  const labels: Record<BookingStatus, { en: string; ar: string }> = {
    pending: { en: "Waiting", ar: "في الانتظار" },
    accepted: { en: "Accepted", ar: "مقبول" },
    completed: { en: "Completed", ar: "مكتمل" },
    declined: { en: "Declined", ar: "مرفوض" },
    cancelled: { en: "Cancelled", ar: "ملغي" },
  };

  const styles: Record<BookingStatus, string> = {
    pending: "text-amber-700 bg-amber-50 border-amber-200",
    accepted: "text-[#12813F] bg-[#eaf6ee] border-[#c4e6d0]",
    completed: "text-slate-700 bg-slate-100 border-slate-200",
    declined: "text-red-700 bg-red-50 border-red-200",
    cancelled: "text-slate-600 bg-slate-100 border-slate-200",
  };

  const Icon =
    status === "accepted"
      ? Navigation
      : status === "completed"
      ? CheckCircle2
      : status === "declined" || status === "cancelled"
      ? XCircle
      : Clock;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {labels[status][lang]}
    </span>
  );
}

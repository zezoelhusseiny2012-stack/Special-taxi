import { FormEvent, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import Markdown from "react-markdown";
import { ExternalLink, Loader2, MapPin, Navigation, Search } from "lucide-react";
import { MANSOURA_CENTER } from "../lib/i18n";
import { useApp } from "../context/AppContext";
import { GroundedPlace, PlacePoint } from "../types";

interface MapsGuidePanelProps {
  onSelectPickup: (point: PlacePoint) => void;
  onSelectDropoff: (point: PlacePoint) => void;
}

export function MapsGuidePanel({
  onSelectPickup,
  onSelectDropoff,
}: MapsGuidePanelProps) {
  const { lang, t, showToast, triggerQuotaExceeded } = useApp();
  const placesLib = useMapsLibrary("places");

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolvingTitle, setResolvingTitle] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [places, setPlaces] = useState<GroundedPlace[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/maps-grounding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          lang,
          lat: MANSOURA_CENTER.lat,
          lng: MANSOURA_CENTER.lng,
        }),
      });
      const data = (await res.json()) as {
        text?: string;
        places?: GroundedPlace[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || t("err.generic"));
      }
      setAnswerText(data.text || "");
      setPlaces(data.places || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("err.generic"));
    } finally {
      setLoading(false);
    }
  };

  const resolvePlaceAndApply = async (
    placeItem: GroundedPlace,
    target: "pickup" | "dropoff"
  ) => {
    if (!placesLib) {
      showToast(t("map.loading"));
      return;
    }

    setResolvingTitle(`${placeItem.title}-${target}`);
    try {
      let resolvedPoint: PlacePoint | null = null;

      if (placeItem.placeId) {
        const cleanId = placeItem.placeId.replace(/^places\//, "");
        const p = new placesLib.Place({ id: cleanId });
        await p.fetchFields({
          fields: ["displayName", "formattedAddress", "location"],
        });
        if (p.location) {
          resolvedPoint = {
            label:
              p.displayName && p.formattedAddress
                ? `${p.displayName} — ${p.formattedAddress}`
                : p.formattedAddress || p.displayName || placeItem.title,
            lat: p.location.lat(),
            lng: p.location.lng(),
          };
        }
      }

      if (!resolvedPoint) {
        const { suggestions } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: `${placeItem.title}, Mansoura`,
            language: lang,
            region: "EG",
            locationBias: { center: MANSOURA_CENTER, radius: 25000 },
          });
        const first = suggestions?.[0]?.placePrediction;
        if (first) {
          const p = first.toPlace();
          await p.fetchFields({
            fields: ["displayName", "formattedAddress", "location"],
          });
          if (p.location) {
            resolvedPoint = {
              label:
                p.displayName && p.formattedAddress
                  ? `${p.displayName} — ${p.formattedAddress}`
                  : p.formattedAddress || p.displayName || placeItem.title,
              lat: p.location.lat(),
              lng: p.location.lng(),
            };
          }
        }
      }

      if (!resolvedPoint) {
        showToast(t("booking.noResults"));
        return;
      }

      if (target === "pickup") {
        onSelectPickup(resolvedPoint);
      } else {
        onSelectDropoff(resolvedPoint);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("OVER_QUERY_LIMIT") ||
        msg.includes("429")
      ) {
        triggerQuotaExceeded();
      } else {
        showToast(t("err.generic"));
      }
    } finally {
      setResolvingTitle(null);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--ink)]">
            {t("guide.title")}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t("guide.subtitle")}
          </p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)] ltr:left-3.5 rtl:right-3.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("guide.placeholder")}
            maxLength={300}
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 text-sm text-[var(--ink)] placeholder:text-[var(--muted)]/75 focus:border-[#12813F] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#12813F]/15 ltr:pl-10 ltr:pr-4 rtl:pr-10 rtl:pl-4"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#12813F] px-5 text-sm font-semibold text-white transition hover:bg-[#0D6430] disabled:opacity-55"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
          {loading ? t("guide.searching") : t("guide.search")}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {answerText && (
        <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-5">
          <div className="prose prose-sm max-w-none text-sm leading-relaxed text-[var(--ink)] prose-headings:text-sm prose-headings:font-bold prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
            <Markdown>{answerText}</Markdown>
          </div>

          {places.length > 0 && (
            <div>
              <p className="mb-2.5 text-xs font-semibold text-[var(--muted)]">
                {t("guide.sources")}
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {places.map((p, idx) => (
                  <div
                    key={`${p.placeId || p.title}-${idx}`}
                    className="flex flex-col justify-between gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-3.5"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#12813F]" />
                          {p.title}
                        </span>
                        {p.uri && (
                          <a
                            href={p.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#12813F] hover:underline"
                          >
                            {t("guide.openMaps")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>

                      {p.reviewSnippets.length > 0 && (
                        <div className="mt-2 space-y-1.5 border-t border-[var(--border)] pt-2">
                          {p.reviewSnippets.slice(0, 2).map((snip, sIdx) => (
                            <div key={sIdx} className="text-xs text-[var(--muted)]">
                              <p className="line-clamp-2">&ldquo;{snip.text}&rdquo;</p>
                              {snip.uri && (
                                <a
                                  href={snip.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#12813F] hover:underline"
                                >
                                  {snip.author || t("guide.openMaps")}
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={resolvingTitle !== null}
                        onClick={() => resolvePlaceAndApply(p, "pickup")}
                        className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[#12813F] hover:text-[#12813F] disabled:opacity-50"
                      >
                        {resolvingTitle === `${p.title}-pickup`
                          ? t("common.loading")
                          : t("guide.setPickup")}
                      </button>
                      <button
                        type="button"
                        disabled={resolvingTitle !== null}
                        onClick={() => resolvePlaceAndApply(p, "dropoff")}
                        className="rounded-lg bg-[#12813F] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0D6430] disabled:opacity-50"
                      >
                        {resolvingTitle === `${p.title}-dropoff`
                          ? t("common.loading")
                          : t("guide.setDropoff")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

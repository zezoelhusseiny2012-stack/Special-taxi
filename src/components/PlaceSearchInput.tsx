import { useCallback, useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { MANSOURA_CENTER } from "../lib/i18n";
import { useApp } from "../context/AppContext";
import { PlacePoint } from "../types";

interface PlaceSearchInputProps {
  label: string;
  placeholder: string;
  value: PlacePoint | null;
  onChange: (point: PlacePoint | null) => void;
  dotColor?: string;
  allowGeolocation?: boolean;
}

export function PlaceSearchInput({
  label,
  placeholder,
  value,
  onChange,
  dotColor = "#12813F",
  allowGeolocation = false,
}: PlaceSearchInputProps) {
  const { lang, t, triggerQuotaExceeded, showToast } = useApp();
  const placesLib = useMapsLibrary("places");

  const [inputValue, setInputValue] = useState(value?.label ?? "");
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [open, setOpen] = useState(false);

  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const skipNextFetchRef = useRef(false);

  useEffect(() => {
    if (value?.label) {
      skipNextFetchRef.current = true;
      setInputValue(value.label);
    } else if (!value) {
      setInputValue("");
    }
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!placesLib) return;
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    const trimmed = inputValue.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const request: google.maps.places.AutocompleteRequest = {
          input: trimmed,
          sessionToken: sessionTokenRef.current!,
          language: lang,
          region: "EG",
          locationBias: {
            center: MANSOURA_CENTER,
            radius: 25000,
          },
        };

        const res =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        if (!cancelled) {
          setSuggestions(res.suggestions ?? []);
          setOpen(true);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("OVER_QUERY_LIMIT") ||
          msg.includes("429")
        ) {
          triggerQuotaExceeded();
        }
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, inputValue, lang, triggerQuotaExceeded]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ["displayName", "formattedAddress", "location"],
        });

        const loc = place.location;
        if (!loc) return;

        const labelText =
          place.displayName && place.formattedAddress
            ? `${place.displayName} — ${place.formattedAddress}`
            : place.formattedAddress ||
              place.displayName ||
              suggestion.placePrediction.text.text;

        skipNextFetchRef.current = true;
        setInputValue(labelText);
        onChange({
          label: labelText.slice(0, 280),
          lat: loc.lat(),
          lng: loc.lng(),
        });
        resetSession();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("OVER_QUERY_LIMIT") ||
          msg.includes("429")
        ) {
          triggerQuotaExceeded();
        }
      }
    },
    [placesLib, onChange, resetSession, triggerQuotaExceeded]
  );

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showToast(t("err.location"));
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res = await fetch(
            `/api/geocode/reverse?lat=${lat}&lng=${lng}&lang=${lang}`
          );
          if (res.status === 429) {
            triggerQuotaExceeded();
          }
          const data = (await res.json()) as {
            address?: string;
            quotaExceeded?: boolean;
          };
          if (data.quotaExceeded) {
            triggerQuotaExceeded();
          }
          const address =
            data.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          skipNextFetchRef.current = true;
          setInputValue(address);
          onChange({
            label: address.slice(0, 280),
            lat,
            lng,
          });
          setOpen(false);
        } catch {
          const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          skipNextFetchRef.current = true;
          setInputValue(fallback);
          onChange({ label: fallback, lat, lng });
        } finally {
          setIsLocating(false);
        }
      },
      () => {
        setIsLocating(false);
        showToast(t("err.location"));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [lang, onChange, showToast, t, triggerQuotaExceeded]);

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
            aria-hidden="true"
          />
          {label}
        </label>

        {allowGeolocation && (
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 text-xs font-semibold text-[#12813F] hover:text-[#0D6430] disabled:opacity-60 sm:min-h-0 sm:px-0 sm:py-0"
          >
            {isLocating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Crosshair className="h-3.5 w-3.5" />
            )}
            {isLocating ? t("booking.locating") : t("booking.useLocation")}
          </button>
        )}
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)] ltr:left-3.5 rtl:right-3.5"
          aria-hidden="true"
        />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            const nextVal = e.target.value;
            setInputValue(nextVal);
            if (value && nextVal !== value.label) {
              onChange(null);
            }
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border border-[var(--border)] bg-white text-base text-[var(--ink)] placeholder:text-[var(--muted)]/70 focus:border-[#12813F] focus:outline-none focus:ring-2 focus:ring-[#12813F]/15 sm:text-sm ltr:pl-10 ltr:pr-11 rtl:pr-10 rtl:pl-11"
        />
        {(inputValue || isSearching) && (
          <div className="absolute top-1/2 -translate-y-1/2 ltr:right-1 rtl:left-1">
            {isSearching ? (
              <div className="flex h-10 w-10 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setInputValue("");
                  onChange(null);
                  resetSession();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                aria-label="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {open && (suggestions.length > 0 || (inputValue.trim().length >= 2 && !isSearching)) && (
        <ul className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg">
          {suggestions.length === 0 ? (
            <li className="px-3.5 py-3 text-xs text-[var(--muted)]">
              {t("booking.noResults")}
            </li>
          ) : (
            suggestions.map((suggestion, idx) => {
              const pred = suggestion.placePrediction;
              if (!pred) return null;
              return (
                <li key={pred.placeId || idx}>
                  <button
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="flex min-h-[44px] w-full items-start gap-2.5 px-3.5 py-2.5 text-start text-sm transition hover:bg-[var(--surface)]"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#12813F]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--ink)]">
                        {pred.mainText?.text || pred.text.text}
                      </span>
                      {pred.secondaryText?.text && (
                        <span className="block truncate text-xs text-[var(--muted)]">
                          {pred.secondaryText.text}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

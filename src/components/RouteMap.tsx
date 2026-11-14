import { useEffect, useRef, useState } from "react";
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  APILoadingStatus,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { MapPin } from "lucide-react";
import { MANSOURA_CENTER } from "../lib/i18n";
import { useApp } from "../context/AppContext";
import { PlacePoint, RouteMetrics } from "../types";

interface RouteCalculatorProps {
  pickup: PlacePoint | null;
  destination: PlacePoint | null;
  onRouteComputed?: (metrics: RouteMetrics | null) => void;
  onRouteError?: (err: string | null) => void;
  onCalculatingChange?: (loading: boolean) => void;
}

function RouteLayer({
  pickup,
  destination,
  onRouteComputed,
  onRouteError,
  onCalculatingChange,
}: RouteCalculatorProps) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const { t, triggerQuotaExceeded } = useApp();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!map) return;

    if (pickup && !destination) {
      map.panTo({ lat: pickup.lat, lng: pickup.lng });
      map.setZoom(15);
      onRouteComputed?.(null);
      onRouteError?.(null);
      return;
    }

    if (!pickup && destination) {
      map.panTo({ lat: destination.lat, lng: destination.lng });
      map.setZoom(15);
      onRouteComputed?.(null);
      onRouteError?.(null);
      return;
    }

    if (!pickup || !destination || !routesLib) {
      onRouteComputed?.(null);
      return;
    }

    let cancelled = false;
    onCalculatingChange?.(true);
    onRouteError?.(null);

    const request = {
      origin: { lat: pickup.lat, lng: pickup.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode: "DRIVING",
      fields: ["path", "distanceMeters", "durationMillis", "viewport", "legs"],
    };

    (routesLib.Route as unknown as {
      computeRoutes: (req: typeof request) => Promise<{
        routes?: Array<{
          distanceMeters?: number;
          durationMillis?: number;
          viewport?: google.maps.LatLngBounds;
          createPolylines: () => google.maps.Polyline[];
        }>;
      }>;
    })
      .computeRoutes(request)
      .then(({ routes }) => {
        if (cancelled) return;
        onCalculatingChange?.(false);

        if (!routes || routes.length === 0) {
          onRouteComputed?.(null);
          onRouteError?.(t("err.noRoute"));
          return;
        }

        const primaryRoute = routes[0];
        const newPolylines = primaryRoute.createPolylines();
        newPolylines.forEach((polyline) => {
          polyline.setOptions({
            strokeColor: "#12813F",
            strokeOpacity: 0.92,
            strokeWeight: 5,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport, 56);
        }

        const distanceKm = Number(
          ((primaryRoute.distanceMeters ?? 0) / 1000).toFixed(1)
        );
        const durationMin = Math.max(
          1,
          Math.round((primaryRoute.durationMillis ?? 0) / 60000)
        );
        onRouteComputed?.({ distanceKm, durationMin });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        onCalculatingChange?.(false);
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("OVER_QUERY_LIMIT") ||
          msg.includes("429")
        ) {
          triggerQuotaExceeded();
        }
        onRouteComputed?.(null);
        onRouteError?.(t("err.noRoute"));
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [
    map,
    routesLib,
    pickup,
    destination,
    onRouteComputed,
    onRouteError,
    onCalculatingChange,
    t,
    triggerQuotaExceeded,
  ]);

  return null;
}

function EndpointMarker({
  point,
  title,
  color,
}: {
  point: PlacePoint;
  title: string;
  color: string;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: point.lat, lng: point.lng }}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        <Pin
          background={color}
          borderColor="#ffffff"
          glyphColor="#ffffff"
          scale={1.1}
        />
      </AdvancedMarker>
      {open && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)}>
          <div className="max-w-[200px] p-1 text-xs">
            <p className="font-bold text-[#121714]">{title}</p>
            <p className="mt-0.5 text-[#5b665f]">{point.label}</p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

interface RouteMapProps {
  pickup: PlacePoint | null;
  destination: PlacePoint | null;
  onRouteComputed?: (metrics: RouteMetrics | null) => void;
  onRouteError?: (err: string | null) => void;
  onCalculatingChange?: (loading: boolean) => void;
  className?: string;
}

export function RouteMap({
  pickup,
  destination,
  onRouteComputed,
  onRouteError,
  onCalculatingChange,
  className = "h-[420px] lg:h-full min-h-[420px]",
}: RouteMapProps) {
  const { mapsApiKey, mapsKeyLoading, t } = useApp();
  const loadingStatus = useApiLoadingStatus();

  if (mapsKeyLoading) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] ${className}`}
      >
        <p className="text-sm text-[var(--muted)]">{t("map.loading")}</p>
      </div>
    );
  }

  if (!mapsApiKey) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center ${className}`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[#12813F] shadow-sm">
          <MapPin className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-bold text-[var(--ink)]">
          {t("map.noKey")}
        </h3>
        <p className="mt-1.5 max-w-sm text-sm text-[var(--muted)]">
          {t("map.noKeyHint")}
        </p>
      </div>
    );
  }

  if (
    loadingStatus === APILoadingStatus.FAILED ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center ${className}`}
      >
        <p className="text-sm font-semibold text-[var(--ink)]">
          {t("map.error")}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] ${className}`}
    >
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={MANSOURA_CENTER}
        defaultZoom={13}
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
        fullscreenControl={false}
        internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
        style={{ width: "100%", height: "100%" }}
      >
        {pickup && (
          <EndpointMarker
            point={pickup}
            title={t("map.pickup")}
            color="#12813F"
          />
        )}
        {destination && (
          <EndpointMarker
            point={destination}
            title={t("map.dropoff")}
            color="#121714"
          />
        )}
        <RouteLayer
          pickup={pickup}
          destination={destination}
          onRouteComputed={onRouteComputed}
          onRouteError={onRouteError}
          onCalculatingChange={onCalculatingChange}
        />
      </GoogleMap>

      {!pickup && !destination && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl border border-[var(--border)] bg-white/95 p-2.5 backdrop-blur-sm sm:inset-x-4 sm:bottom-4 sm:p-3.5">
          <p className="text-xs font-bold text-[var(--ink)]">
            {t("map.placeholderTitle")}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {t("map.placeholderHint")}
          </p>
        </div>
      )}
    </div>
  );
}

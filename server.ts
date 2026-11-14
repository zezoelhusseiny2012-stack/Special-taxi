import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";

const MANSOURA_COORDS = {
  latitude: 31.0409,
  longitude: 31.3785,
};

function getMapsApiKey(): string {
  return (
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the server environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Public runtime Maps API key configuration (never hardcoded)
  app.get("/api/maps-config", (_req, res) => {
    res.json({ apiKey: getMapsApiKey() });
  });

  // Server-side Geocoding proxy (avoids browser CORS trap & legacy JS Geocoder)
  app.get("/api/geocode/reverse", async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const lang = req.query.lang === "ar" ? "ar" : "en";

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: "Valid lat and lng query parameters are required." });
      return;
    }

    const mapsKey = getMapsApiKey();
    if (!mapsKey) {
      res.status(503).json({ error: "Google Maps API key is not configured." });
      return;
    }

    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("latlng", `${lat},${lng}`);
      url.searchParams.set("language", lang);
      url.searchParams.set("key", mapsKey);

      const response = await fetch(url.toString());
      const data = (await response.json()) as {
        status?: string;
        error_message?: string;
        results?: Array<{ formatted_address?: string; place_id?: string }>;
      };

      if (response.status === 429 || data.status === "OVER_QUERY_LIMIT") {
        res.status(429).json({
          error: data.error_message || "Google Maps quota exceeded.",
          quotaExceeded: true,
        });
        return;
      }

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        res.status(502).json({
          error: data.error_message || `Geocoding failed (${data.status ?? "unknown"})`,
        });
        return;
      }

      const first = data.results?.[0];
      res.json({
        address: first?.formatted_address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        placeId: first?.place_id || null,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to reverse geocode coordinates.",
      });
    }
  });

  // Gemini 4 Hydrogen with Google Maps Grounding
  app.post("/api/maps-grounding", async (req, res) => {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const lang = req.body?.lang === "ar" ? "ar" : "en";
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);

    if (!query || query.length > 300) {
      res.status(400).json({ error: "Provide a search query between 1 and 300 characters." });
      return;
    }

    const retrievalLatLng =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? { latitude: lat, longitude: lng }
        : MANSOURA_COORDS;

    try {
      const ai = createGeminiClient();
      const prompt =
        lang === "ar"
          ? `أنت دليل محلي لركاب سبيشال تاكسي في المنصورة، مصر. أجب باختصار وبوضوح عن هذا الطلب باستخدام خرائط جوجل (اذكر الأماكن الحقيقية ومواقعها التقريبية أو أوقات العمل المتاحة): "${query}"`
          : `You are a local Mansoura, Egypt ride guide for Special Taxi passengers. Answer concisely and clearly using Google Maps data for this request (list real places, street/district context, and helpful pickup/dropoff notes): "${query}"`;

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: retrievalLatLng,
            },
          },
        },
      });

      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

      const places = chunks
        .filter((chunk) => chunk.maps?.uri || chunk.maps?.title)
        .map((chunk) => {
          const snippetsRaw =
            chunk.maps?.placeAnswerSources?.reviewSnippets ??
            chunk.maps?.placeAnswerSources?.reviewSnippet ??
            [];
          const reviewSnippets = snippetsRaw
            .map((snippet) => ({
              author: snippet.authorAttribution?.displayName || "",
              text: snippet.title || snippet.review || "",
              uri: snippet.googleMapsUri || "",
            }))
            .filter((s) => s.text || s.uri);

          return {
            title: chunk.maps?.title || "Google Maps Place",
            uri: chunk.maps?.uri || "",
            placeId: chunk.maps?.placeId || "",
            reviewSnippets,
          };
        });

      res.json({
        text: response.text ?? "",
        places,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to query Maps Grounding.";
      const status =
        message.includes("429") || message.includes("RESOURCE_EXHAUSTED")
          ? 429
          : message.includes("API_KEY") || message.includes("403")
          ? 403
          : 500;
      res.status(status).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Special Taxi server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

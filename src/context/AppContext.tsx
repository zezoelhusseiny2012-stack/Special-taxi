import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from "../lib/firebase";
import {
  BOOTSTRAP_ADMIN_EMAIL,
  DEFAULT_PRICING,
  Lang,
  TranslationKey,
  translations,
} from "../lib/i18n";
import { DriverProfile, PricingSettings } from "../types";

interface AppContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  isRtl: boolean;
  t: (key: TranslationKey) => string;
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  isDriver: boolean;
  driverProfile: DriverProfile | null;
  pricing: PricingSettings;
  mapsApiKey: string;
  mapsKeyLoading: boolean;
  quotaExceeded: boolean;
  triggerQuotaExceeded: () => void;
  signIn: () => Promise<User | null>;
  logout: () => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function readSavedLang(): Lang {
  try {
    const saved = localStorage.getItem("special_taxi_lang");
    return saved === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readSavedLang);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING);
  const [mapsApiKey, setMapsApiKey] = useState<string>(() => {
    return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
  });
  const [mapsKeyLoading, setMapsKeyLoading] = useState<boolean>(() => {
    return !(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
  });
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next === "ar" ? "ar" : "en");
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("special_taxi_lang", lang);
    } catch {
      // ignore storage failure
    }
  }, [lang]);

  const t = useCallback(
    (key: TranslationKey) => {
      return translations[lang][key] ?? translations.en[key] ?? key;
    },
    [lang]
  );

  // Listen for GMP quota-exceeded custom events
  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener("gmp-quota-exceeded", handler);
    return () => window.removeEventListener("gmp-quota-exceeded", handler);
  }, []);

  const triggerQuotaExceeded = useCallback(() => {
    setQuotaExceeded(true);
  }, []);

  // Load Google Maps API key from server config if not baked into VITE_GOOGLE_MAPS_API_KEY
  useEffect(() => {
    if (mapsApiKey) {
      setMapsKeyLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/maps-config")
      .then((res) => res.json())
      .then((data: { apiKey?: string }) => {
        if (!cancelled && data.apiKey) {
          setMapsApiKey(data.apiKey.trim());
        }
      })
      .catch(() => {
        // handled via empty key state
      })
      .finally(() => {
        if (!cancelled) setMapsKeyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mapsApiKey]);

  // Listen to public pricing settings
  useEffect(() => {
    const pricingRef = doc(db, "settings", "pricing");
    const unsubscribe = onSnapshot(
      pricingRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PricingSettings;
          setPricing({
            base_fare: Number(data.base_fare ?? DEFAULT_PRICING.base_fare),
            per_km_rate: Number(data.per_km_rate ?? DEFAULT_PRICING.per_km_rate),
            minimum_fare: Number(data.minimum_fare ?? DEFAULT_PRICING.minimum_fare),
            buffer_minutes: Number(data.buffer_minutes ?? DEFAULT_PRICING.buffer_minutes),
          });
        }
      },
      (error) => {
        console.warn("Pricing listener fallback to defaults:", error.message);
      }
    );
    return () => unsubscribe();
  }, []);

  // Firebase Auth listener + user/admin bootstrap
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setIsAdmin(false);
        setDriverProfile(null);
        setAuthReady(true);
        return;
      }

      const isVerifiedWithEmail = Boolean(nextUser.emailVerified && nextUser.email);
      const isBootstrap = Boolean(
        isVerifiedWithEmail &&
          nextUser.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()
      );

      // Recognize the configured bootstrap admin immediately
      if (isBootstrap) {
        setIsAdmin(true);
      }

      try {
        if (isVerifiedWithEmail && nextUser.email) {
          const safeName = (
            nextUser.displayName ||
            nextUser.email.split("@")[0] ||
            "Rider"
          ).slice(0, 120);

          // 1. Sync private user profile in an isolated block
          try {
            const userRef = doc(db, "users", nextUser.uid);
            const existingUserSnap = await getDoc(userRef).catch((e) =>
              handleFirestoreError(e, OperationType.GET, `users/${nextUser.uid}`)
            );

            if (!existingUserSnap.exists()) {
              await setDoc(userRef, {
                uid: nextUser.uid,
                displayName: safeName,
                email: nextUser.email.slice(0, 200),
                photoURL: (nextUser.photoURL || "").slice(0, 500),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }).catch((e) =>
                handleFirestoreError(e, OperationType.CREATE, `users/${nextUser.uid}`)
              );
            } else {
              const existingCreatedAt =
                existingUserSnap.data()?.createdAt || serverTimestamp();
              await setDoc(userRef, {
                uid: nextUser.uid,
                displayName: safeName,
                email: nextUser.email.slice(0, 200),
                photoURL: (nextUser.photoURL || "").slice(0, 500),
                createdAt: existingCreatedAt,
                updatedAt: serverTimestamp(),
              }).catch((e) =>
                handleFirestoreError(e, OperationType.UPDATE, `users/${nextUser.uid}`)
              );
            }
          } catch (userSyncErr) {
            console.error("User profile sync error:", userSyncErr);
          }

          // 2. Check and ensure /admins/{uid} record
          let adminDocExists = false;
          try {
            const adminRef = doc(db, "admins", nextUser.uid);
            const adminSnap = await getDoc(adminRef).catch(() => null);
            adminDocExists = Boolean(adminSnap?.exists());

            if (isBootstrap && !adminDocExists) {
              await setDoc(adminRef, {
                email: nextUser.email.slice(0, 200),
                createdAt: serverTimestamp(),
              }).catch((e) =>
                handleFirestoreError(e, OperationType.CREATE, `admins/${nextUser.uid}`)
              );
              adminDocExists = true;
            }
          } catch (adminErr) {
            console.error("Admin record check/create error:", adminErr);
          }

          const adminActive = isBootstrap || adminDocExists;
          setIsAdmin(adminActive);

          // 3. Ensure initial pricing & driver profile exist when admin signs in
          if (adminActive) {
            try {
              const pricingRef = doc(db, "settings", "pricing");
              const pSnap = await getDoc(pricingRef).catch(() => null);
              if (pSnap && !pSnap.exists()) {
                await setDoc(pricingRef, {
                  ...DEFAULT_PRICING,
                  updatedAt: serverTimestamp(),
                }).catch((e) =>
                  handleFirestoreError(e, OperationType.CREATE, "settings/pricing")
                );
              }
            } catch (pricingErr) {
              console.error("Pricing seed error:", pricingErr);
            }

            try {
              const driverRef = doc(db, "drivers", "primary");
              const dSnap = await getDoc(driverRef).catch(() => null);
              if (dSnap && !dSnap.exists()) {
                await setDoc(driverRef, {
                  full_name: safeName,
                  email: nextUser.email.slice(0, 200),
                  phone: "01000000000",
                  whatsapp: "01000000000",
                  plate: "د ج ح 4285",
                  available: true,
                  updatedAt: serverTimestamp(),
                }).catch((e) =>
                  handleFirestoreError(e, OperationType.CREATE, "drivers/primary")
                );
              }
            } catch (driverErr) {
              console.error("Driver seed error:", driverErr);
            }
          }
        } else {
          setIsAdmin(false);
        }
      } catch (err) {
        console.error("Auth bootstrap error:", err);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load driver profile if user is admin or configured driver
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setDriverProfile(null);
      return;
    }

    const driverRef = doc(db, "drivers", "primary");
    const unsubscribe = onSnapshot(
      driverRef,
      (snap) => {
        if (snap.exists()) {
          setDriverProfile(snap.data() as DriverProfile);
        } else {
          setDriverProfile(null);
        }
      },
      () => {
        // Non-driver customers receive permission-denied on drivers/primary by design
        setDriverProfile(null);
      }
    );

    return () => unsubscribe();
  }, [authReady, user, isAdmin]);

  const isDriver = useMemo(() => {
    if (!user || !user.emailVerified) return false;
    if (isAdmin) return true;
    if (!driverProfile?.email || !user.email) return false;
    return driverProfile.email.toLowerCase() === user.email.toLowerCase();
  }, [user, isAdmin, driverProfile]);

  const signIn = useCallback(async () => {
    const result = await signInWithGoogle();
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    await signOutUser();
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      lang,
      setLang,
      isRtl: lang === "ar",
      t,
      user,
      authReady,
      isAdmin,
      isDriver,
      driverProfile,
      pricing,
      mapsApiKey,
      mapsKeyLoading,
      quotaExceeded,
      triggerQuotaExceeded,
      signIn,
      logout,
      toast,
      showToast,
    }),
    [
      lang,
      setLang,
      t,
      user,
      authReady,
      isAdmin,
      isDriver,
      driverProfile,
      pricing,
      mapsApiKey,
      mapsKeyLoading,
      quotaExceeded,
      triggerQuotaExceeded,
      signIn,
      logout,
      toast,
      showToast,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

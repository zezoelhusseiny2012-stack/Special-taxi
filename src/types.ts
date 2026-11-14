export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlacePoint {
  label: string;
  lat: number;
  lng: number;
}

export type BookingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "completed"
  | "cancelled";

export interface PricingSettings {
  base_fare: number;
  per_km_rate: number;
  minimum_fare: number;
  buffer_minutes: number;
  updatedAt?: unknown;
}

export interface DriverProfile {
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  plate: string;
  available: boolean;
  updatedAt?: unknown;
}

export interface Booking {
  id: string;
  code: string;
  customerId: string;
  customerEmail?: string;
  customer_name: string;
  phone: string;
  notes: string;
  pickup_label: string;
  pickup_lat: number;
  pickup_lng: number;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  distance_km: number;
  duration_min: number;
  fare: number;
  when_mode: "now" | "later";
  requested_time: string;
  status: BookingStatus;
  driverName?: string;
  driverPhone?: string;
  driverWhatsapp?: string;
  driverPlate?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RouteMetrics {
  distanceKm: number;
  durationMin: number;
}

export interface GroundedPlace {
  title: string;
  uri: string;
  placeId: string;
  reviewSnippets: Array<{
    author: string;
    text: string;
    uri: string;
  }>;
}

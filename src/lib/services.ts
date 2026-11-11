export const PHOTO_BUCKET = "service-photos";

export type Section = { id: string; name: string; position: number };

export type Service = {
  id: string;
  section_id: string;
  name: string;
  duration_min: number;
  price_cents: number;
  photo_path: string | null;
  visible: boolean;
  retouch_reminder_days: number | null;
  position: number;
};

export const SERVICE_COLUMNS =
  "id, section_id, name, duration_min, price_cents, photo_path, visible, retouch_reminder_days, position";

// Las fotos de referencia son públicas.
export function photoUrl(path: string | null): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

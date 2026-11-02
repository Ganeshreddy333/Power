export const ANNOUNCEMENT_BANNER_CATEGORY = "announcement_banner";

export const getAnnouncementBannerPhotos = (value: unknown): string[] => {
  let photos = value;
  if (typeof photos === "string") {
    try {
      photos = JSON.parse(photos) as unknown;
    } catch {
      return [];
    }
  }
  return Array.isArray(photos)
    ? photos.filter((photo): photo is string => typeof photo === "string" && photo.trim().length > 0)
    : [];
};

export const isSafeAnnouncementLink = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) return true;
  if (trimmed.startsWith("#")) return true;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

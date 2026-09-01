export const FAVORITES_KEY = "mare-favorite-properties";
export const FAVORITES_EVENT = "mare-favorites-changed";

const EMPTY_FAVORITES: string[] = [];
let cachedStorageValue: string | null | undefined;
let cachedFavoriteIds = EMPTY_FAVORITES;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readFavoriteIds(): string[] {
  if (!canUseStorage()) return EMPTY_FAVORITES;
  try {
    const storageValue = window.localStorage.getItem(FAVORITES_KEY);
    if (storageValue === cachedStorageValue) return cachedFavoriteIds;
    const parsed: unknown = JSON.parse(storageValue ?? "[]");
    cachedStorageValue = storageValue;
    cachedFavoriteIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : EMPTY_FAVORITES;
    return cachedFavoriteIds;
  } catch {
    return EMPTY_FAVORITES;
  }
}

export function isFavorite(id: string) {
  return readFavoriteIds().includes(id);
}

export function writeFavoriteIds(ids: string[]) {
  if (!canUseStorage()) return;
  try {
    const next = [...new Set(ids)];
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    cachedStorageValue = JSON.stringify(next);
    cachedFavoriteIds = next;
    window.dispatchEvent(new Event(FAVORITES_EVENT));
  } catch {
    // Favoritos são opcionais: uma falha de storage não bloqueia a navegação.
  }
}

export function toggleFavoriteId(id: string) {
  const current = readFavoriteIds();
  writeFavoriteIds(current.includes(id) ? current.filter((favoriteId) => favoriteId !== id) : [...current, id]);
}

export function subscribeToFavorites(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(FAVORITES_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(FAVORITES_EVENT, onStoreChange);
  };
}

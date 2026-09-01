import { beforeEach, describe, expect, it } from "vitest";
import { FAVORITES_KEY, readFavoriteIds, toggleFavoriteId, writeFavoriteIds } from "@/lib/favorites";

describe("local favorites", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reads only string ids and ignores invalid JSON", () => {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(["vr-001", 42, null]));
    expect(readFavoriteIds()).toEqual(["vr-001"]);
    window.localStorage.setItem(FAVORITES_KEY, "not-json");
    expect(readFavoriteIds()).toEqual([]);
  });

  it("toggles an id and removes duplicates when writing", () => {
    writeFavoriteIds(["vr-001", "vr-001", "olx-001"]);
    expect(readFavoriteIds()).toEqual(["vr-001", "olx-001"]);
    toggleFavoriteId("vr-001");
    expect(readFavoriteIds()).toEqual(["olx-001"]);
    toggleFavoriteId("vr-001");
    expect(readFavoriteIds()).toEqual(["olx-001", "vr-001"]);
  });
});

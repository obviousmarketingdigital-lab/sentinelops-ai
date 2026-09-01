import { describe, expect, it } from "vitest";
import { filtersToSearchParams, parsePropertyFilters } from "@/lib/search/filters";

describe("property filter URL contract", () => {
  it("parses valid values and clamps pagination", () => {
    const params = new URLSearchParams("q=casa&minPrice=500000&minBedrooms=3&type=house&source=olx&page=0&pageSize=99");
    expect(parsePropertyFilters(params)).toMatchObject({ query: "casa", minPrice: 500000, minBedrooms: 3, type: "house", source: "olx", page: 1, pageSize: 24 });
  });

  it("ignores unknown enum values", () => {
    const filters = parsePropertyFilters(new URLSearchParams("type=not-real&source=other&sort=bad"));
    expect(filters.type).toBe("all");
    expect(filters.source).toBe("all");
    expect(filters.sort).toBe("relevance");
  });

  it("serializes shareable filters", () => {
    const params = filtersToSearchParams({ query: "casa ferrugem", maxPrice: 900000, minBedrooms: 3, type: "house", source: "viva-real", sort: "price-asc" });
    expect(params.toString()).toContain("query=casa+ferrugem");
    expect(params.get("sort")).toBe("price-asc");
  });
});

import { describe, expect, it } from "vitest";
import { mockProperties } from "@/data/properties.mock";
import { dedupeProperties, propertyFingerprint } from "@/lib/search/dedupe";
import { matchesProperty, sortProperties } from "@/lib/search/query";
import type { PropertyFilters } from "@/lib/domain/property";

describe("property search", () => {
  it("filters by price, bedrooms, neighborhood and type together", () => {
    const filters: PropertyFilters = { query: "", minPrice: 500000, maxPrice: 950000, minBedrooms: 3, neighborhood: "Ferrugem", type: "house", source: "all", sort: "relevance" };
    expect(mockProperties.filter((property) => matchesProperty(property, filters)).map((property) => property.id)).toEqual(["vr-001", "olx-001"]);
  });

  it("finds land using free-text terms", () => {
    const filters: PropertyFilters = { query: "terreno praia", type: "all", source: "all", sort: "relevance" };
    expect(mockProperties.filter((property) => matchesProperty(property, filters)).map((property) => property.id)).toEqual(["olx-002"]);
  });

  it("sorts by lowest price", () => {
    const filters: PropertyFilters = { query: "", source: "all", type: "all", sort: "price-asc" };
    const ids = sortProperties(mockProperties, filters).map((property) => property.id);
    expect(ids.slice(0, 3)).toEqual(["olx-002", "imw-001", "vr-002"]);
  });

  it("deduplicates equivalent listings deterministically", () => {
    expect(dedupeProperties(mockProperties)).toHaveLength(8);
    expect(propertyFingerprint(mockProperties[0])).toBe(propertyFingerprint(mockProperties[1]));
  });
});

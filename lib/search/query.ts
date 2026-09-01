import type { Property, PropertyFilters } from "@/lib/domain/property";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function matchesProperty(property: Property, filters: PropertyFilters) {
  const haystack = normalize(
    [property.title, property.description, property.neighborhood, property.locationLabel, ...property.features].join(" "),
  );
  const queryTerms = normalize(filters.query).split(/\s+/).filter(Boolean);

  return (
    queryTerms.every((term) => haystack.includes(term)) &&
    (filters.minPrice === undefined || property.price >= filters.minPrice) &&
    (filters.maxPrice === undefined || property.price <= filters.maxPrice) &&
    (filters.minBedrooms === undefined || (property.bedrooms ?? 0) >= filters.minBedrooms) &&
    (filters.minArea === undefined || Math.max(property.builtArea ?? 0, property.landArea ?? 0) >= filters.minArea) &&
    (!filters.features?.length || filters.features.every((feature) => haystack.includes(normalize(feature)))) &&
    (!filters.neighborhood || normalize(property.neighborhood) === normalize(filters.neighborhood)) &&
    (!filters.type || filters.type === "all" || property.type === filters.type) &&
    (!filters.source || filters.source === "all" || property.source === filters.source)
  );
}

export function relevanceScore(property: Property, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;
  const title = normalize(property.title);
  const location = normalize(`${property.neighborhood} ${property.locationLabel}`);
  return (title.includes(normalizedQuery) ? 5 : 0) + (location.includes(normalizedQuery) ? 3 : 0);
}

export function sortProperties(properties: Property[], filters: PropertyFilters) {
  const sorted = [...properties];
  switch (filters.sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "newest":
      return sorted.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    default:
      return sorted.sort((a, b) => relevanceScore(b, filters.query) - relevanceScore(a, filters.query));
  }
}

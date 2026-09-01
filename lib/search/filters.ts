import {
  PROPERTY_TYPES,
  PROPERTY_SOURCES,
  type PropertyFilters,
  type PropertySource,
  type PropertyType,
} from "@/lib/domain/property";

const toNumber = (value: string | null) => {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const isSource = (value: string): value is PropertySource =>
  (PROPERTY_SOURCES as readonly string[]).includes(value);

const isType = (value: string): value is PropertyType =>
  (PROPERTY_TYPES as readonly string[]).includes(value);

export function parsePropertyFilters(searchParams: URLSearchParams): PropertyFilters {
  const sourceValue = searchParams.get("source") ?? "all";
  const typeValue = searchParams.get("type") ?? "all";
  const sortValue = searchParams.get("sort");
  const sort = ["relevance", "price-asc", "price-desc", "newest"].includes(sortValue ?? "")
    ? (sortValue as PropertyFilters["sort"])
    : "relevance";

  return {
    query: (searchParams.get("query") ?? searchParams.get("q") ?? "").slice(0, 160),
    minPrice: toNumber(searchParams.get("minPrice")),
    maxPrice: toNumber(searchParams.get("maxPrice")),
    minBedrooms: toNumber(searchParams.get("minBedrooms")),
    minArea: toNumber(searchParams.get("minArea")),
    features: (searchParams.get("features") ?? "").split(",").map((feature) => feature.trim().slice(0, 40)).filter(Boolean).slice(0, 8),
    neighborhood: (searchParams.get("neighborhood") ?? "").slice(0, 80) || undefined,
    source: sourceValue === "all" || !isSource(sourceValue) ? "all" : sourceValue,
    type: typeValue === "all" || !isType(typeValue) ? "all" : typeValue,
    sort,
    page: Math.max(1, Math.floor(toNumber(searchParams.get("page")) ?? 1)),
    pageSize: Math.min(24, Math.max(1, Math.floor(toNumber(searchParams.get("pageSize")) ?? 12))),
  };
}

export function filtersToSearchParams(filters: PropertyFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
  if (filters.minBedrooms !== undefined) params.set("minBedrooms", String(filters.minBedrooms));
  if (filters.minArea !== undefined) params.set("minArea", String(filters.minArea));
  if (filters.features?.length) params.set("features", filters.features.join(","));
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.source && filters.source !== "all") params.set("source", filters.source);
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  if (filters.sort && filters.sort !== "relevance") params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return params;
}

import type { PropertySearchResponse } from "@/lib/domain/property";
import { dedupeProperties } from "@/lib/search/dedupe";
import { matchesProperty, sortProperties } from "@/lib/search/query";
import { getProviders } from "@/lib/providers/registry";
import type { PropertyFilters } from "@/lib/domain/property";

export async function searchProperties(filters: PropertyFilters): Promise<PropertySearchResponse> {
  const results = await Promise.all(getProviders(filters.source).map((provider) => provider.search(filters)));
  const deduped = dedupeProperties(results.flatMap((result) => result.items));
  const matching = sortProperties(deduped.filter((property) => matchesProperty(property, filters)), filters);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 12;
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
  const safePage = Math.min(page, totalPages);

  return {
    items: matching.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: matching.length,
    page: safePage,
    pageSize,
    totalPages,
    query: { ...filters, page: safePage, pageSize },
    providers: results.map(({ source, status }) => ({ source, status })),
  };
}

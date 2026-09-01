import { PROPERTY_TYPE_LABELS, SOURCE_LABELS, type PropertyFilters, type PropertySource } from "@/lib/domain/property";

const sourceDomains: Record<PropertySource, string> = {
  "viva-real": "vivareal.com.br",
  olx: "olx.com.br",
  imovelweb: "imovelweb.com.br",
};

const sourceOrder: PropertySource[] = ["viva-real", "olx", "imovelweb"];

function buildSearchTerms(filters: PropertyFilters, source: PropertySource) {
  const terms = [`site:${sourceDomains[source]}`, "Garopaba SC", "imóveis à venda"];
  if (filters.type && filters.type !== "all") terms.push(PROPERTY_TYPE_LABELS[filters.type]);
  if (filters.neighborhood) terms.push(filters.neighborhood);
  if (filters.minBedrooms) terms.push(`${filters.minBedrooms} quartos`);
  if (filters.minPrice) terms.push(`a partir de ${filters.minPrice}`);
  if (filters.maxPrice) terms.push(`até ${filters.maxPrice}`);
  if (filters.features?.length) terms.push(...filters.features);
  if (filters.query) terms.push(filters.query);
  return terms.join(" ");
}

export function createExternalSearchLinks(filters: PropertyFilters) {
  return sourceOrder.map((source) => {
    const query = buildSearchTerms(filters, source);
    return {
      source,
      label: SOURCE_LABELS[source],
      domain: sourceDomains[source],
      query,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    };
  });
}

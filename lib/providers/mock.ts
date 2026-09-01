import { mockProperties } from "@/data/properties.mock";
import type { PropertyFilters, PropertySource } from "@/lib/domain/property";
import type { PropertyProvider, ProviderResult } from "@/lib/providers/types";

export function createMockProvider(source: PropertySource): PropertyProvider {
  return {
    source,
    async search(filters: PropertyFilters): Promise<ProviderResult> {
      void filters;
      return {
        source,
        status: "demo",
        items: mockProperties.filter((property) => property.source === source),
        message: "Resultados demonstrativos para validar a experiência de busca.",
      };
    },
  };
}

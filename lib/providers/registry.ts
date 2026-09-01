import { PROPERTY_SOURCES, type PropertySource } from "@/lib/domain/property";
import { createMockProvider } from "@/lib/providers/mock";
import type { PropertyProvider } from "@/lib/providers/types";

// Os adaptadores reais entram aqui somente após API/feed/parceria autorizada.
export const providers: Record<PropertySource, PropertyProvider> = Object.fromEntries(
  PROPERTY_SOURCES.map((source) => [source, createMockProvider(source)]),
) as Record<PropertySource, PropertyProvider>;

export function getProviders(source?: PropertySource | "all") {
  return source && source !== "all" ? [providers[source]] : Object.values(providers);
}

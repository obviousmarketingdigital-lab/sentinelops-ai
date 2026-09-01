import type { Property, PropertyFilters, PropertySource } from "@/lib/domain/property";

export type ProviderResult = {
  source: PropertySource;
  status: "demo" | "disabled";
  items: Property[];
  message?: string;
};

export interface PropertyProvider {
  source: PropertySource;
  search(filters: PropertyFilters): Promise<ProviderResult>;
}

export const PROPERTY_SOURCES = ["viva-real", "olx", "imovelweb"] as const;
export type PropertySource = (typeof PROPERTY_SOURCES)[number];

export const PROPERTY_TYPES = [
  "house",
  "apartment",
  "land",
  "commercial",
  "inn",
  "other",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export type Property = {
  id: string;
  source: PropertySource;
  sourceLabel: string;
  sourceListingId: string;
  title: string;
  description: string;
  type: PropertyType;
  operation: "sale";
  price: number;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  builtArea: number | null;
  landArea: number | null;
  neighborhood: string;
  locationLabel: string;
  features: string[];
  imageUrl: string;
  originalUrl: string;
  publishedAt: string;
  lastSeenAt: string;
  coordinates: { lat: number; lng: number };
  demo?: boolean;
};

export type PropertyFilters = {
  query: string;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  neighborhood?: string;
  type?: PropertyType | "all";
  source?: PropertySource | "all";
  minArea?: number;
  features?: string[];
  sort?: "relevance" | "price-asc" | "price-desc" | "newest";
  page?: number;
  pageSize?: number;
};

export type PropertySearchResponse = {
  items: Property[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  query: PropertyFilters;
  providers: { source: PropertySource; status: "demo" | "disabled" }[];
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  house: "Casa",
  apartment: "Apartamento",
  land: "Terreno",
  commercial: "Comercial",
  inn: "Pousada",
  other: "Outro",
};

export const SOURCE_LABELS: Record<PropertySource, string> = {
  "viva-real": "Viva Real",
  olx: "OLX",
  imovelweb: "Imovelweb",
};

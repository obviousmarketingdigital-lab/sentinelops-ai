import type { Property } from "@/lib/domain/property";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function canonicalUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim().toLowerCase();
  }
}

export function propertyFingerprint(property: Property) {
  return [
    normalize(property.neighborhood),
    Math.round(property.price / 1000),
    property.builtArea ?? property.landArea ?? 0,
    property.bedrooms ?? 0,
  ].join("|");
}

export function dedupeProperties(properties: Property[]) {
  const seen = new Set<string>();
  return properties.filter((property) => {
    // A mesma oferta pode aparecer em mais de um portal; o fingerprint cruza as fontes.
    const key = propertyFingerprint(property);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

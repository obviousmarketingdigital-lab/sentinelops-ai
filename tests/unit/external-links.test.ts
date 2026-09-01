import { describe, expect, it } from "vitest";
import { createExternalSearchLinks } from "@/lib/search/external-links";

describe("free external search links", () => {
  it("creates one Google site search per portal", () => {
    const links = createExternalSearchLinks({ query: "casa", neighborhood: "Ferrugem", minBedrooms: 3, source: "all", type: "house" });
    expect(links).toHaveLength(3);
    expect(links.map((link) => link.domain)).toEqual(["vivareal.com.br", "olx.com.br", "imovelweb.com.br"]);
    expect(links[0].url).toContain("google.com/search?q=");
    expect(decodeURIComponent(links[0].url)).toContain("site:vivareal.com.br");
    expect(decodeURIComponent(links[0].url)).toContain("Ferrugem");
  });
});

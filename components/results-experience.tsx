"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { SearchForm } from "@/components/search-form";
import { PropertyCard } from "@/components/property-card";
const PropertyMap = dynamic(() => import("@/components/property-map").then((module) => module.PropertyMap), {
  ssr: false,
  loading: () => <div className="map-placeholder"><div className="map-grid" /><p>Carregando mapa…</p></div>,
});
import { ExternalSearchLinks } from "@/components/external-search-links";
import { ArrowRightIcon, ChevronDownIcon, LayoutGridIcon, MapPinIcon, MenuIcon, SlidersIcon } from "@/components/icons";
import type { PropertyFilters, PropertySearchResponse, PropertyType } from "@/lib/domain/property";
import { filtersToSearchParams, parsePropertyFilters } from "@/lib/search/filters";

const emptyResult: PropertySearchResponse = { items: [], total: 0, page: 1, pageSize: 12, totalPages: 1, query: { query: "", source: "all", type: "all", sort: "relevance" }, providers: [] };
const formatPriceShort = (value: number) => value >= 1000000 ? `R$ ${(value / 1000000).toFixed(1).replace(".", ",")} mi` : `R$ ${Math.round(value / 1000)}k`;
const featureOptions = [{ value: "Piscina", label: "Piscina" }, { value: "Vista para o mar", label: "Vista para o mar" }, { value: "Próxima à praia", label: "Próximo à praia" }];

function isPropertySearchResponse(value: unknown): value is PropertySearchResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PropertySearchResponse>;
  return Array.isArray(candidate.items)
    && typeof candidate.total === "number"
    && typeof candidate.page === "number"
    && typeof candidate.totalPages === "number"
    && typeof candidate.query === "object"
    && candidate.query !== null
    && Array.isArray(candidate.providers);
}

type ResultsFiltersSidebarProps = {
  initialFilters: PropertyFilters;
  mobileOpen: boolean;
  onClose: () => void;
  onApply: (filters: PropertyFilters) => void;
};

function ResultsFiltersSidebar({ initialFilters, mobileOpen, onClose, onApply }: ResultsFiltersSidebarProps) {
  const [draftMinPrice, setDraftMinPrice] = useState(initialFilters.minPrice?.toString() ?? "");
  const [draftMaxPrice, setDraftMaxPrice] = useState(initialFilters.maxPrice?.toString() ?? "");
  const [draftType, setDraftType] = useState<PropertyType | "all">(initialFilters.type ?? "all");
  const [draftBedrooms, setDraftBedrooms] = useState(initialFilters.minBedrooms?.toString() ?? "");
  const [draftFeatures, setDraftFeatures] = useState<string[]>(initialFilters.features ?? []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply({
      ...initialFilters,
      minPrice: draftMinPrice ? Number(draftMinPrice) : undefined,
      maxPrice: draftMaxPrice ? Number(draftMaxPrice) : undefined,
      minBedrooms: draftBedrooms ? Number(draftBedrooms) : undefined,
      type: draftType,
      features: draftFeatures,
      page: 1,
    });
  }

  function toggleFeature(feature: string) {
    setDraftFeatures((current) => current.includes(feature)
      ? current.filter((item) => item !== feature)
      : [...current, feature]);
  }

  return (
    <aside className={`filters-sidebar ${mobileOpen ? "filters-sidebar--mobile-open" : ""}`}>
      <form onSubmit={submit}>
        <div className="filters-sidebar__header"><div><span className="eyebrow">Refine sua busca</span><h2>Filtros</h2></div><button type="button" onClick={onClose} aria-label="Fechar filtros" className="filters-close">×</button></div>
        <div className="sidebar-filter-block"><label>Localização</label><div className="sidebar-location"><MapPinIcon size={17} /><span>Garopaba, SC</span></div></div>
        <div className="sidebar-filter-block"><label>Faixa de preço</label><div className="range-inputs"><input inputMode="numeric" value={draftMinPrice} onChange={(event) => setDraftMinPrice(event.target.value.replace(/\D/g, ""))} placeholder="Mínimo" aria-label="Preço mínimo" /><span>—</span><input inputMode="numeric" value={draftMaxPrice} onChange={(event) => setDraftMaxPrice(event.target.value.replace(/\D/g, ""))} placeholder="Máximo" aria-label="Preço máximo" /></div><div className="range-track"><span /></div></div>
        <div className="sidebar-filter-block"><label>Tipo de imóvel</label>{[["all", "Todos os tipos"], ["house", "Casas"], ["apartment", "Apartamentos"], ["land", "Terrenos"]].map(([value, label]) => <label className="check-row" key={value}><input type="radio" name="property-type" checked={draftType === value} onChange={() => setDraftType(value as PropertyType | "all")} /><span className="fake-check">{draftType === value ? "✓" : ""}</span>{label}</label>)}</div>
        <div className="sidebar-filter-block"><label>Quartos</label><div className="option-pills">{["1", "2", "3", "4"].map((value) => <button type="button" className={draftBedrooms === value ? "is-active" : ""} onClick={() => setDraftBedrooms(draftBedrooms === value ? "" : value)} key={value}>{value}+</button>)}</div></div>
        <div className="sidebar-filter-block"><label>Diferenciais</label>{featureOptions.map((feature) => <label className="check-row" key={feature.value}><input type="checkbox" checked={draftFeatures.includes(feature.value)} onChange={() => toggleFeature(feature.value)} /><span className="fake-check">{draftFeatures.includes(feature.value) ? "✓" : ""}</span>{feature.label}</label>)}</div>
        <button type="submit" className="button button--dark sidebar-apply">Aplicar filtros <ArrowRightIcon size={16} /></button>
      </form>
    </aside>
  );
}

export function ResultsExperience() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const params = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const initialFilters = useMemo(() => parsePropertyFilters(params), [params]);
  const [result, setResult] = useState<PropertySearchResponse>(emptyResult);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const loading = loadedQuery !== queryString;
  const currentFilters = !loading && !error ? result.query : initialFilters;
  const [view, setView] = useState<"grid" | "map">("grid");
  const [mobileFilters, setMobileFilters] = useState(false);

  useEffect(() => {
    const current = new URLSearchParams(queryString);
    const controller = new AbortController();
    let cancelled = false;

    fetch(`/api/properties?${current.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("search-request-failed");
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        if (!isPropertySearchResponse(data)) throw new Error("invalid-search-response");
        if (!cancelled) {
          setResult(data);
          setError(null);
          setLoadedQuery(queryString);
        }
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        if (!cancelled) {
          setResult(emptyResult);
          setError("Não foi possível carregar os imóveis agora. Tente novamente.");
          setLoadedQuery(queryString);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [queryString, retryToken]);

  function applySidebarFilters(nextFilters: PropertyFilters) {
    router.push(`${pathname}?${filtersToSearchParams({ ...nextFilters, page: 1 }).toString()}`);
    setMobileFilters(false);
  }

  function changeSort(nextSort: NonNullable<PropertyFilters["sort"]>) {
    const next = new URLSearchParams(queryString);
    next.set("sort", nextSort);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  function removeFilter(label: string) {
    const next = new URLSearchParams(queryString);
    const keys = ["minPrice", "maxPrice", "minBedrooms", "neighborhood", "type", "source", "features"];
    if (label.includes("A partir")) next.delete("minPrice");
    else if (label.includes("Até")) next.delete("maxPrice");
    else if (label.includes("quartos")) next.delete("minBedrooms");
    else if (label === "Terrenos" || label === "Tipo selecionado") next.delete("type");
    else if (keys.some((key) => next.get(key) === label)) next.delete(keys.find((key) => next.get(key) === label) ?? "");
    else if (label === "Piscina" || label === "Vista para o mar" || label === "Próximo à praia") {
      const remaining = (next.get("features") ?? "").split(",").filter((item) => item && item !== label);
      if (remaining.length) next.set("features", remaining.join(","));
      else next.delete("features");
    }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  function pageChange(page: number) {
    const next = new URLSearchParams(queryString);
    next.set("page", String(page));
    router.push(`${pathname}?${next.toString()}`);
  }

  function retrySearch() {
    setError(null);
    setLoadedQuery(null);
    setRetryToken((value) => value + 1);
  }

  const activeFilters = useMemo(() => {
    const labels: string[] = [];
    if (params.get("minPrice")) labels.push(`A partir de ${formatPriceShort(Number(params.get("minPrice")))}`);
    if (params.get("maxPrice")) labels.push(`Até ${formatPriceShort(Number(params.get("maxPrice")))}`);
    if (params.get("minBedrooms")) labels.push(`${params.get("minBedrooms")}+ quartos`);
    if (params.get("neighborhood")) labels.push(params.get("neighborhood")!);
    if (params.get("type") && params.get("type") !== "all") labels.push(params.get("type") === "land" ? "Terrenos" : "Tipo selecionado");
    if (params.get("source") && params.get("source") !== "all") labels.push(params.get("source")!);
    if (params.get("features")) labels.push(...params.get("features")!.split(","));
    return labels;
  }, [params]);

  return (
    <main className="results-page">
      <header className="site-header site-header--results"><a className="brand" href="/imoveis"><span className="brand-mark"><span /></span><span>maré<span className="brand-dot">.</span></span></a><nav className="desktop-nav"><a href="#como-funciona">Como funciona</a><a href="#fontes">Nossas fontes</a><a href="#sobre">Sobre a Maré</a></nav><div className="header-actions"><a className="header-link" href="/favoritos">Favoritos</a><button className="header-link">Entrar</button><button className="button button--outline button--small">Anunciar imóvel</button><button className="mobile-menu" aria-label="Abrir menu"><MenuIcon /></button></div></header>
      <section className="results-search"><div className="container"><SearchForm key={`results-search-${queryString}`} compact initial={initialFilters} /></div></section>
      <div className="container"><ExternalSearchLinks filters={currentFilters} /></div>
      <div className="results-layout container">
        <ResultsFiltersSidebar key={`results-filters-${queryString}`} initialFilters={initialFilters} mobileOpen={mobileFilters} onClose={() => setMobileFilters(false)} onApply={applySidebarFilters} />
        <section className="results-content"><div className="results-heading"><div><span className="eyebrow">Garopaba · Santa Catarina</span><h1>{currentFilters.query ? `Imóveis para ${currentFilters.query}` : "Imóveis à venda em Garopaba"}</h1><p>{loading ? "Buscando nos portais selecionados…" : error ? "A busca não foi concluída." : `${result.total} imóveis demonstrativos encontrados para validar a experiência`}</p></div><button className="mobile-filter-button" onClick={() => setMobileFilters(true)}><SlidersIcon size={16} /> Filtros</button></div><div className="active-filter-row">{activeFilters.length > 0 ? activeFilters.map((filter) => <span className="active-filter" key={filter}>{filter}<button onClick={() => removeFilter(filter)} aria-label={`Remover filtro ${filter}`}>×</button></span>) : <span className="active-filter active-filter--soft">Venda · Garopaba/SC</span>}<span className="filter-result-note">Busca demonstrativa</span></div><div className="results-toolbar"><span>{loading ? "Carregando resultados" : error ? "Não foi possível carregar" : `Mostrando ${result.items.length} de ${result.total}`}</span><div className="toolbar-actions"><div className="view-toggle"><button className={view === "grid" ? "is-active" : ""} onClick={() => setView("grid")} aria-label="Visualização em grade"><LayoutGridIcon /></button><button className={view === "map" ? "is-active" : ""} onClick={() => setView("map")} aria-label="Visualização com mapa"><MapPinIcon size={17} /></button></div><label className="sort-select"><span>Ordenar:</span><select value={currentFilters.sort ?? "relevance"} onChange={(event) => changeSort(event.target.value as NonNullable<PropertyFilters["sort"]>)}><option value="relevance">Mais relevantes</option><option value="price-asc">Menor preço</option><option value="price-desc">Maior preço</option><option value="newest">Mais recentes</option></select><ChevronDownIcon size={14} /></label></div></div>{loading ? <div className="property-grid">{Array.from({ length: 6 }).map((_, index) => <div className="skeleton-card" key={index}><div className="skeleton skeleton-image" /><div className="skeleton skeleton-line skeleton-line--short" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line skeleton-line--tiny" /></div>)}</div> : error ? <div className="search-error" role="alert"><span>!</span><h2>Não conseguimos atualizar esta busca</h2><p>{error}</p><button className="button button--dark" onClick={retrySearch}>Tentar novamente</button></div> : view === "map" ? <PropertyMap properties={result.items} /> : <div className="property-grid">{result.items.map((property) => <PropertyCard property={property} key={property.id} />)}</div>}{!loading && !error && result.items.length === 0 && <div className="empty-state"><span>⌂</span><h2>Nenhum imóvel encontrado</h2><p>Tente ampliar sua faixa de preço ou remover algum filtro.</p><a className="button button--dark" href="/resultados">Limpar filtros</a></div>} {!loading && !error && result.totalPages > 1 && <div className="pagination"><button onClick={() => pageChange(result.page - 1)} disabled={result.page <= 1}>Anterior</button><span>Página {result.page} de {result.totalPages}</span><button onClick={() => pageChange(result.page + 1)} disabled={result.page >= result.totalPages}>Próxima</button></div>}</section>
      </div>
      <footer className="site-footer"><div className="container footer-inner"><div><a className="brand brand--footer" href="/imoveis"><span className="brand-mark"><span /></span><span>maré<span className="brand-dot">.</span></span></a><p>Encontrar seu lugar<br />começa por aqui.</p></div><div className="footer-links"><div><strong>Explorar</strong><a href="/resultados?type=house">Casas</a><a href="/resultados?type=apartment">Apartamentos</a><a href="/resultados?type=land">Terrenos</a></div><div><strong>Sobre</strong><a href="#como-funciona">Como funciona</a><a href="#fontes">Nossas fontes</a><a href="#sobre">Contato</a></div><div><strong>Para negócios</strong><a href="#">Anunciar imóvel</a><a href="#">Seja parceiro</a></div></div></div><div className="container footer-bottom"><span>© 2026 Maré Imóveis · Garopaba, SC</span><span>Uma pesquisa, todos os lugares.</span></div></footer>
    </main>
  );
}

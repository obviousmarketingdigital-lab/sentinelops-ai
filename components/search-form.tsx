"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, MapPinIcon, SearchIcon, SlidersIcon } from "@/components/icons";
import { filtersToSearchParams } from "@/lib/search/filters";
import type { PropertyFilters, PropertySource, PropertyType } from "@/lib/domain/property";

const sourceOptions: { value: PropertySource | "all"; label: string }[] = [
  { value: "all", label: "Todos os portais" },
  { value: "viva-real", label: "Viva Real" },
  { value: "olx", label: "OLX" },
  { value: "imovelweb", label: "Imovelweb" },
];
const typeOptions: { value: PropertyType | "all"; label: string }[] = [
  { value: "all", label: "Todos os tipos" },
  { value: "house", label: "Casa" },
  { value: "apartment", label: "Apartamento" },
  { value: "land", label: "Terreno" },
  { value: "commercial", label: "Comercial" },
  { value: "inn", label: "Pousada" },
];

export function SearchForm({ initial = {}, compact = false }: { initial?: Partial<PropertyFilters>; compact?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(initial.query ?? "");
  const [minPrice, setMinPrice] = useState(initial.minPrice?.toString() ?? "");
  const [maxPrice, setMaxPrice] = useState(initial.maxPrice?.toString() ?? "");
  const [minBedrooms, setMinBedrooms] = useState(initial.minBedrooms?.toString() ?? "");
  const [neighborhood, setNeighborhood] = useState(initial.neighborhood ?? "");
  const [type, setType] = useState<PropertyType | "all">(initial.type ?? "all");
  const [source, setSource] = useState<PropertySource | "all">(initial.source ?? "all");
  const [minArea, setMinArea] = useState(initial.minArea?.toString() ?? "");
  const [showMore, setShowMore] = useState(!compact);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filters: PropertyFilters = {
      query: query.trim(),
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      minBedrooms: minBedrooms ? Number(minBedrooms) : undefined,
      minArea: minArea ? Number(minArea) : undefined,
      neighborhood: neighborhood || undefined,
      type,
      source,
      sort: "relevance",
      page: 1,
    };
    router.push(`/resultados?${filtersToSearchParams(filters).toString()}`);
  }

  return (
    <form className={`search-form ${compact ? "search-form--compact" : ""}`} onSubmit={submit}>
      <div className="search-form__main">
        <label className="search-field search-field--location">
          <span className="search-field__icon"><MapPinIcon size={19} /></span>
          <span className="search-field__content">
            <span className="search-field__label">Onde você quer morar?</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Garopaba, bairro ou praia" aria-label="Localização ou termos de busca" />
          </span>
        </label>
        <label className="search-field search-field--select">
          <span className="search-field__content">
            <span className="search-field__label">Tipo de imóvel</span>
            <select value={type} onChange={(event) => setType(event.target.value as PropertyType | "all")} aria-label="Tipo de imóvel">
              {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </span>
          <ChevronDownIcon size={15} />
        </label>
        <button type="submit" className="button button--search"><SearchIcon size={19} /> <span>Buscar imóveis</span></button>
      </div>

      <div className={`search-form__advanced ${showMore ? "is-open" : ""}`}>
        <label className="filter-control"><span>Preço mínimo</span><input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ""))} placeholder="R$ 0" /></label>
        <label className="filter-control"><span>Preço máximo</span><input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))} placeholder="Sem limite" /></label>
        <label className="filter-control"><span>Quartos</span><select value={minBedrooms} onChange={(event) => setMinBedrooms(event.target.value)}><option value="">Qualquer</option><option value="1">1 ou mais</option><option value="2">2 ou mais</option><option value="3">3 ou mais</option><option value="4">4 ou mais</option></select></label>
        <label className="filter-control"><span>Bairro ou praia</span><select value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)}><option value="">Todos os bairros</option><option value="Centro">Centro</option><option value="Ferrugem">Ferrugem</option><option value="Silveira">Silveira</option><option value="Siriú">Siriú</option><option value="Morrinhos">Morrinhos</option><option value="Campo Duna">Campo Duna</option><option value="Ambrósios">Ambrósios</option><option value="Pinguirito">Pinguirito</option></select></label>
        <label className="filter-control"><span>Área mínima</span><input inputMode="numeric" value={minArea} onChange={(event) => setMinArea(event.target.value.replace(/\D/g, ""))} placeholder="m²" /></label>
        <label className="filter-control"><span>Fonte</span><select value={source} onChange={(event) => setSource(event.target.value as PropertySource | "all")}>{sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <button type="button" className="search-form__toggle" onClick={() => setShowMore((value) => !value)}><SlidersIcon size={16} /> {showMore ? "Ocultar filtros" : "Mais filtros"}</button>
    </form>
  );
}

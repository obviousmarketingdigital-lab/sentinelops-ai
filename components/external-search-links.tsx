import { ExternalLinkIcon, SearchIcon, SparkleIcon } from "@/components/icons";
import { createExternalSearchLinks } from "@/lib/search/external-links";
import type { PropertyFilters } from "@/lib/domain/property";

export function ExternalSearchLinks({ filters }: { filters: PropertyFilters }) {
  const links = createExternalSearchLinks(filters);

  return (
    <section className="free-search-panel" aria-labelledby="free-search-title">
      <div className="free-search-panel__copy">
        <span className="free-search-panel__icon"><SparkleIcon size={17} /></span>
        <div>
          <span className="eyebrow">Pesquisa externa gratuita</span>
          <h2 id="free-search-title">Confira os portais originais</h2>
          <p>A Maré monta uma consulta do Google para cada fonte. Os cards acima são demonstrativos; estes links levam você aos resultados públicos de cada portal.</p>
        </div>
      </div>
      <div className="free-search-panel__links">
        {links.map((link) => (
          <a className={`portal-search-link portal-search-link--${link.source}`} href={link.url} target="_blank" rel="noopener noreferrer" key={link.source}>
            <span className="portal-search-link__logo">{link.label === "Imovelweb" ? "imovelweb" : link.label}</span>
            <span className="portal-search-link__action"><SearchIcon size={14} /> Pesquisar <ExternalLinkIcon size={13} /></span>
          </a>
        ))}
      </div>
      <p className="free-search-panel__note">A busca abre em uma nova aba do Google. A Maré não copia anúncios, fotos ou descrições, e os portais podem aplicar seus próprios filtros e regras de acesso.</p>
    </section>
  );
}

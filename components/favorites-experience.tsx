"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useMemo, useSyncExternalStore } from "react";
import { ArrowRightIcon, HeartIcon, MenuIcon } from "@/components/icons";
import { PropertyCard } from "@/components/property-card";
import { mockProperties } from "@/data/properties.mock";
import { readFavoriteIds, subscribeToFavorites, writeFavoriteIds } from "@/lib/favorites";

export function FavoritesExperience() {
  const favoriteIds = useSyncExternalStore(subscribeToFavorites, readFavoriteIds, () => []);
  const favoriteProperties = useMemo(() => {
    const byId = new Map(mockProperties.map((property) => [property.id, property]));
    return favoriteIds.flatMap((id) => {
      const property = byId.get(id);
      return property ? [property] : [];
    });
  }, [favoriteIds]);

  function clearFavorites() {
    if (favoriteIds.length > 0 && window.confirm("Remover todos os imóveis favoritos deste navegador?")) writeFavoriteIds([]);
  }

  return (
    <main className="results-page favorites-page">
      <header className="site-header site-header--results">
        <a className="brand" href="/"><span className="brand-mark"><span /></span><span>maré<span className="brand-dot">.</span></span></a>
        <nav className="desktop-nav"><a href="/resultados">Buscar imóveis</a><a href="/resultados#fontes">Nossas fontes</a><a href="/resultados#sobre">Sobre a Maré</a></nav>
        <div className="header-actions"><a className="header-link header-link--active" href="/favoritos">Favoritos</a><button className="button button--outline button--small">Anunciar imóvel</button><button className="mobile-menu" aria-label="Abrir menu"><MenuIcon /></button></div>
      </header>

      <section className="favorites-hero"><div className="container"><span className="eyebrow">Sua seleção</span><div className="favorites-heading"><div><h1>Imóveis favoritos</h1><p aria-live="polite">{favoriteProperties.length} {favoriteProperties.length === 1 ? "imóvel salvo" : "imóveis salvos"} neste navegador.</p></div><button className="button button--outline favorites-clear" onClick={clearFavorites} disabled={favoriteIds.length === 0}>Limpar favoritos</button></div></div></section>

      <section className="container favorites-content" aria-live="polite">
        {favoriteProperties.length > 0 ? <div className="property-grid">{favoriteProperties.map((property) => <PropertyCard property={property} key={property.id} />)}</div> : <div className="favorites-empty"><div className="favorites-empty__icon"><HeartIcon size={25} /></div><h2>Nenhum favorito por enquanto</h2><p>Salve os imóveis que combinam com você para encontrá-los rapidamente depois.</p><a className="button button--dark" href="/resultados">Explorar imóveis <ArrowRightIcon size={16} /></a></div>}
        <p className="favorites-note">Os favoritos ficam salvos somente neste navegador. Eles não exigem conta e não são sincronizados entre dispositivos.</p>
      </section>

      <footer className="site-footer"><div className="container footer-inner"><div><a className="brand brand--footer" href="/"><span className="brand-mark"><span /></span><span>maré<span className="brand-dot">.</span></span></a><p>Encontrar seu lugar<br />começa por aqui.</p></div><div className="footer-links"><div><strong>Explorar</strong><a href="/resultados">Todos os imóveis</a><a href="/resultados?type=house">Casas</a><a href="/resultados?type=land">Terrenos</a></div><div><strong>Sobre</strong><a href="/resultados#como-funciona">Como funciona</a><a href="/resultados#fontes">Nossas fontes</a><a href="/resultados#sobre">Contato</a></div></div></div><div className="container footer-bottom"><span>© 2026 Maré Imóveis · Garopaba, SC</span><span>Uma pesquisa, todos os lugares.</span></div></footer>
    </main>
  );
}

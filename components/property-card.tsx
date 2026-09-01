"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";
import { ArrowUpRightIcon, BathIcon, BedIcon, CarIcon, HeartIcon, RulerIcon } from "@/components/icons";
import { PROPERTY_TYPE_LABELS, type Property } from "@/lib/domain/property";
import { isFavorite, subscribeToFavorites, toggleFavoriteId } from "@/lib/favorites";

const formatPrice = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`)).replace(" de ", " ");

export function PropertyCard({ property, featured = false }: { property: Property; featured?: boolean }) {
  const favorite = useSyncExternalStore(
    subscribeToFavorites,
    () => isFavorite(property.id),
    () => false,
  );

  function toggleFavorite(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    toggleFavoriteId(property.id);
  }

  return (
    <article className={`property-card ${featured ? "property-card--featured" : ""}`}>
      <div className="property-card__image-wrap">
        <a href={property.originalUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir anúncio: ${property.title}`}>
          <Image className="property-card__image" alt="" width={900} height={620} src={property.imageUrl} />
          <span className={`source-badge source-badge--${property.source}`}>{property.sourceLabel}</span>
          <span className="property-card__fresh">Atualizado hoje</span>
        </a>
        <button className={`property-card__heart ${favorite ? "is-favorite" : ""}`} onClick={toggleFavorite} aria-label={favorite ? `Remover ${property.title} dos favoritos` : `Favoritar ${property.title}`} aria-pressed={favorite}><HeartIcon size={19} /></button>
      </div>
      <div className="property-card__body">
        <div className="property-card__meta"><span>{PROPERTY_TYPE_LABELS[property.type]}</span><span className="meta-dot">·</span><span>{property.locationLabel}</span></div>
        <a href={property.originalUrl} target="_blank" rel="noopener noreferrer" className="property-card__title">{property.title}</a>
        <p className="property-card__price">{formatPrice(property.price)}</p>
        <div className="property-card__details">
          {property.bedrooms !== null && <span><BedIcon /> {property.bedrooms} {property.bedrooms === 1 ? "quarto" : "quartos"}</span>}
          {property.bathrooms !== null && <span><BathIcon /> {property.bathrooms} {property.bathrooms === 1 ? "banheiro" : "banheiros"}</span>}
          {(property.builtArea ?? property.landArea) !== null && <span><RulerIcon /> {property.builtArea ?? property.landArea} m²</span>}
          {property.parkingSpaces !== null && <span><CarIcon /> {property.parkingSpaces} {property.parkingSpaces === 1 ? "vaga" : "vagas"}</span>}
        </div>
        <div className="property-card__footer"><span>Visto em {formatDate(property.lastSeenAt)}</span><a href={property.originalUrl} target="_blank" rel="noopener noreferrer">Ver anúncio <ArrowUpRightIcon size={14} /></a></div>
      </div>
    </article>
  );
}

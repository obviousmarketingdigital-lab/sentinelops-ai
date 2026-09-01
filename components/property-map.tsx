"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { Property } from "@/lib/domain/property";

const GAROPABA_CENTER: [number, number] = [-28.0275, -48.6192];
const GAROPABA_ZOOM = 12;
const formatPrice = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

const markerIcon = L.divIcon({
  className: "property-map__marker",
  html: "<span></span>",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

function MapViewport({ properties }: { properties: Property[] }) {
  const map = useMap();
  const points = useMemo(() => properties.map((property) => [property.coordinates.lat, property.coordinates.lng] as [number, number]), [properties]);

  useEffect(() => {
    if (points.length === 0) {
      map.setView(GAROPABA_CENTER, GAROPABA_ZOOM);
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }

    map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 14 });
  }, [map, points]);

  return null;
}

export function PropertyMap({ properties }: { properties: Property[] }) {
  return (
    <div className="property-map" aria-label="Mapa dos imóveis encontrados em Garopaba">
      <MapContainer center={GAROPABA_CENTER} zoom={GAROPABA_ZOOM} scrollWheelZoom className="property-map__canvas">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapViewport properties={properties} />
        {properties.map((property) => (
          <Marker key={property.id} position={[property.coordinates.lat, property.coordinates.lng]} icon={markerIcon}>
            <Popup>
              <div className="property-map__popup">
                <span className="property-map__popup-source">{property.sourceLabel}</span>
                <strong>{property.title}</strong>
                <span className="property-map__popup-location">{property.neighborhood}, Garopaba</span>
                <b>{formatPrice(property.price)}</b>
                <a href={property.originalUrl} target="_blank" rel="noopener noreferrer">Ver anúncio</a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {properties.length === 0 && <div className="property-map__empty">Nenhum imóvel com localização para mostrar.</div>}
    </div>
  );
}

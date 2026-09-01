type IconProps = { size?: number; stroke?: number; className?: string };

const base = (size: number, stroke: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: stroke,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  "aria-hidden": true,
});

export function SearchIcon({ size = 20, stroke = 2, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}
export function MapPinIcon({ size = 20, stroke = 2, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}
export function SlidersIcon({ size = 20, stroke = 2, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="M4 6h16M4 18h16M4 12h16" /><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" /></svg>;
}
export function ArrowRightIcon({ size = 18, stroke = 2, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
export function ArrowUpRightIcon({ size = 16, stroke = 2, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="M7 17 17 7M7 7h10v10" /></svg>;
}
export function HeartIcon({ size = 20, stroke = 1.8, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="M20.8 8.7c0 5.5-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z" /></svg>;
}
export function BedIcon({ size = 16, stroke = 1.8, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 14h18M6 9V6h5a2 2 0 0 1 2 2v1" /><path d="M3 18v2M21 18v2" /></svg>;
}
export function BathIcon({ size = 16, stroke = 1.8, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="M4 12h16M6 12V6a2 2 0 0 1 4 0v1M4 16c1 2 2 3 2 3M20 16c-1 2-2 3-2 3" /><path d="M3 12v2a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4v-2" /></svg>;
}
export function RulerIcon({ size = 16, stroke = 1.8, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="m4 20 16-16M5 15l4 4M8 12l4 4M11 9l4 4M14 6l4 4" /></svg>;
}
export function CarIcon({ size = 16, stroke = 1.8, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="m5 17 1-6h12l1 6M3 17h18M6 17v2M18 17v2M7 11l1-3h8l1 3" /><circle cx="7" cy="15" r="1" /><circle cx="17" cy="15" r="1" /></svg>;
}
export function ChevronDownIcon({ size = 16, stroke = 2, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="m6 9 6 6 6-6" /></svg>;
}
export function XIcon({ size = 18, stroke = 2, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
export function CheckIcon({ size = 16, stroke = 2, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="m4 12 5 5L20 6" /></svg>;
}
export function SunIcon({ size = 18, stroke = 1.8, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
}
export function MenuIcon({ size = 22, stroke = 2, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
}
export function LayoutGridIcon({ size = 18, stroke = 1.8, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}
export function ListIcon({ size = 18, stroke = 1.8, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></svg>;
}
export function ExternalLinkIcon({ size = 14, stroke = 2, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>;
}
export function HomeIcon({ size = 18, stroke = 1.8, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
}
export function SparkleIcon({ size = 16, stroke = 1.8, className }: IconProps) {
  return <svg {...base(size, stroke, className)}><path d="m12 3-1.2 4.8L6 9l4.8 1.2L12 15l1.2-4.8L18 9l-4.8-1.2L12 3ZM19 15l-.6 2.4L16 18l2.4.6L19 21l.6-2.4L22 18l-2.4-.6L19 15Z" /></svg>;
}

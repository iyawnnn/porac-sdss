// Category -> icon and colour, shared by the admin and citizen maps and the citizen dashboard.
// Kept free of Leaflet and react-dom/server so Server Components can import it; the Leaflet
// marker builders live in lib/gis/categoryMarker.tsx.
import {
  Construction,
  Droplet,
  Droplets,
  LightbulbOff,
  Mountain,
  Sprout,
  Trash,
  Trash2,
  TreePine,
  Waves,
  Wrench,
  CircleDot,
  Disc,
  type LucideIcon,
} from "lucide-react";

export interface CategoryMarkerSpec {
  icon: LucideIcon;
  color: string;
}

export const CATEGORY_MARKER_SPEC: Record<string, CategoryMarkerSpec> = {
  // Manuscript-aligned category strings (Phase 3 follow-up).
  // Names and the drainage/manhole split from manuscript revision Phase 2,
  // step 2a; the renamed ones keep their old icon and colour.
  "Pothole / Road Surface Damage": { icon: CircleDot, color: "#ea580c" },
  "Damaged Manhole Cover": { icon: Disc, color: "#4338ca" },
  "Clogged Drainage / Damaged Culvert": { icon: Droplets, color: "#0891b2" },
  "Localized Flooding": { icon: Waves, color: "#2563eb" },
  "Rain-Induced Slope Failure/Landslide": { icon: Mountain, color: "#78350f" },
  "Lahar or Volcanic Debris-Flow Threat": { icon: Waves, color: "#9a3412" },
  "Fallen Tree or Storm-Related Road Obstruction": { icon: TreePine, color: "#16a34a" },
  "Illegal Dumping Affecting Drainage or Road": { icon: Trash2, color: "#7c3aed" },
  "Overgrown Vegetation Obstructing Road or Signage": { icon: Sprout, color: "#65a30d" },
  "Leaking Pipe / Water Supply Concern": { icon: Droplet, color: "#0d9488" },
  "Other Minor Infrastructure Hazard": { icon: Wrench, color: "#64748b" },
  // Unchanged names, shared by both the legacy and new category sets.
  "Uneven Sidewalk": { icon: Construction, color: "#b45309" },
  "Streetlight Out": { icon: LightbulbOff, color: "#eab308" },

  // Legacy category strings — kept so historical tickets keep their
  // original marker instead of falling back to the generic "Other" icon.
  Flooding: { icon: Waves, color: "#2563eb" },
  "Clogged Drain": { icon: Droplets, color: "#0891b2" },
  "Fallen Tree": { icon: TreePine, color: "#16a34a" },
  Pothole: { icon: CircleDot, color: "#ea580c" },
  "Leaking Pipe": { icon: Droplet, color: "#0d9488" },
  "Uncollected Garbage": { icon: Trash, color: "#78716c" },
  "Illegal Dumping": { icon: Trash2, color: "#7c3aed" },
  "Overgrown Vegetation": { icon: Sprout, color: "#65a30d" },
  Other: { icon: Wrench, color: "#64748b" },
  // Retired in manuscript revision Phase 2, step 2a (see LEGACY_CATEGORIES in
  // api/src/contracts/schemas.ts).
  "Drainage / Culvert / Manhole Issue": { icon: Droplets, color: "#0891b2" },
  "Landslide / Slope Failure": { icon: Mountain, color: "#78350f" },
  "Lahar / Debris-Flow Threat": { icon: Waves, color: "#9a3412" },
  "Fallen Tree / Storm-Related Obstruction": { icon: TreePine, color: "#16a34a" },
};
const DEFAULT_CATEGORY_SPEC: CategoryMarkerSpec = CATEGORY_MARKER_SPEC.Other;

export function getCategoryMarkerSpec(category: string): CategoryMarkerSpec {
  return CATEGORY_MARKER_SPEC[category] ?? DEFAULT_CATEGORY_SPEC;
}

// White icons fail on the light hues (Streetlight yellow is under 2:1), so those get a dark glyph.
export function glyphColor(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#18181b" : "#ffffff";
}



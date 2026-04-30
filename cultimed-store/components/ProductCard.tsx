import Link from "next/link";
import { formatCLP } from "@/lib/format";

interface ProductLite {
  id: number;
  sku: string;
  name: string;
  category: string;
  presentation: string | null;
  default_price: number;
  thc_percentage: number | null;
  cbd_percentage: number | null;
  vendor: string | null;
  is_house_brand: number;
  description: string | null;
  image_url?: string | null;
  slug?: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  flores: "Flor",
  aceite_cbd: "Aceite",
  capsulas: "Cápsula",
  topico: "Tópico",
  farmaceutico: "Farma",
  otro: "Producto",
};

export default function ProductCard({
  product: p,
  index = 0,
  showPrice = false,
}: {
  product: ProductLite;
  index?: number;
  showPrice?: boolean;
}) {
  // Strip "(XXg)" suffix from name and treat as separate
  const presentationFromName = p.name.match(/\(([^)]+)\)\s*$/)?.[1];
  const cleanName = p.name.replace(/\s*\(([^)]+)\)\s*$/, "").trim();
  const presentation = presentationFromName || p.presentation || "";

  const slug = p.slug || p.sku.toLowerCase();

  return (
    <Link
      href={`/productos/${slug}`}
      className="group block opacity-0 animate-fade-up"
      style={{ animationDelay: `${0.1 + index * 0.08}s` }}
    >
      {/* Image well — botanical visual */}
      <div className="relative aspect-[4/5] mb-6 overflow-hidden bg-paper-dim">
        <BotanicalIllustration
          category={p.category}
          accent={p.is_house_brand ? "forest" : "brass"}
        />
        {/* Hover hint */}
        <div className="absolute bottom-4 right-4 transition-all duration-500 ease-editorial opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0">
          <span className="text-[10px] tracking-widest uppercase font-mono px-3 py-1.5 bg-paper-bright text-ink">
            Ver ficha →
          </span>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-widest text-ink-muted mb-2">
        <span className="font-mono">{CATEGORY_LABEL[p.category] || p.category}</span>
        {presentation && <span className="font-mono">{presentation}</span>}
      </div>

      {/* Name */}
      <h3 className="font-display text-2xl lg:text-3xl leading-[1.05] mb-1 text-balance">
        <span className="font-light">{cleanName.split(" ")[0]}</span>{" "}
        <span className="italic font-normal">{cleanName.split(" ").slice(1).join(" ")}</span>
      </h3>

      {/* Vendor */}
      {p.vendor && (
        <p className="text-xs text-ink-muted mb-3 italic">
          {p.is_house_brand ? "Línea Cultimed" : `por ${p.vendor}`}
        </p>
      )}

      {/* Cannabinoid data row */}
      <div className="flex items-baseline gap-6 text-[11px] uppercase tracking-widest font-mono text-ink-muted nums-lining mb-4">
        {p.thc_percentage !== null && (
          <span>
            THC <span className="text-ink">{p.thc_percentage}%</span>
          </span>
        )}
        {p.cbd_percentage !== null && (
          <span>
            CBD <span className="text-ink">{p.cbd_percentage}%</span>
          </span>
        )}
      </div>

      {/* Price / prescription row */}
      <div className="flex items-baseline justify-between border-t border-rule pt-3">
        {showPrice ? (
          <span className="font-mono text-sm text-ink nums-lining">
            {formatCLP(p.default_price)}
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-widest font-mono text-sangria flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-sangria" />
            Receta requerida
          </span>
        )}
        <span className="text-[10px] uppercase tracking-widest font-mono text-ink-subtle group-hover:text-ink transition-colors">
          → Ficha técnica
        </span>
      </div>
    </Link>
  );
}

// SVG botanical illustrations - one per category, generated client-side
function BotanicalIllustration({ category, accent }: { category: string; accent: "forest" | "brass" }) {
  const accentColor = accent === "forest" ? "#1F3A2D" : "#A98B5C";
  return (
    <svg
      viewBox="0 0 400 500"
      className="absolute inset-0 w-full h-full transition-transform duration-700 ease-editorial group-hover:scale-105"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id={`bg-${category}-${accent}`} cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#FAF6EE" />
          <stop offset="100%" stopColor="#EBE5D9" />
        </radialGradient>
        <pattern id={`grain-${category}`} width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.4" fill={accentColor} opacity="0.06" />
        </pattern>
      </defs>
      <rect width="400" height="500" fill={`url(#bg-${category}-${accent})`} />
      <rect width="400" height="500" fill={`url(#grain-${category})`} />

      {/* Category-specific botanical mark */}
      {category === "flores" && <FlowerMark color={accentColor} />}
      {category === "aceite_cbd" && <DropMark color={accentColor} />}
      {category === "capsulas" && <CapsuleMark color={accentColor} />}
      {category === "topico" && <JarMark color={accentColor} />}
      {(category !== "flores" && category !== "aceite_cbd" && category !== "capsulas" && category !== "topico") && (
        <LeafMark color={accentColor} />
      )}

      {/* Editorial frame */}
      <line x1="32" y1="32" x2="60" y2="32" stroke={accentColor} strokeWidth="1" opacity="0.4" />
      <line x1="32" y1="32" x2="32" y2="60" stroke={accentColor} strokeWidth="1" opacity="0.4" />
      <line x1="368" y1="468" x2="340" y2="468" stroke={accentColor} strokeWidth="1" opacity="0.4" />
      <line x1="368" y1="468" x2="368" y2="440" stroke={accentColor} strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

function FlowerMark({ color }: { color: string }) {
  return (
    <g transform="translate(200, 250)" stroke={color} strokeWidth="1" fill="none" opacity="0.7">
      {/* Cannabis-like leaf, stylized */}
      <g strokeLinecap="round" strokeLinejoin="round">
        {[-72, -54, -36, -18, 0, 18, 36, 54, 72].map((rot, i) => {
          const len = 90 - Math.abs(rot) * 0.8;
          return (
            <path
              key={i}
              d={`M0 0 Q ${Math.sin((rot * Math.PI) / 180) * 30} ${-len * 0.4}, ${Math.sin((rot * Math.PI) / 180) * len} ${-Math.cos((rot * Math.PI) / 180) * len}`}
            />
          );
        })}
      </g>
      <circle cx="0" cy="20" r="3" fill={color} opacity="0.5" />
      <line x1="0" y1="20" x2="0" y2="120" stroke={color} strokeWidth="0.8" />
    </g>
  );
}

function DropMark({ color }: { color: string }) {
  return (
    <g transform="translate(200, 240)" stroke={color} strokeWidth="1.2" fill="none" opacity="0.7">
      <path d="M0 -110 C 50 -50, 70 0, 70 50 C 70 90, 35 120, 0 120 C -35 120, -70 90, -70 50 C -70 0, -50 -50, 0 -110 Z" />
      <path d="M-25 60 Q 0 80, 25 60" opacity="0.4" />
      <circle cx="-15" cy="30" r="4" fill={color} opacity="0.2" />
    </g>
  );
}

function CapsuleMark({ color }: { color: string }) {
  return (
    <g transform="translate(200, 250)" stroke={color} strokeWidth="1.2" fill="none" opacity="0.7">
      <rect x="-50" y="-20" width="100" height="40" rx="20" />
      <line x1="0" y1="-20" x2="0" y2="20" />
      <rect x="-50" y="-20" width="50" height="40" rx="20" fill={color} opacity="0.08" />
    </g>
  );
}

function JarMark({ color }: { color: string }) {
  return (
    <g transform="translate(200, 250)" stroke={color} strokeWidth="1.2" fill="none" opacity="0.7">
      <rect x="-50" y="-30" width="100" height="20" />
      <rect x="-60" y="-10" width="120" height="100" />
      <line x1="-40" y1="20" x2="40" y2="20" opacity="0.4" />
      <line x1="-40" y1="40" x2="40" y2="40" opacity="0.3" />
    </g>
  );
}

function LeafMark({ color }: { color: string }) {
  return (
    <g transform="translate(200, 250)" stroke={color} strokeWidth="1.2" fill="none" opacity="0.7">
      <path d="M0 -100 Q 60 -50, 60 30 Q 30 90, 0 90 Q -30 90, -60 30 Q -60 -50, 0 -100 Z" />
      <line x1="0" y1="-100" x2="0" y2="90" />
      <path d="M0 -50 Q 30 -30, 40 0" opacity="0.5" />
      <path d="M0 -50 Q -30 -30, -40 0" opacity="0.5" />
      <path d="M0 0 Q 25 10, 35 30" opacity="0.5" />
      <path d="M0 0 Q -25 10, -35 30" opacity="0.5" />
    </g>
  );
}

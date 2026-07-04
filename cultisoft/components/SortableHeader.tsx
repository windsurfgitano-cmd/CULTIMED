import Link from "next/link";

/**
 * <th> ordenable estilo Excel: click alterna asc/desc sobre esa columna.
 * No requiere JS en el cliente -- reusa el mismo patron buildHref() que ya
 * usan los filtros de estas paginas (todo vive en la URL, la pagina server
 * component vuelve a consultar con el ORDER BY correspondiente).
 */
export default function SortableHeader({
  label,
  field,
  currentSort,
  currentDir,
  buildHref,
  align,
}: {
  label: string;
  field: string;
  currentSort: string | null;
  currentDir: "asc" | "desc";
  buildHref: (overrides: Record<string, string | undefined>) => string;
  align?: "right";
}) {
  const isActive = currentSort === field;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";
  const icon = isActive ? (currentDir === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more";

  return (
    <th className={align === "right" ? "text-right" : ""}>
      <Link
        href={buildHref({ sort: field, dir: nextDir })}
        className="group inline-flex items-center gap-1 hover:text-on-surface transition-colors"
      >
        {label}
        <span
          className={`material-symbols-outlined text-[14px] transition-opacity ${
            isActive ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-40"
          }`}
        >
          {icon}
        </span>
      </Link>
    </th>
  );
}

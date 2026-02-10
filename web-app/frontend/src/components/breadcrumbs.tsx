"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { Suspense } from "react";

const pathLabels: Record<string, string> = {
  "": "Главная",
  search: "Поиск",
  events: "События",
  tree: "Древо",
  favorites: "Избранное",
  stats: "Статистика",
  kinship: "Родство",
  person: "Персона",
  login: "Вход",
  settings: "Настройки",
  users: "Пользователи",
  admin: "Управление",
  persons: "Список",
  audit: "Журнал",
};

function BreadcrumbsContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname === "/" || pathname === "/login") return null;

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [
    { label: "Главная", href: "/" },
  ];

  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`;
    const label = pathLabels[segments[i]] || segments[i];
    crumbs.push({ label, href: currentPath });
  }

  // Add ID context for person page
  const id = searchParams.get("id");
  if (pathname === "/person" && id) {
    crumbs[crumbs.length - 1].label = `Персона #${id}`;
  }

  return (
    <nav aria-label="Навигация" className="max-w-7xl mx-auto px-4 md:px-6 pt-3 pb-0">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              {isLast ? (
                <span className="text-foreground font-medium truncate max-w-[200px]">
                  {i === 0 && <Home className="h-3 w-3 inline mr-1" />}
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="hover:text-foreground transition-colors truncate max-w-[150px]"
                >
                  {i === 0 && <Home className="h-3 w-3 inline mr-1" />}
                  {i === 0 ? "" : crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Breadcrumbs() {
  return (
    <Suspense>
      <BreadcrumbsContent />
    </Suspense>
  );
}

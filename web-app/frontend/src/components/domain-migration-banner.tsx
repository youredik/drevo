"use client";

import { useEffect, useState } from "react";

const NEW_DOMAIN = "nashedrevo2.ru";

export function DomainMigrationBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    const dismissed = localStorage.getItem("drevo_domain_banner_dismissed");
    // Show banner on old domain (nashe-drevo.ru) only, not on localhost or new domain
    if (host.includes("nashe-drevo.ru") && !dismissed) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const newUrl = `https://${NEW_DOMAIN}${typeof window !== "undefined" ? window.location.pathname + window.location.search : ""}`;

  return (
    <div className="bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-white px-4 py-3 text-sm shadow-md">
      <div className="max-w-5xl mx-auto flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <strong className="font-semibold">Сайт переехал.</strong>{" "}
          Новый адрес: <a href={newUrl} className="underline font-semibold hover:no-underline">{NEW_DOMAIN}</a>.
          Сохраните в закладки — старый домен может перестать открываться.
        </div>
        <div className="flex gap-2">
          <a
            href={newUrl}
            className="bg-amber-950 dark:bg-white text-amber-50 dark:text-amber-900 px-4 py-1.5 rounded font-semibold hover:opacity-90 transition"
          >
            Перейти
          </a>
          <button
            onClick={() => {
              localStorage.setItem("drevo_domain_banner_dismissed", "1");
              setShow(false);
            }}
            className="text-amber-950 dark:text-white hover:opacity-70 transition px-2"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

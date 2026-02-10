"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { api, mediaUrl, SearchResult } from "@/lib/api";
import { toast } from "sonner";

export default function SearchPage() {
  return <Suspense><SearchContent /></Suspense>;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sexFilter, setSexFilter] = useState<"all" | "male" | "female">("all");
  const [aliveFilter, setAliveFilter] = useState<"all" | "alive" | "dead">("all");

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.search(q.trim());
      setResults(data.results);
      setSearched(true);
    } catch (e: any) {
      toast.error(e.message || "Ошибка поиска");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) doSearch(initialQuery);
  }, [initialQuery, doSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) doSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const matchFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      id: "ID",
      name: "Имя",
      address: "Адрес",
      birthPlace: "Место рождения",
      birthDay: "Дата рождения",
      deathDay: "Дата смерти",
      marryDay: "Дата свадьбы",
    };
    return labels[field] || field;
  };

  const filteredResults = results.filter((r) => {
    if (sexFilter === "male" && r.sex !== 1) return false;
    if (sexFilter === "female" && r.sex !== 0) return false;
    const isAlive = !r.deathDay || r.deathDay.trim() === "";
    if (aliveFilter === "alive" && !isAlive) return false;
    if (aliveFilter === "dead" && isAlive) return false;
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Поиск</h1>

      <div className="relative mb-6">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Имя, фамилия, дата, адрес..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 h-12 text-base"
          autoFocus
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div role="group" aria-label="Фильтр по полу" className="flex flex-wrap gap-2">
          {[
            { key: "all" as const, label: "Все" },
            { key: "male" as const, label: "Мужчины" },
            { key: "female" as const, label: "Женщины" },
          ].map((f) => (
            <Button
              key={f.key}
              variant={sexFilter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setSexFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="w-px bg-border mx-1" />
        <div role="group" aria-label="Фильтр по статусу" className="flex flex-wrap gap-2">
          {[
            { key: "all" as const, label: "Все" },
            { key: "alive" as const, label: "Живые" },
            { key: "dead" as const, label: "Умершие" },
          ].map((f) => (
            <Button
              key={f.key}
              variant={aliveFilter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setAliveFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      )}

      {!loading && searched && (
        <p className="text-sm text-muted-foreground mb-4">
          {results.length > 0 ? `Найдено: ${filteredResults.length} из ${results.length}` : "Ничего не найдено"}
        </p>
      )}

      {!loading && (
        <div className="space-y-2">
          {filteredResults.map((r) => {
            const isAlive = !r.deathDay || r.deathDay.trim() === "";
            return (
              <Link key={r.id} href={`/person?id=${r.id}`} prefetch={false}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${
                      isAlive ? "bg-primary" : "bg-destructive"
                    }`}>
                      {r.id}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {r.lastName} {r.firstName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {r.age && <span className="text-xs text-muted-foreground">{r.age}</span>}
                        {r.birthDay && (
                          <span className="text-xs text-muted-foreground">{r.birthDay}</span>
                        )}
                        {r.address && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {r.address}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {matchFieldLabel(r.matchField)}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

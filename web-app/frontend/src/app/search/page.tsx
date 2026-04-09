"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search as SearchIcon, Clock, X, Mic } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SearchResult, mediaUrl } from "@/lib/api";
import { useSearch } from "@/lib/swr";
import { AnimatedItem } from "@/components/animated-list";
import { SafeImage } from "@/components/safe-image";
import { useVoiceSearch } from "@/hooks/use-voice-search";

const RECENT_SEARCHES_KEY = "drevo_recent_searches";
const MAX_RECENT = 5;

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string");
  } catch {}
  return [];
}

function saveRecentSearch(query: string) {
  try {
    const existing = loadRecentSearches();
    const deduped = [query, ...existing.filter((s) => s !== query)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(deduped));
    return deduped;
  } catch {}
  return [];
}

function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {}
}

export default function SearchPage() {
  return <Suspense><SearchContent /></Suspense>;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [sexFilter, setSexFilter] = useState<"all" | "male" | "female">("all");
  const [aliveFilter, setAliveFilter] = useState<"all" | "alive" | "dead">("all");
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const { listening, toggle: toggleVoice, supported: voiceSupported } = useVoiceSearch({
    onResult: useCallback((text: string) => {
      setQuery(text);
      setDebouncedQuery(text);
    }, []),
  });

  const { data: searchData, isLoading: loading } = useSearch(debouncedQuery);
  const results: SearchResult[] = searchData?.results ?? [];
  const searched = debouncedQuery.trim().length >= 2 && !loading;

  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      if (query.trim().length >= 2) {
        saveRecentSearch(query.trim());
        setRecentSearches(loadRecentSearches());
        const url = new URL(window.location.href);
        url.searchParams.set("q", query.trim());
        window.history.replaceState({}, "", url.toString());
      } else if (!query.trim()) {
        const url = new URL(window.location.href);
        url.searchParams.delete("q");
        window.history.replaceState({}, "", url.toString());
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const filteredResults = results.filter((r) => {
    if (sexFilter === "male" && r.sex !== 1) return false;
    if (sexFilter === "female" && r.sex !== 0) return false;
    const isAlive = !r.deathDay || r.deathDay.trim() === "";
    if (aliveFilter === "alive" && !isAlive) return false;
    if (aliveFilter === "dead" && isAlive) return false;
    return true;
  });

  const handleRecentClick = (recent: string) => {
    setQuery(recent);
    setDebouncedQuery(recent);
    inputRef.current?.focus();
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  const showRecent = focused && !query.trim() && recentSearches.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Поиск</h1>

      <div className="relative mb-6 glass rounded-xl p-1">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Имя, фамилия, дата, адрес..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setTimeout(() => setFocused(false), 150);
          }}
          className={`pl-10 ${voiceSupported ? "pr-10" : ""} h-12 text-base`}
          autoFocus
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors ${
              listening
                ? "text-red-500 animate-pulse bg-red-500/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={listening ? "Остановить запись" : "Голосовой поиск"}
          >
            <Mic className="h-5 w-5" />
          </button>
        )}

        {showRecent && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            {recentSearches.map((recent) => (
              <button
                key={recent}
                type="button"
                onClick={() => handleRecentClick(recent)}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-3 py-1 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {recent}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClearRecent}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
              Очистить
            </button>
          </div>
        )}
      </div>

      {results.length > 0 && (
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
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 rounded-lg border p-2">
              <Skeleton className="h-[90px] w-[90px] rounded-md shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-[60%] rounded" />
                <Skeleton className="h-3 w-[40%] rounded" />
                <Skeleton className="h-3 w-[50%] rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && searched && (
        <p className="text-sm text-muted-foreground mb-4">
          {results.length > 0 ? `Найдено: ${filteredResults.length} из ${results.length}` : "Ничего не найдено"}
        </p>
      )}

      {!loading && (
        <div className="space-y-2">
          {filteredResults.map((r, i) => (
              <AnimatedItem key={r.id} index={i}>
                <Link href={`/person?id=${r.id}`} prefetch={false}>
                  <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow cursor-pointer rounded-lg py-0">
                    <CardContent className="flex gap-3 p-2" style={{ background: "linear-gradient(180deg, #bbbbdd, #ddddff)", backgroundColor: "#84FFFF" }}>
                      <SafeImage
                        src={mediaUrl(r.photo)}
                        alt={`${r.lastName} ${r.firstName}`}
                        loading="lazy"
                        className="h-[90px] w-[90px] rounded-md object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0 py-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-black font-serif truncate">
                            {r.lastName} {r.firstName}
                          </p>
                          <span className="text-xs font-bold shrink-0" style={{ color: "#011CC7" }}>{i + 1}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {r.birthDay && <span className="text-sm font-serif" style={{ color: "#004400" }}>{r.birthDay}</span>}
                          {r.deathDay && <span className="text-sm font-serif" style={{ color: "#CC0000" }}>{r.deathDay}</span>}
                        </div>
                        {r.address && <p className="font-bold text-black font-serif mt-0.5 truncate" style={{ fontSize: "12px" }}>{r.address}</p>}
                        <div className="flex items-center justify-between mt-0.5 gap-2">
                          {r.age ? <span className="text-sm">{r.age}</span> : <span />}
                          <span className="text-xs text-black shrink-0">#{r.id}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </AnimatedItem>
            ))}
        </div>
      )}
    </div>
  );
}

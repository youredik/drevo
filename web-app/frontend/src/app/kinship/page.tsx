"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { GitFork, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, mediaUrl, PersonCard } from "@/lib/api";
import { PersonSearchSelect } from "@/components/person-search-select";
import { SafeImage } from "@/components/safe-image";
import { getRecentPersons } from "@/lib/recent-persons";
import { useData } from "@/lib/data-context";
import { Clock, Heart } from "lucide-react";

export default function KinshipPage() {
  return <Suspense><KinshipContent /></Suspense>;
}

function KinshipContent() {
  const searchParams = useSearchParams();
  const initialId1 = Number(searchParams.get("id1")) || 0;
  const initialId2 = Number(searchParams.get("id2")) || 0;

  const [personId1, setPersonId1] = useState<number | undefined>(initialId1 || undefined);
  const [personId2, setPersonId2] = useState<number | undefined>(initialId2 || undefined);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Quick-pick sources for the second person
  const [recent, setRecent] = useState<PersonCard[]>([]);
  const [favorites, setFavorites] = useState<PersonCard[]>([]);
  const { repo } = useData();

  useEffect(() => {
    if (repo) {
      setFavorites(repo.getFavoriteCards());
      const ids = getRecentPersons();
      setRecent(ids.map(id => repo.getPersonCard(id)).filter((c): c is PersonCard => c !== null));
      return;
    }
    let cancelled = false;
    api.getFavorites()
      .then((data) => { if (!cancelled) setFavorites(data.favorites); })
      .catch(() => {});
    const ids = getRecentPersons();
    if (ids.length > 0) {
      Promise.all(ids.map((id) => api.getPerson(id).catch(() => null)))
        .then((cards) => {
          if (cancelled) return;
          setRecent(cards.filter((c): c is PersonCard => c !== null));
        });
    }
    return () => { cancelled = true; };
  }, [repo]);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId1 || !personId2) {
      setError("Выберите обоих людей");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (repo) {
        const data = repo.checkKinship(personId1, personId2);
        setResult(data);
      } else {
        const data = await api.getKinship(personId1, personId2);
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialId1 && initialId2) {
      setLoading(true);
      if (repo) {
        setResult(repo.checkKinship(initialId1, initialId2));
        setLoading(false);
      } else {
        api.getKinship(initialId1, initialId2)
          .then(setResult)
          .catch((err) => setError(err.message))
          .finally(() => setLoading(false));
      }
    }
  }, [initialId1, initialId2]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Проверка родства</h1>

      <Card className="glass glass-hover mb-6">
        <CardContent className="py-4">
          <form onSubmit={handleCheck} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <PersonSearchSelect
                value={personId1}
                onChange={setPersonId1}
                placeholder="Первый человек..."
                excludeIds={personId2 ? [personId2] : []}
              />
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90 sm:rotate-0" />
            </div>
            <div className="flex-1">
              <PersonSearchSelect
                value={personId2}
                onChange={setPersonId2}
                placeholder="Второй человек..."
                excludeIds={personId1 ? [personId1] : []}
              />
            </div>
            <Button type="submit" disabled={loading || !personId1 || !personId2}>
              {loading ? "..." : "Проверить"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <div className="text-destructive text-sm mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}

      {/* Quick-pick: choose the second person from recent or favorites */}
      {personId1 && !result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <QuickPickPanel
            title="Из истории просмотров"
            icon={<Clock className="h-4 w-4" />}
            items={recent}
            excludeId={personId1}
            selectedId={personId2}
            onPick={setPersonId2}
            emptyText="История пуста — откройте кого-нибудь из людей."
          />
          <QuickPickPanel
            title="Из избранного"
            icon={<Heart className="h-4 w-4 text-red-500" />}
            items={favorites}
            excludeId={personId1}
            selectedId={personId2}
            onPick={setPersonId2}
            emptyText="Избранное пусто — добавьте людей на их страницах."
          />
        </div>
      )}

      {loading && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-center gap-6">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          <Skeleton className="h-8 w-40 mx-auto rounded-full" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      )}

      {!loading && result && (
        <div className="space-y-4">
          {/* Relationship */}
          <Card className="glass glass-hover">
            <CardContent className="py-6 text-center">
              <Badge className="text-lg px-4 py-2 mb-4">{result.relationship}</Badge>
              <div className="flex items-center justify-center gap-6">
                <PersonChip person={result.person1} />
                <GitFork className="h-6 w-6 text-muted-foreground" />
                <PersonChip person={result.person2} />
              </div>
            </CardContent>
          </Card>

          {/* Common ancestor */}
          {result.commonAncestor && (
            <Card className="glass glass-hover">
              <CardHeader>
                <CardTitle className="text-base">Общий предок</CardTitle>
              </CardHeader>
              <CardContent>
                <PersonChip person={result.commonAncestor} />
              </CardContent>
            </Card>
          )}

          {/* Paths */}
          {(result.pathFromPerson1.length > 0 || result.pathFromPerson2.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.pathFromPerson1.length > 0 && (
                <Card className="glass glass-hover">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Линия: {result.person1.lastName} {result.person1.firstName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.pathFromPerson1.map((p: any, i: number) => (
                      <div key={p.id} className="flex items-center gap-2">
                        {i > 0 && <span className="text-muted-foreground ml-2">↑</span>}
                        <PersonChip person={p} small />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {result.pathFromPerson2.length > 0 && (
                <Card className="glass glass-hover">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Линия: {result.person2.lastName} {result.person2.firstName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.pathFromPerson2.map((p: any, i: number) => (
                      <div key={p.id} className="flex items-center gap-2">
                        {i > 0 && <span className="text-muted-foreground ml-2">↑</span>}
                        <PersonChip person={p} small />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PersonChip({ person, small = false }: { person: any; small?: boolean }) {
  return (
    <Link
      href={`/person?id=${person.id}`}
      className="flex items-center gap-2 hover:bg-muted rounded-lg px-2 py-1 transition-colors card-press"
    >
      <SafeImage
        src={mediaUrl(person.photo)}
        alt=""
        loading="lazy"
        className={`rounded-full object-cover bg-muted shrink-0 ${small ? "h-8 w-8" : "h-10 w-10"}`}
      />
      <div>
        <p className={`font-medium ${small ? "text-xs" : "text-sm"}`}>
          {person.lastName} {person.firstName}
        </p>
        {person.age && (
          <p className="text-xs text-muted-foreground">{person.age}</p>
        )}
      </div>
    </Link>
  );
}

function QuickPickPanel({
  title,
  icon,
  items,
  excludeId,
  selectedId,
  onPick,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: PersonCard[];
  excludeId?: number;
  selectedId?: number;
  onPick: (id: number) => void;
  emptyText: string;
}) {
  const filtered = items.filter((c) => c.person.id !== excludeId);
  return (
    <Card className="glass">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
          {filtered.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({filtered.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">{emptyText}</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-72 overflow-y-auto pr-1">
            {filtered.map((card) => {
              const p = card.person;
              const isAlive = !p.deathDay || p.deathDay.trim() === "";
              const photo = card.photos?.[0] || (p.sex === 1 ? "m.jpg" : "w.jpg");
              const isSelected = selectedId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p.id)}
                  className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-colors card-press ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border/50 hover:bg-muted/50"
                  }`}
                >
                  <SafeImage
                    src={mediaUrl(photo)}
                    alt=""
                    loading="lazy"
                    className={`h-12 w-12 rounded-full object-cover ring-2 ${
                      isAlive ? "ring-emerald-400" : "ring-red-400"
                    }`}
                  />
                  <span className="text-[10px] font-medium leading-tight text-center max-w-full truncate w-full">
                    {p.firstName}
                  </span>
                  <span className="text-[9px] leading-tight text-muted-foreground truncate w-full text-center">
                    {p.lastName}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { GitFork, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, mediaUrl } from "@/lib/api";
import { PersonSearchSelect } from "@/components/person-search-select";
import { SafeImage } from "@/components/safe-image";

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

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId1 || !personId2) {
      setError("Выберите обоих людей");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await api.getKinship(personId1, personId2);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialId1 && initialId2) {
      setLoading(true);
      api
        .getKinship(initialId1, initialId2)
        .then(setResult)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
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

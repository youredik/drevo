"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, mediaUrl } from "@/lib/api";

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getFavorites()
      .then((data) => setFavorites(data.favorites))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const removeFav = async (personId: number) => {
    try {
      await api.removeFavorite(personId);
      setFavorites((prev) => prev.filter((f) => f.person.id !== personId));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Heart className="h-6 w-6 text-red-500" />
        <h1 className="text-2xl font-bold">Избранное</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Heart className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Нет избранных</p>
            <p className="text-sm mt-1">Добавьте людей в избранное на их странице</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {favorites.map((card: any) => {
            const p = card.person;
            const isAlive = !p.deathDay || p.deathDay.trim() === "";
            const photo = card.photos?.[0] || (p.sex === 1 ? "m.jpg" : "w.jpg");
            return (
              <Card key={p.id} className="group relative overflow-hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 z-10 h-7 w-7 bg-black/40 text-white hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.preventDefault(); removeFav(p.id); }}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Link href={`/person?id=${p.id}`}>
                  <CardContent className="flex flex-col items-center text-center gap-2 py-4">
                    <img
                      src={mediaUrl(photo)}
                      alt={`${p.lastName} ${p.firstName}`}
                      className={`h-20 w-20 rounded-xl object-cover ring-2 ${isAlive ? "ring-emerald-400" : "ring-red-400"}`}
                    />
                    <div>
                      <p className="font-medium text-sm truncate">{p.lastName}</p>
                      <p className="font-medium text-sm truncate">{p.firstName}</p>
                    </div>
                    {card.age && (
                      <Badge variant={isAlive ? "secondary" : "destructive"} className="text-xs">
                        {card.age}
                      </Badge>
                    )}
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

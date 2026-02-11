"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, mediaUrl, PersonCard } from "@/lib/api";
import { toast } from "sonner";
import { AnimatedItem } from "@/components/animated-list";

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<PersonCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getFavorites()
      .then((data) => setFavorites(data.favorites))
      .catch((e) => toast.error(e.message || "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, []);

  const removeFav = async (personId: number) => {
    try {
      await api.removeFavorite(personId);
      setFavorites((prev) => prev.filter((f) => f.person.id !== personId));
    } catch (e: any) {
      toast.error(e.message || "Не удалось удалить из избранного");
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
            <div key={i} className="flex flex-col items-center gap-2 p-4 rounded-xl border">
              <Skeleton className="h-20 w-20 rounded-xl" />
              <div className="space-y-2 w-full flex flex-col items-center">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <Card className="glass glass-hover">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Heart className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-1">Нет избранных</p>
            <p className="text-sm mb-4">Добавьте людей в избранное на их странице</p>
            <Link href="/" prefetch={false}>
              <Button variant="outline">Перейти к списку людей</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {favorites.map((card, i) => {
            const p = card.person;
            const isAlive = !p.deathDay || p.deathDay.trim() === "";
            const photo = card.photos?.[0] || (p.sex === 1 ? "m.jpg" : "w.jpg");
            return (
              <AnimatedItem key={p.id} index={i}>
                <Card className="glass glass-hover group relative overflow-hidden card-press">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Удалить из избранного"
                    className="absolute top-2 right-2 z-10 h-7 w-7 bg-black/40 text-white hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.preventDefault(); removeFav(p.id); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Link href={`/person?id=${p.id}`} prefetch={false}>
                    <CardContent className="flex flex-col items-center text-center gap-2 py-4">
                      <img
                        src={mediaUrl(photo)}
                        alt={`${p.lastName} ${p.firstName}`}
                        loading="lazy"
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
              </AnimatedItem>
            );
          })}
        </div>
      )}
    </div>
  );
}

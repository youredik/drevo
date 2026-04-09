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
import { SafeImage } from "@/components/safe-image";

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<PersonCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getFavorites()
      .then((data) => { if (!cancelled) setFavorites(data.favorites); })
      .catch((e) => { if (!cancelled) toast.error(e.message || "Ошибка загрузки"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const removeFav = async (personId: number) => {
    const removed = favorites.find((f) => f.person.id === personId);
    try {
      await api.removeFavorite(personId);
      setFavorites((prev) => prev.filter((f) => f.person.id !== personId));
      toast.success("Удалено из избранного", {
        action: {
          label: "Отменить",
          onClick: async () => {
            try {
              await api.addFavorite(personId);
              if (removed) setFavorites((prev) => [...prev, removed]);
            } catch { toast.error("Не удалось восстановить"); }
          },
        },
      });
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
        <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5">
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
                    className="absolute top-1 right-1 z-10 h-6 w-6 bg-black/40 text-white hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.preventDefault(); removeFav(p.id); }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <Link href={`/person?id=${p.id}`} prefetch={false}>
                    <CardContent className="flex flex-col items-center text-center gap-1 py-2 px-1">
                      <SafeImage
                        src={mediaUrl(photo)}
                        alt={`${p.lastName} ${p.firstName}`}
                        loading="lazy"
                        className={`h-14 w-14 rounded-lg object-cover ring-2 ${isAlive ? "ring-emerald-400" : "ring-red-400"}`}
                      />
                      <p className="font-medium text-xs truncate w-full">{p.lastName} {p.firstName}</p>
                      {card.age && (
                        <span className={`text-[10px] ${isAlive ? "text-emerald-300" : "text-red-300"}`}>
                          {card.age}
                        </span>
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

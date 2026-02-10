"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Users,
  GitFork,
  BookOpen,
  Pencil,
  Heart,
  X,
  ZoomIn,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

function PersonContent() {
  const searchParams = useSearchParams();
  const { canEdit } = useAuth();
  const id = Number(searchParams.get("id")) || 1;
  const [data, setData] = useState<any>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setPhotoIndex(0);
    setBio(null);
    api
      .getPerson(id)
      .then((d) => {
        setData(d);
        if (d.hasBio) {
          api.getBio(id).then((b) => setBio(b.text)).catch(() => {});
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    api.checkFavorite(id).then(d => setIsFav(d.isFavorite)).catch(() => {});
  }, [id]);

  const toggleFavorite = async () => {
    try {
      if (isFav) {
        await api.removeFavorite(id);
        setIsFav(false);
      } else {
        await api.addFavorite(id);
        setIsFav(true);
      }
    } catch (e) { console.error(e); }
  };

  const photos = data?.photos ?? [];

  const nextPhoto = () => setPhotoIndex((i: number) => (i + 1) % photos.length);
  const prevPhoto = () => setPhotoIndex((i: number) => (i - 1 + photos.length) % photos.length);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowLeft") prevPhoto();
      if (e.key === "ArrowRight") nextPhoto();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxOpen, photos.length]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        <Skeleton className="h-80 rounded-2xl mb-6" />
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-16 text-center">
        <p className="text-muted-foreground text-lg">Человек не найден</p>
        <Link href="/">
          <Button className="mt-4">На главную</Button>
        </Link>
      </div>
    );
  }

  const { person, father, mother, spouses, children, age, zodiac } = data;
  const isAlive = !person.deathDay || person.deathDay.trim() === "";

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
      {/* Navigation */}
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/person?id=${id - 1}`}>
          <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
        </Link>
        <Badge variant="secondary">ID: {person.id}</Badge>
        <Link href={`/person?id=${id + 1}`}>
          <Button variant="outline" size="icon"><ChevronRight className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1" />
        <Link href={`/tree?id=${id}`}>
          <Button variant="outline" size="sm" className="gap-2">
            <GitFork className="h-4 w-4" />
            <span className="hidden sm:inline">Древо</span>
          </Button>
        </Link>
        <Link href={`/kinship?id1=${id}`}>
          <Button variant="outline" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Родство</span>
          </Button>
        </Link>
        {canEdit && (
          <Link href={`/admin/person?id=${id}`}>
            <Button variant="outline" size="sm" className="gap-2">
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Редактировать</span>
            </Button>
          </Link>
        )}
        <Button variant="outline" size="sm" className="gap-2" onClick={toggleFavorite}>
          <Heart className={`h-4 w-4 ${isFav ? "fill-red-500 text-red-500" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-6">
        {/* Photo */}
        <div className="relative">
          <div
            className="aspect-[3/4] rounded-2xl overflow-hidden bg-muted cursor-pointer group"
            onClick={() => setLightboxOpen(true)}
          >
            <img
              src={mediaUrl(photos[photoIndex])}
              alt={`${person.lastName} ${person.firstName}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
              <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          </div>
          {photos.length > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={prevPhoto}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-white text-sm bg-black/50 px-2 py-1 rounded-full">
                {photoIndex + 1} / {photos.length}
              </span>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={nextPhoto}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">
            {person.lastName} {person.firstName}
          </h1>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Badge variant={isAlive ? "default" : "destructive"}>
              {isAlive ? "Жив" : "Умер"}
            </Badge>
            {age && <span className="text-muted-foreground text-sm">{age}</span>}
            {zodiac && <span className="text-muted-foreground text-sm">{zodiac}</span>}
          </div>

          <Tabs defaultValue="info" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="info" className="flex-1">Информация</TabsTrigger>
              <TabsTrigger value="family" className="flex-1">Семья</TabsTrigger>
              {(data.hasBio || bio) && (
                <TabsTrigger value="bio" className="flex-1">Биография</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="info" className="mt-4 space-y-3">
              <InfoRow label="Дата рождения" value={person.birthDay || "—"} />
              <InfoRow label="Место рождения" value={person.birthPlace || "—"} />
              {!isAlive && <InfoRow label="Дата смерти" value={person.deathDay || "—"} />}
              {!isAlive && person.deathPlace && <InfoRow label="Место смерти" value={person.deathPlace} />}
              {person.address && <InfoRow label="Адрес" value={person.address} />}
              {person.marryDay && <InfoRow label="Дата свадьбы" value={person.marryDay} />}
              <InfoRow label="Пол" value={person.sex === 1 ? "Мужской" : "Женский"} />
            </TabsContent>

            <TabsContent value="family" className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Родители</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {father ? <PersonMiniCard person={father} relation="Отец" /> : <p className="text-muted-foreground text-sm p-3">Нет данных</p>}
                  {mother ? <PersonMiniCard person={mother} relation="Мать" /> : <p className="text-muted-foreground text-sm p-3">Нет данных</p>}
                </div>
              </div>
              {spouses.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {spouses.length === 1 ? "Супруг(а)" : "Супруги"}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {spouses.map((s: any) => (
                      <PersonMiniCard key={s.id} person={s} relation={s.sex === 1 ? "Муж" : "Жена"} />
                    ))}
                  </div>
                </div>
              )}
              {children.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Дети ({children.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {children.map((c: any) => (
                      <PersonMiniCard key={c.id} person={c} relation={c.sex === 1 ? "Сын" : "Дочь"} />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {(data.hasBio || bio) && (
              <TabsContent value="bio" className="mt-4">
                {bio ? (
                  <div>
                    <div className="flex justify-end mb-2">
                      <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigator.clipboard.writeText(bio)}>
                        <Copy className="h-3 w-3" /> Копировать
                      </Button>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/50 rounded-xl p-4">{bio}</div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <BookOpen className="h-4 w-4" /> Биография доступна
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            onClick={() => setLightboxOpen(false)}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white hover:bg-white/20 z-10"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
            {photos.length > 1 && (
              <>
                <Button variant="ghost" size="icon" className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); prevPhoto(); }}>
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button variant="ghost" size="icon" className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); nextPhoto(); }}>
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}
            <motion.img
              key={photoIndex}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={mediaUrl(photos[photoIndex])}
              alt=""
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <span className="absolute bottom-4 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
              {photoIndex + 1} / {photos.length}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function PersonMiniCard({ person, relation }: { person: any; relation: string }) {
  const isAlive = !person.deathDay || person.deathDay.trim() === "";
  return (
    <Link href={`/person?id=${person.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="flex items-center gap-3 py-3">
          <img
            src={mediaUrl(person.photo)}
            alt=""
            className="h-11 w-11 rounded-full object-cover bg-muted shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{person.lastName} {person.firstName}</p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{relation}</span>
              {person.age && <span className={`text-xs ${isAlive ? "text-muted-foreground" : "text-destructive"}`}>{person.age}</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function PersonPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-8"><Skeleton className="h-80 rounded-2xl" /></div>}>
      <PersonContent />
    </Suspense>
  );
}

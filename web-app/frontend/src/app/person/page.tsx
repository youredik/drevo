"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Search,
  Users,
  GitFork,
  BookOpen,
  Pencil,
  Heart,
  X,
  Loader2,
  Star,
  MessageSquare,
  List,
  Play,
  Pause,
  Share2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, mediaUrl, PersonBrief } from "@/lib/api";
import { notifyDataChanged } from "@/lib/data-context";
import { addRecentPerson } from "@/lib/recent-persons";
import { usePerson, useCheckFavorite, useBio, useInfo } from "@/lib/swr";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Timeline } from "@/components/timeline";
import { SafeImage } from "@/components/safe-image";
import { AddPersonModal, type AddMode } from "@/components/add-person-modal";
import { UserPlus } from "lucide-react";

function haptic(ms = 10) {
  try { navigator?.vibrate?.(ms); } catch {}
}

function PersonContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { canEdit } = useAuth();
  const id = Number(searchParams.get("id")) || 1;
  const { data: infoData } = useInfo();
  const maxId = infoData?.personCount ?? id;
  const nextId = id >= maxId ? 1 : id + 1;
  const prevId = id <= 1 ? maxId : id - 1;
  const { data, isLoading: loading, mutate: mutateData } = usePerson(id);
  const { data: favData, mutate: mutateFav } = useCheckFavorite(id);
  const { data: bioData } = useBio(id, data?.hasBio ?? false);
  const bio = bioData?.text ?? null;
  const isFav = favData?.isFavorite ?? false;
  const shareRef = useRef<HTMLDivElement | null>(null);
  const [favLoading, setFavLoading] = useState(false);
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const lightboxOpen = false;
  const [fabOpen, setFabOpen] = useState(false);
  const [slideshowOn, setSlideshowOn] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("drevo-slideshow");
    return saved === null ? true : saved === "on";
  });

  const toggleSlideshow = () => {
    setSlideshowOn((prev) => {
      const next = !prev;
      localStorage.setItem("drevo-slideshow", next ? "on" : "off");
      return next;
    });
  };

  useEffect(() => {
    setPhotoIndex(0);
  }, [id]);

  useEffect(() => {
    if (data) {
      document.title = `${data.person.lastName} ${data.person.firstName} — Drevo`;
      addRecentPerson(id);
    }
    return () => { document.title = "Drevo — Семейное древо"; };
  }, [data, id]);

  // Force dark theme on the person page so InfoRow labels/values resolve to
  // light colours via CSS variables (the page background is hardcoded black).
  useEffect(() => {
    const html = document.documentElement;
    const hadDark = html.classList.contains("dark");
    if (!hadDark) html.classList.add("dark");
    return () => {
      if (!hadDark) html.classList.remove("dark");
    };
  }, []);

  const toggleFavorite = async () => {
    if (favLoading) return;
    setFavLoading(true);
    haptic();
    const wasFav = isFav;
    try {
      if (wasFav) {
        await api.removeFavorite(id);
        mutateFav({ isFavorite: false }, false);
        toast.success("Удалено из избранного", {
          action: {
            label: "Отменить",
            onClick: async () => {
              try { await api.addFavorite(id); mutateFav({ isFavorite: true }, false); } catch {}
            },
          },
        });
      } else {
        await api.addFavorite(id);
        mutateFav({ isFavorite: true }, false);
        toast.success("Добавлено в избранное");
      }
      notifyDataChanged();
    } catch (e: any) { toast.error(e.message || "Не удалось обновить избранное"); }
    finally { setFavLoading(false); }
  };

  const sharePersonScreenshot = async () => {
    const el = shareRef.current;
    if (!el) return;

    // Cover the viewport with an opaque overlay so the user doesn't see the
    // page jumping around when we scroll-to-top before capturing.
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-family:system-ui,sans-serif;";
    overlay.textContent = "Подготовка скриншота…";
    document.body.appendChild(overlay);

    // Wait for FAB exit animation to finish.
    await new Promise<void>((resolve) => setTimeout(resolve, 400));

    const personLabel = data
      ? `${data.person.lastName} ${data.person.firstName}`
      : "Drevo";

    // Force-scroll the page to put `el` at the very top of the viewport, so
    // that html-to-image (which uses getBoundingClientRect) starts from y=0.
    const prevScrollY = window.scrollY;
    el.scrollIntoView({ block: "start", behavior: "auto" });
    // Some browsers add a tiny offset; nudge to absolute top of element.
    const currentRect = el.getBoundingClientRect();
    if (currentRect.top !== 0) {
      window.scrollBy(0, currentRect.top);
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    try {
      const { toBlob } = await import("html-to-image");
      const w = Math.max(el.offsetWidth, el.scrollWidth);
      const h = Math.max(el.offsetHeight, el.scrollHeight);
      const blob = await toBlob(el, {
        backgroundColor: "#000000",
        pixelRatio: 2,
        cacheBust: true,
        width: w,
        height: h,
        canvasWidth: w * 2,
        canvasHeight: h * 2,
        style: {
          transform: "none",
          transformOrigin: "0 0",
          margin: "0",
        },
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          // Skip nodes explicitly marked as not-shareable (FAB, backdrop, etc.)
          return !node.classList.contains("share-skip");
        },
      });
      if (!blob) throw new Error("Не удалось создать скриншот");

      // PRIMARY: copy image to clipboard. This always overwrites the previous
      // contents and works on desktop where Web Share API is unreliable.
      let clipboardOk = false;
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          typeof ClipboardItem !== "undefined"
        ) {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          clipboardOk = true;
        }
      } catch (clipErr) {
        console.warn("Clipboard image write failed:", clipErr);
      }

      // SECONDARY: on mobile, also try to open the native share sheet so the
      // user can pick an app (WhatsApp, Telegram, ...). Only on touch devices
      // where Web Share API is actually meaningful — desktop browsers report
      // canShare:true but the resulting dialog is empty.
      const file = new File([blob], `drevo-${id}.png`, { type: "image/png" });
      const isTouchDevice =
        typeof window !== "undefined" &&
        (("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0);
      if (
        isTouchDevice &&
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] }) &&
        navigator.share
      ) {
        try {
          await navigator.share({
            title: personLabel,
            text: personLabel,
            files: [file],
          });
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") {
            if (clipboardOk) toast.success("Скриншот скопирован в буфер обмена");
            return;
          }
        }
      }

      if (clipboardOk) {
        toast.success("Скриншот скопирован в буфер обмена");
        return;
      }

      // Last resort — download the screenshot
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `drevo-${id}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.info("Скриншот сохранён — отправьте его вручную");
    } catch (e: any) {
      console.error("Share failed:", e);
      toast.error("Не удалось поделиться: " + (e?.message || "ошибка"));
    } finally {
      // Restore the original scroll position and remove the overlay
      window.scrollTo({ top: prevScrollY, left: 0, behavior: "auto" });
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
  };

  const handlePersonSwipe = useCallback((_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (lightboxOpen) return;
    const threshold = 80;
    if (info.offset.x < -threshold && Math.abs(info.velocity.x) > 0.3) {
      haptic();
      router.push(`/person?id=${nextId}`);
    } else if (info.offset.x > threshold && Math.abs(info.velocity.x) > 0.3) {
      haptic();
      router.push(`/person?id=${prevId}`);
    }
  }, [id, lightboxOpen, router]);

  const photos = data?.photos ?? [];

  // Slideshow timer
  useEffect(() => {
    if (!slideshowOn || photos.length <= 1) return;
    const interval = setInterval(() => {
      setPhotoIndex((i) => (i + 1) % photos.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [slideshowOn, photos.length]);

  const nextPhoto = () => setPhotoIndex((i: number) => (i + 1) % photos.length);
  const prevPhoto = () => setPhotoIndex((i: number) => (i - 1 + photos.length) % photos.length);

  const handleSwipeEnd = (_: any, info: { offset: { x: number } }) => {
    if (photos.length <= 1) return;
    if (info.offset.x < -50) nextPhoto();
    else if (info.offset.x > 50) prevPhoto();
  };


  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-2 py-4">
        <div className="grid grid-cols-2 gap-1 mb-1">
          <Skeleton className="aspect-square rounded bg-gray-800" />
          <Skeleton className="aspect-square rounded bg-gray-800" />
        </div>
        <Skeleton className="aspect-square rounded-xl bg-gray-800 mb-2" />
        <Skeleton className="h-6 w-48 mx-auto bg-gray-800" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-16 text-center">
        <p className="text-muted-foreground text-lg">Человек не найден</p>
        <Link href="/" prefetch={false}>
          <Button className="mt-4">На главную</Button>
        </Link>
      </div>
    );
  }

  const { person, father, mother, spouses, children, age, zodiac } = data;
  const isAlive = !person.deathDay || person.deathDay.trim() === "";

  // Check if today is the person's birthday
  const isBirthday = (() => {
    if (!person.birthDay) return false;
    const match = person.birthDay.match(/(\d{1,2})\.(\d{1,2})/);
    if (!match) return false;
    const now = new Date();
    return parseInt(match[1], 10) === now.getDate() && parseInt(match[2], 10) === (now.getMonth() + 1);
  })();

  // Spouses positioned by DB order:
  // 1st → right-bottom, 2nd → right-top, 3rd → left-top, 4th → left-bottom
  const rightBottomSpouse = spouses[0] ?? null;  // pos 1
  const rightTopSpouse = spouses[1] ?? null;     // pos 2
  const leftTopSpouse = spouses[2] ?? null;      // pos 3
  const leftBottomSpouse = spouses[3] ?? null;   // pos 4

  return (
    <div className="max-w-lg mx-auto px-0 sm:px-2 py-0 bg-black min-h-screen relative">
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handlePersonSwipe}
        className="flex flex-col bg-black"
      >
        <div ref={shareRef} className="flex flex-col bg-black">
        {/* === PARENTS — side by side at top === */}
        <div className="grid grid-cols-2 gap-1">
          {/* Father */}
          <div className="relative">
            {father ? (
              <Link href={`/person?id=${father.id}`} prefetch={false} className="block">
                <div className="relative aspect-square overflow-hidden">
                  <SafeImage
                    src={mediaUrl(father.photo)}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5"
                    style={{ background: "rgba(0,0,0,0.47)" }}>
                    <p className="text-white text-xs font-medium truncate">
                      {father.lastName} {father.firstName}
                    </p>
                  </div>
                </div>
                {/* Child count badge */}
                {father.childCount != null && father.childCount > 0 && (
                  <div className="absolute bottom-4 left-0 -translate-x-1/2 z-10 h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: "#383838" }}>
                    {father.childCount}
                  </div>
                )}
              </Link>
            ) : (
              <div className="relative aspect-square bg-gray-800 flex flex-col items-center justify-center overflow-hidden">
                <img src={mediaUrl("m.jpg")} alt="" className="w-full h-full object-cover opacity-60" />
                <p className="absolute bottom-1 text-gray-400 text-xs">Нет данных</p>
              </div>
            )}
          </div>

          {/* Mother */}
          <div className="relative">
            {mother ? (
              <Link href={`/person?id=${mother.id}`} prefetch={false} className="block">
                <div className="relative aspect-square overflow-hidden">
                  <SafeImage
                    src={mediaUrl(mother.photo)}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-right"
                    style={{ background: "rgba(0,0,0,0.47)" }}>
                    <p className="text-white text-xs font-medium truncate">
                      {mother.lastName} {mother.firstName}
                    </p>
                  </div>
                </div>
                {mother.childCount != null && mother.childCount > 0 && (
                  <div className="absolute bottom-4 right-0 translate-x-1/2 z-10 h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: "#383838" }}>
                    {mother.childCount}
                  </div>
                )}
              </Link>
            ) : (
              <div className="relative aspect-square bg-gray-800 flex flex-col items-center justify-center overflow-hidden">
                <img src={mediaUrl("w.jpg")} alt="" className="w-full h-full object-cover opacity-60" />
                <p className="absolute bottom-1 text-gray-400 text-xs">Нет данных</p>
              </div>
            )}
          </div>
        </div>

        {/* === MAIN PHOTO with SPOUSES on sides and NAV ARROWS === */}
        <div className="relative flex items-stretch mt-1">
          {/* Left arrow — centered on photo */}
          <Link href={`/person?id=${prevId}`} prefetch={false}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 text-green-400 hover:text-green-300">
            <ChevronLeft className="h-10 w-10" strokeWidth={3} />
          </Link>

          {/* Left side: spouses (top=pos3, bottom=pos4) */}
          <div className="flex flex-col items-center justify-between shrink-0 py-2" style={{ width: 80 }}>
            <div className="flex flex-col items-center gap-1">
              {leftTopSpouse && <SpouseCircle spouse={leftTopSpouse} />}
            </div>
            <div className="flex flex-col items-center">
              {leftBottomSpouse && <SpouseCircle spouse={leftBottomSpouse} />}
            </div>
          </div>

          {/* Center photo slider */}
          <div className="flex-1 relative">
            <div
              className="aspect-square rounded-xl overflow-hidden bg-gray-900 relative"
            >
              <AnimatePresence mode="sync">
                <motion.div
                  key={photoIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8 }}
                  drag={photos.length > 1 ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={handleSwipeEnd}
                  className="absolute inset-0"
                >
                  <SafeImage
                    src={mediaUrl(photos[photoIndex])}
                    alt={`${person.lastName} ${person.firstName}`}
                    className="w-full h-full object-cover pointer-events-none"
                  />
                </motion.div>
              </AnimatePresence>
            </div>
            {/* Dot pagination */}
            {photos.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    className={`rounded-full transition-all ${i === photoIndex ? "h-2.5 w-2.5 bg-white" : "h-2 w-2 bg-gray-500"}`}
                    onClick={() => setPhotoIndex(i)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right side: spouses (top=pos2, bottom=pos1) */}
          <div className="flex flex-col items-center justify-between shrink-0 py-2" style={{ width: 80 }}>
            <div className="flex flex-col items-center gap-1">
              {rightTopSpouse && <SpouseCircle spouse={rightTopSpouse} />}
            </div>
            <div className="flex flex-col items-center">
              {rightBottomSpouse && <SpouseCircle spouse={rightBottomSpouse} />}
            </div>
          </div>

          {/* Right arrow — centered on photo */}
          <Link href={`/person?id=${nextId}`} prefetch={false}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 text-green-400 hover:text-green-300">
            <ChevronRight className="h-10 w-10" strokeWidth={3} />
          </Link>
        </div>

        {/* === PERSON NAME === */}
        <div className="text-center py-2 px-2" style={{ background: "rgba(32,32,32,0.5)" }}>
          <p className="text-white text-sm font-sans">
            {person.lastName} {person.firstName} {age || ""}
          </p>
        </div>

        {/* === CHILDREN — horizontal row === */}
        {children.length > 0 && (
          <div className="overflow-x-auto py-3 px-2 scrollbar-none">
            <div className="flex gap-1 w-fit mx-auto">
              {children.map((c) => (
                <Link key={c.id} href={`/person?id=${c.id}`} prefetch={false}
                  className="flex flex-col items-center gap-1 shrink-0">
                  <div className="relative">
                    <div className="rounded-full overflow-hidden"
                      style={{ width: 69, height: 69, border: "2px solid white" }}>
                      <SafeImage src={mediaUrl(c.photo)} alt="" loading="lazy"
                        className="h-full w-full object-cover" />
                    </div>
                    {/* Child count badge — bottom right like Android */}
                    {c.childCount != null && c.childCount > 0 && (
                      <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ background: "#383838" }}>
                        {c.childCount}
                      </div>
                    )}
                  </div>
                  <span className="text-white text-[11px] text-center leading-tight">{c.firstName}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* === FAB MENU — Android-style with open/close animation === */}
        {/* Backdrop */}
        {fabOpen && (
          <div className="share-skip fixed inset-0 z-30 bg-black/30" onClick={() => setFabOpen(false)} />
        )}

        {/* Main FAB toggle — bottom right */}
        <motion.button
          className="share-skip fixed right-4 bottom-20 z-50 h-12 w-12 rounded-full flex items-center justify-center shadow-xl"
          style={{ background: "#01579B" }}
          onClick={() => setFabOpen(!fabOpen)}
          animate={{ rotate: fabOpen ? 45 : 0 }}
          transition={{ duration: 0.3, type: "spring", stiffness: 200 }}
        >
          <List className="h-6 w-6 text-white" />
        </motion.button>

        {/* FAB items — column above main button */}
        <AnimatePresence>
          {fabOpen && (
            <>
              {/* Pause/Play slideshow (dfabPause) */}
              {photos.length > 1 && (
                <FabItem idx={0} x={0} y={-60}
                  icon={slideshowOn ? <Pause className="h-5 w-5 text-white" /> : <Play className="h-5 w-5 text-white" />}
                  onClick={() => { toggleSlideshow(); setFabOpen(false); }}
                  label={slideshowOn ? "Стоп" : "Слайдшоу"}
                />
              )}
              {/* Favorites (dfabFav) */}
              <FabItem idx={1} x={0} y={-120}
                icon={<Star className={`h-5 w-5 ${isFav ? "fill-yellow-300 text-yellow-300" : "text-white"}`} />}
                onClick={() => { toggleFavorite(); setFabOpen(false); }}
                label="Избранное"
              />
              {/* Share screenshot (sendBtn) */}
              <FabItem idx={2} x={-56} y={-60}
                icon={<Share2 className="h-5 w-5 text-white" />}
                onClick={async () => {
                  setFabOpen(false);
                  await sharePersonScreenshot();
                }}
                label="Поделиться"
              />
              {/* Tree (treeBtn) */}
              <FabItem idx={3} x={-56} y={0}
                icon={<GitFork className="h-5 w-5 text-white" />}
                href={`/tree?id=${id}`}
                label="Древо"
              />
              {/* Search by ID (dFabSearchId) */}
              <FabItem idx={4} x={-112} y={0}
                icon={<Users className="h-5 w-5 text-white" />}
                href={`/search`}
                label="Поиск"
              />
              {/* Kinship (dfabKinship) */}
              <FabItem idx={5} x={-112} y={-60}
                icon={<Users className="h-5 w-5 text-white" />}
                href={`/kinship?id1=${id}`}
                label="Родство"
              />
              {/* Family full list (dfabFamFull) */}
              <FabItem idx={6} x={-56} y={-120}
                icon={<List className="h-5 w-5 text-white" />}
                href={`/favorites`}
                label="Список"
              />
              {/* Edit (if admin) */}
              {canEdit && (
                <FabItem idx={7} x={-112} y={-120}
                  icon={<Pencil className="h-5 w-5 text-white" />}
                  href={`/admin/person?id=${id}`}
                  label="Редакт."
                />
              )}
              {/* Add spouse / son / daughter (if admin) */}
              {canEdit && (
                <>
                  <FabItem idx={8} x={0} y={-180}
                    icon={<UserPlus className="h-5 w-5 text-white" />}
                    onClick={() => { setFabOpen(false); setAddMode("spouse"); }}
                    label={person.sex === 1 ? "Жену" : "Мужа"}
                  />
                  <FabItem idx={9} x={-56} y={-180}
                    icon={<UserPlus className="h-5 w-5 text-white" />}
                    onClick={() => { setFabOpen(false); setAddMode("son"); }}
                    label="Сына"
                  />
                  <FabItem idx={10} x={-112} y={-180}
                    icon={<UserPlus className="h-5 w-5 text-white" />}
                    onClick={() => { setFabOpen(false); setAddMode("daughter"); }}
                    label="Дочь"
                  />
                  <FabItem idx={11} x={0} y={-240}
                    icon={<UserPlus className="h-5 w-5 text-white" />}
                    onClick={() => { setFabOpen(false); setAddMode("father"); }}
                    label="Папу"
                  />
                  <FabItem idx={12} x={-56} y={-240}
                    icon={<UserPlus className="h-5 w-5 text-white" />}
                    onClick={() => { setFabOpen(false); setAddMode("mother"); }}
                    label="Маму"
                  />
                </>
              )}
            </>
          )}
        </AnimatePresence>

        {/* === BOTTOM STATUS BAR — like Android === */}
        <div className="flex items-center gap-3 px-4 py-3 mt-2">
          <button onClick={toggleFavorite} disabled={favLoading}>
            <Star className={`h-6 w-6 ${isFav ? "fill-yellow-400 text-yellow-400" : "text-gray-500"}`} />
          </button>
          {data.hasBio && (
            <MessageSquare className="h-5 w-5 text-gray-500 opacity-40" />
          )}
          {isBirthday && <span className="text-lg">🎂</span>}
          <span className="font-mono px-2 py-0.5 rounded text-sm font-bold"
            style={{ background: "#2D2D2D", color: isAlive ? "#80ff80" : "#FF0000" }}>
            {person.id}
          </span>
          <div className="flex-1" />
          {/* Bottom row action FABs — like Android's bottom row */}
          <Link href={`/search`} prefetch={false}>
            <div className="h-10 w-10 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: "#0288D1" }}>
              <Search className="h-4 w-4 text-white" />
            </div>
          </Link>
          <Link href={`/kinship?id1=${id}`} prefetch={false}>
            <div className="h-10 w-10 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: "#0288D1" }}>
              <Users className="h-4 w-4 text-white" />
            </div>
          </Link>
          <Link href={`/tree?id=${id}`} prefetch={false}>
            <div className="h-10 w-10 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: "#0288D1" }}>
              <GitFork className="h-4 w-4 text-white" />
            </div>
          </Link>
        </div>

        {/* === TABS for details === */}
        <div className="px-2 pb-8">
          <Tabs defaultValue="info" className="w-full mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="info" className="flex-1">Информация</TabsTrigger>
              <TabsTrigger value="family" className="flex-1">Семья</TabsTrigger>
              {(data.hasBio || bio) && (
                <TabsTrigger value="bio" className="flex-1">Биография</TabsTrigger>
              )}
              <TabsTrigger value="timeline" className="flex-1">Хроника</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-4 space-y-3">
              <div>
                <InfoRow label="Дата рождения" value={person.birthDay || "—"} />
                <InfoRow label="Место рождения" value={person.birthPlace || "—"} />
                {!isAlive && <InfoRow label="Дата кончины" value={person.deathDay || "—"} />}
                {!isAlive && person.deathPlace && <InfoRow label="Место кончины" value={person.deathPlace} />}
                {person.address && <InfoRow label="Адрес" value={person.address} />}
                {person.marryDay && <InfoRow label="Дата свадьбы" value={person.marryDay} />}
                <InfoRow label="Пол" value={person.sex === 1 ? "Мужской" : "Женский"} />
              </div>
            </TabsContent>

            <TabsContent value="family" className="mt-4 space-y-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="space-y-4">
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
                      {spouses.map((s) => (
                        <PersonMiniCard key={s.id} person={s} relation={s.sex === 1 ? "Муж" : "Жена"} />
                      ))}
                    </div>
                  </div>
                )}
                {children.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Дети ({children.length})</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {children.map((c) => (
                        <PersonMiniCard key={c.id} person={c} relation={c.sex === 1 ? "Сын" : "Дочь"} />
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </TabsContent>

            {(data.hasBio || bio) && (
              <TabsContent value="bio" className="mt-4">
                <motion.div initial={false} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                  {bio ? (
                    <div>
                      <div className="flex justify-end mb-2">
                        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigator.clipboard.writeText(bio)}>
                          <Copy className="h-3 w-3" /> Копировать
                        </Button>
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/50 glass-subtle rounded-xl p-4">{bio}</div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground py-4">
                      <BookOpen className="h-4 w-4" /> Биография доступна
                    </div>
                  )}
                </motion.div>
              </TabsContent>
            )}

            <TabsContent value="timeline" className="mt-4">
              <motion.div initial={false} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                <Timeline events={[
                  ...(person.birthDay ? [{ date: person.birthDay, label: `Родился: ${person.lastName} ${person.firstName}`, type: "birth" as const }] : []),
                  ...(person.marryDay ? [{ date: person.marryDay, label: "Свадьба", type: "marriage" as const }] : []),
                  ...(person.deathDay ? [{ date: person.deathDay, label: `Кончина: ${person.lastName} ${person.firstName}`, type: "death" as const }] : []),
                  ...(person.birthPlace ? [{ date: "", label: `Место рождения: ${person.birthPlace}`, type: "info" as const }] : []),
                  ...(person.address ? [{ date: "", label: `Адрес: ${person.address}`, type: "info" as const }] : []),
                ]} />
              </motion.div>
            </TabsContent>
          </Tabs>
        </div>
        </div>
      </motion.div>

      {/* Add person modal */}
      {addMode && data && (
        <AddPersonModal
          open
          onOpenChange={(open) => { if (!open) setAddMode(null); }}
          mode={addMode}
          currentPersonId={id}
          currentPersonSex={person.sex}
          currentPersonLastName={person.lastName}
          currentPersonSpouseIds={person.spouseIds}
          onCreated={(newId) => {
            setAddMode(null);
            // Revalidate current person's data so new relations appear immediately
            mutateData();
          }}
        />
      )}
    </div>
  );
}

function SpouseCircle({ spouse }: { spouse: PersonBrief }) {
  return (
    <Link href={`/person?id=${spouse.id}`} prefetch={false}
      className="flex flex-col items-center mb-1">
      <div className="rounded-full overflow-hidden"
        style={{ width: 70, height: 70, border: "2px solid white" }}>
        <SafeImage src={mediaUrl(spouse.photo)} alt="" loading="lazy"
          className="h-full w-full object-cover" />
      </div>
      <span className="text-white text-[10px] text-center mt-0.5 leading-tight">{spouse.firstName}</span>
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="w-36 shrink-0" style={{ color: "#9ca3af", fontSize: 14 }}>{label}</span>
      <span style={{ color: "#ffffff", fontSize: 14, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function FabItem({ idx, x, y, icon, onClick, href, label }: {
  idx: number; x: number; y: number; icon: React.ReactNode;
  onClick?: () => void; href?: string; label?: string;
}) {
  const content = (
    <motion.div
      className="share-skip fixed z-40 flex flex-col items-center"
      style={{ right: 16, bottom: 80 }}
      initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
      animate={{ opacity: 1, x, y, scale: 1 }}
      exit={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
      transition={{ duration: 0.35, delay: idx * 0.04, type: "spring", stiffness: 300, damping: 20 }}
    >
      <div className="h-11 w-11 rounded-full flex items-center justify-center shadow-xl cursor-pointer active:scale-90 transition-transform"
        style={{ background: "#0288D1" }}
        onClick={onClick}>
        {icon}
      </div>
      {label && <span className="text-white text-[8px] mt-0.5 whitespace-nowrap">{label}</span>}
    </motion.div>
  );

  if (href) {
    return <Link href={href} prefetch={false}>{content}</Link>;
  }
  return content;
}

function PersonMiniCard({ person, relation }: { person: PersonBrief; relation: string }) {
  const isAlive = !person.deathDay || person.deathDay.trim() === "";
  return (
    <Link href={`/person?id=${person.id}`} prefetch={false}>
      <Card className="glass glass-hover hover:shadow-md transition-shadow cursor-pointer card-press">
        <CardContent className="flex items-center gap-3 py-3">
          <SafeImage
            src={mediaUrl(person.photo)}
            alt=""
            loading="lazy"
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
    <Suspense fallback={<div className="max-w-lg mx-auto px-2 py-4"><Skeleton className="h-80 rounded-2xl bg-gray-800" /></div>}>
      <PersonContent />
    </Suspense>
  );
}

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  TreePine,
  Search,
  CalendarDays,
  Mic,
  BarChart3,
  Users,
  Star,
  ArrowRight,
  Share2,
  Clock,
  GitFork,
  Heart,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedItem } from "@/components/animated-list";
import { api, mediaUrl, PersonCard } from "@/lib/api";
import { useInfo, useEvents, useStats, useFavorites } from "@/lib/swr";
import { SafeImage } from "@/components/safe-image";
import { useVoiceSearch } from "@/hooks/use-voice-search";
import { getRecentPersons } from "@/lib/recent-persons";
import { useAuth } from "@/lib/auth-context";
import { Upload, Download, RotateCcw } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const { isAdmin, canEdit } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [recent, setRecent] = useState<PersonCard[]>([]);

  const { listening, toggle: toggleVoice, supported: voiceSupported } = useVoiceSearch({
    onResult: useCallback((text: string) => {
      setSearchQuery(text);
      router.push(`/search?q=${encodeURIComponent(text.trim())}`);
    }, [router]),
  });

  const { data: infoData, isLoading: infoLoading } = useInfo();
  const { data: eventsData, isLoading: eventsLoading } = useEvents(0, true);
  const { data: statsData } = useStats();
  const { data: favData } = useFavorites();

  const personCount = infoData?.personCount ?? null;
  const events = (eventsData?.events ?? []).filter((e) => e.daysUntil === 0);
  const favorites = (favData?.favorites ?? []).slice(0, 12);

  // Load recent persons (full PersonCard) from localStorage IDs
  useEffect(() => {
    let cancelled = false;
    const ids = getRecentPersons();
    if (ids.length === 0) return;
    Promise.all(ids.slice(0, 12).map((id) => api.getPerson(id).catch(() => null)))
      .then((cards) => {
        if (cancelled) return;
        setRecent(cards.filter((c): c is PersonCard => c !== null));
      });
    return () => { cancelled = true; };
  }, []);

  // Force dark theme on the home page (background is hardcoded black)
  useEffect(() => {
    const html = document.documentElement;
    const hadDark = html.classList.contains("dark");
    if (!hadDark) html.classList.add("dark");
    return () => {
      if (!hadDark) html.classList.remove("dark");
    };
  }, []);

  const lastViewed = recent[0] ?? null;

  // Captures the home page area for the Share button.
  const shareRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    const el = shareRef.current;
    if (!el || sharing) return;
    setSharing(true);
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(el, {
        backgroundColor: "#000000",
        pixelRatio: 2,
        cacheBust: true,
      });
      if (!blob) throw new Error("Не удалось создать скриншот");

      // Copy to clipboard first (works on desktop)
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

      // On touch devices, also try the native share sheet
      const file = new File([blob], "drevo.png", { type: "image/png" });
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
            title: "Фамильное Древо",
            text: "Посмотрите наше фамильное древо",
            files: [file],
          });
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") {
            if (clipboardOk) alert("Скриншот скопирован в буфер обмена");
            return;
          }
        }
      }

      if (clipboardOk) {
        alert("Скриншот скопирован в буфер обмена");
        return;
      }

      // Last resort — download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = "drevo.png";
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert("Скриншот сохранён — отправьте его вручную");
    } catch (e: any) {
      console.error("Share failed:", e);
      alert("Не удалось поделиться: " + (e?.message || "ошибка"));
    } finally {
      setSharing(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const eventTypeLabel = (type: string) => {
    switch (type) {
      case "birthday": return "День рождения";
      case "memorial": return "День памяти";
      case "wedding": return "Годовщина свадьбы";
      default: return type;
    }
  };

  const daysLabel = (days: number) => {
    if (days < 0) return "Вчера";
    if (days === 0) return "Сегодня";
    if (days === 1) return "Завтра";
    return `Через ${days} дн.`;
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div ref={shareRef} className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center mb-5"
        >
          <div className="flex items-center gap-3 mb-1">
            <TreePine className="h-7 w-7 text-yellow-400" />
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#CEBE2C" }}>
              ФАМИЛЬНОЕ ДРЕВО
            </h1>
          </div>
          <p className="text-xs" style={{ color: "#FFF7AD" }}>{dateStr}</p>
        </motion.div>

        {/* ── Search bar ── */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Поиск по имени, фамилии, дате…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pl-10 ${voiceSupported ? "pr-10" : ""} h-12 text-base bg-gray-900 border-gray-700 text-white placeholder:text-gray-500`}
            />
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors ${
                  listening ? "text-red-500 animate-pulse bg-red-500/10" : "text-gray-400 hover:text-white"
                }`}
                title={listening ? "Остановить запись" : "Голосовой поиск"}
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
          </div>
          <Button type="submit" size="lg" className="h-12 px-5 bg-blue-800 hover:bg-blue-700">
            <Search className="h-5 w-5" />
          </Button>
        </form>

        {/* ── Continue: large card with the last viewed person ── */}
        {lastViewed && (
          <Link href={`/person?id=${lastViewed.person.id}`} prefetch={false} className="block mb-5">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="relative overflow-hidden rounded-2xl border border-gray-700 cursor-pointer active:opacity-80"
              style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" }}
            >
              <div className="flex items-center gap-4 p-4">
                <SafeImage
                  src={mediaUrl(lastViewed.photos?.[0] || (lastViewed.person.sex === 1 ? "m.jpg" : "w.jpg"))}
                  alt=""
                  loading="lazy"
                  className="h-20 w-20 rounded-full object-cover ring-2 ring-yellow-400 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wide font-medium" style={{ color: "#FFF7AD" }}>
                    Продолжить просмотр
                  </p>
                  <p className="text-lg font-bold text-white truncate">
                    {lastViewed.person.lastName} {lastViewed.person.firstName}
                  </p>
                  {lastViewed.age && (
                    <p className="text-sm text-gray-400">{lastViewed.age}</p>
                  )}
                </div>
                <ArrowRight className="h-6 w-6 text-gray-400 shrink-0" />
              </div>
            </motion.div>
          </Link>
        )}

        {/* ── Recent persons ── */}
        {recent.length > 1 && (
          <section className="mb-5">
            <SectionHeader icon={<Clock className="h-4 w-4" />} title="Недавно просмотренные" />
            <HorizontalPersons items={recent} />
          </section>
        )}

        {/* ── Favorites ── */}
        {favorites.length > 0 && (
          <section className="mb-5">
            <SectionHeader
              icon={<Star className="h-4 w-4 text-yellow-400" />}
              title="Избранное"
              href="/favorites"
            />
            <HorizontalPersons items={favorites} />
          </section>
        )}

        {/* ── Upcoming events ── */}
        <section className="mb-5">
          <SectionHeader
            icon={<CalendarDays className="h-4 w-4 text-blue-400" />}
            title="События сегодня"
            href="/events"
          />
          {eventsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-900">
                  <Skeleton className="h-[70px] w-[70px] rounded bg-gray-700" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32 bg-gray-700" />
                    <Skeleton className="h-3 w-20 bg-gray-700" />
                  </div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="py-10 text-center text-gray-500 bg-gray-900 rounded-lg">
              <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Нет ближайших событий</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event, i) => (
                <AnimatedItem key={`${event.id}-${event.eventType}-${i}`} index={i}>
                  <Link href={`/person?id=${event.id}`} prefetch={false}>
                    <div
                      className="flex gap-2 p-1.5 cursor-pointer active:opacity-80"
                      style={{ background: "linear-gradient(180deg, #aaccaa, #ddffdd)", border: "1px solid #88aa88", borderRadius: 6, marginBottom: 2 }}
                    >
                      <SafeImage
                        src={mediaUrl(event.photo)}
                        alt=""
                        loading="lazy"
                        className="h-[80px] w-[80px] rounded object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between">
                            <span className="font-bold" style={{ color: event.eventType === "memorial" ? "#CC6600" : "#03AD03", fontSize: 13 }}>
                              {eventTypeLabel(event.eventType).toUpperCase()}
                            </span>
                            <span className="font-bold shrink-0" style={{ color: event.daysUntil === 0 ? "#FF0000" : event.daysUntil === 1 ? "#2196F3" : "#03AD03", fontSize: 13 }}>
                              {daysLabel(event.daysUntil)}
                            </span>
                          </div>
                          <p className="font-bold text-black truncate" style={{ fontSize: 15 }}>
                            {event.lastName} {event.firstName}
                          </p>
                          <div className="flex items-center gap-2" style={{ fontSize: 13 }}>
                            <span className="text-black">
                              {event.eventType === "birthday" ? event.birthDay :
                               event.eventType === "memorial" ? event.deathDay :
                               event.eventType === "wedding" ? event.marryDay : event.eventDate}
                            </span>
                            {event.eventType !== "memorial" && event.deathDay && (
                              <span className="font-bold" style={{ color: "#CC0000" }}>{event.deathDay}</span>
                            )}
                          </div>
                          {event.yearsCount > 0 && (
                            <p className="text-black" style={{ fontSize: 13 }}>
                              {event.yearsCount} {pluralYears(event.yearsCount)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                </AnimatedItem>
              ))}
            </div>
          )}
        </section>

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          <StatTile icon={Users} label="Персон" value={personCount ?? "…"} loading={infoLoading} color="#6ECEF8" />
          <StatTile icon={Heart} label="Живых" value={statsData?.aliveCount ?? "…"} color="#86efac" />
          <StatTile icon={Clock} label="Умерших" value={statsData?.deceasedCount ?? "…"} color="#fca5a5" />
          <StatTile icon={CalendarDays} label="Событий" value={events.length} color="#FFF7AD" />
        </div>

        {/* ── Big action buttons ── */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Link href={lastViewed ? `/tree?id=${lastViewed.person.id}` : "/tree"} prefetch={false} className="block">
            <button className="w-full py-4 px-3 text-sm font-semibold rounded-2xl flex flex-col items-center gap-2 transition-colors active:bg-blue-900/50 border border-blue-700 bg-gradient-to-b from-gray-900 to-blue-950">
              <GitFork className="h-7 w-7" style={{ color: "#CEBE2C" }} />
              <span style={{ color: "#CEBE2C" }}>ФАМИЛЬНОЕ ДРЕВО</span>
            </button>
          </Link>
          <Link href="/events" prefetch={false} className="block">
            <button className="w-full py-4 px-3 text-sm font-semibold rounded-2xl flex flex-col items-center gap-2 transition-colors active:bg-blue-900/50 border border-blue-700 bg-gradient-to-b from-gray-900 to-blue-950">
              <CalendarDays className="h-7 w-7" style={{ color: "#CEBE2C" }} />
              <span style={{ color: "#CEBE2C" }}>СОБЫТИЯ</span>
            </button>
          </Link>
        </div>

        {/* ── Admin/Manager: Import / Export / Restore ── */}
        {(isAdmin || canEdit) && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <ImportCsvButton />
            <ExportCsvButton />
            <RestoreBackupButton />
          </div>
        )}

        {/* ── Quick nav icons ── */}
        <div className="flex justify-around items-center mb-2">
          {[
            { href: "/search", icon: Search, label: "Поиск" },
            { href: "/favorites", icon: Star, label: "Избранное" },
            { href: "/stats", icon: BarChart3, label: "Статистика" },
            { href: lastViewed ? `/kinship?id1=${lastViewed.person.id}` : "/kinship", icon: Users, label: "Родство" },
          ].map((item) => (
            <Link key={item.href} href={item.href} prefetch={false} className="flex flex-col items-center gap-1 group">
              <div className="h-11 w-11 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-gray-700 transition-colors">
                <item.icon className="h-5 w-5 text-gray-300 group-hover:text-white" />
              </div>
              <span className="text-[10px] text-gray-400 group-hover:text-white">{item.label}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="flex flex-col items-center gap-1 group disabled:opacity-50"
            title="Поделиться скриншотом"
          >
            <div className="h-11 w-11 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-gray-700 transition-colors">
              <Share2 className="h-5 w-5 text-gray-300 group-hover:text-white" />
            </div>
            <span className="text-[10px] text-gray-400 group-hover:text-white">
              {sharing ? "..." : "Поделиться"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───

function pluralYears(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return "лет";
  if (last === 1) return "год";
  if (last >= 2 && last <= 4) return "года";
  return "лет";
}

function StatTile({
  icon: Icon,
  label,
  value,
  loading,
  color,
}: {
  icon: any;
  label: string;
  value: number | string;
  loading?: boolean;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 flex flex-col items-center gap-1">
      <Icon className="h-5 w-5" style={{ color: color || "#9ca3af" }} />
      {loading ? (
        <Skeleton className="h-5 w-12 bg-gray-700" />
      ) : (
        <span className="text-lg font-bold text-white">{value}</span>
      )}
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-base font-semibold text-white flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {href && (
        <Link href={href} prefetch={false}>
          <Button variant="ghost" size="sm" className="gap-1 h-7 px-2 text-gray-400 hover:text-white">
            Все <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      )}
    </div>
  );
}

function HorizontalPersons({ items }: { items: PersonCard[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
      {items.map((card) => {
        const p = card.person;
        const photo = card.photos?.[0] || (p.sex === 1 ? "m.jpg" : "w.jpg");
        const isAlive = !p.deathDay || p.deathDay.trim() === "";
        return (
          <Link
            key={p.id}
            href={`/person?id=${p.id}`}
            prefetch={false}
            className="flex flex-col items-center shrink-0 w-[68px]"
          >
            <SafeImage
              src={mediaUrl(photo)}
              alt=""
              loading="lazy"
              className={`h-16 w-16 rounded-full object-cover ring-2 ${isAlive ? "ring-emerald-400" : "ring-red-400"}`}
            />
            <span className="text-[10px] text-white text-center leading-tight mt-1 truncate w-full">
              {p.firstName}
            </span>
            <span className="text-[9px] text-gray-400 leading-tight truncate w-full text-center">
              {p.lastName}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function ImportCsvButton() {
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(
      `Импорт файла "${file.name}" заменит ВСЮ текущую базу данных.\n\n` +
      "Перед импортом будет создан бэкап текущей базы.\n\n" +
      "Продолжить?"
    );
    if (!confirmed) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setImporting(true);
    try {
      // 1. Backup current database
      await api.backup();

      // 2. Read CSV file
      const text = await file.text();

      // 3. Import
      const result = await api.importCsv(text);
      alert(`Импортировано: ${result.count} записей.\nПерезагрузите страницу.`);
      window.location.reload();
    } catch (err: any) {
      alert("Ошибка импорта: " + (err.message || "неизвестная ошибка"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        className="w-full h-full py-3 px-3 text-xs font-medium rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors border border-orange-700 bg-gradient-to-b from-gray-900 to-orange-950 text-orange-300 active:bg-orange-900/50 disabled:opacity-50"
      >
        <Upload className="h-5 w-5" />
        {importing ? "Импорт…" : "Импорт CSV"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}

function ExportCsvButton() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await api.exportCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = "fam.csv";
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Ошибка экспорта: " + (err.message || "неизвестная ошибка"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="w-full h-full py-3 px-3 text-xs font-medium rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors border border-green-700 bg-gradient-to-b from-gray-900 to-green-950 text-green-300 active:bg-green-900/50 disabled:opacity-50"
    >
      <Download className="h-5 w-5" />
      {exporting ? "Экспорт…" : "Экспорт CSV"}
    </button>
  );
}

function RestoreBackupButton() {
  const [loading, setLoading] = useState(false);
  const [backups, setBackups] = useState<{ name: string; size: number; date: string }[] | null>(null);
  const [showList, setShowList] = useState(false);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const data = await api.getBackups();
      setBackups(data.backups);
      setShowList(true);
    } catch (e: any) {
      alert("Ошибка: " + (e.message || "не удалось загрузить бэкапы"));
    } finally {
      setLoading(false);
    }
  };

  const restore = async (name: string, date: string) => {
    const d = new Date(date);
    const dateStr = d.toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const confirmed = window.confirm(
      `Восстановить базу из бэкапа от ${dateStr}?\n\n` +
      "Текущие данные будут заменены. Перед восстановлением будет создан бэкап текущего состояния."
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      const result = await api.restoreBackup(name);
      alert(`Восстановлено: ${result.count} записей.\nПерезагрузите страницу.`);
      setShowList(false);
      window.location.reload();
    } catch (e: any) {
      alert("Ошибка: " + (e.message || "не удалось восстановить"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={loadBackups}
        disabled={loading}
        className="w-full h-full py-3 px-3 text-xs font-medium rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors border border-cyan-700 bg-gradient-to-b from-gray-900 to-cyan-950 text-cyan-300 active:bg-cyan-900/50 disabled:opacity-50"
      >
        <RotateCcw className="h-5 w-5" />
        {loading ? "Загрузка…" : "Откатить из бэкапа"}
      </button>

      {showList && backups && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowList(false)}>
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl p-4 w-full max-w-md max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-bold mb-3">Выберите бэкап для восстановления</h3>
            {backups.length === 0 ? (
              <p className="text-gray-400 text-sm py-6 text-center">Нет бэкапов</p>
            ) : (
              <div className="space-y-2">
                {backups.map((b) => {
                  const d = new Date(b.date);
                  const dateStr = d.toLocaleString("ru-RU", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit", second: "2-digit",
                  });
                  const sizeKb = Math.round(b.size / 1024);
                  return (
                    <button
                      key={b.name}
                      onClick={() => restore(b.name, b.date)}
                      disabled={loading}
                      className="w-full text-left px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                      <div className="text-sm text-white font-medium">{dateStr}</div>
                      <div className="text-xs text-gray-400">{sizeKb} КБ</div>
                    </button>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => setShowList(false)}
              className="mt-3 w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

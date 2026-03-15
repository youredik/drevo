"use client";

import { useState, useCallback, useEffect } from "react";
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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedItem } from "@/components/animated-list";
import { mediaUrl } from "@/lib/api";
import { useInfo, useEvents } from "@/lib/swr";
import { SafeImage } from "@/components/safe-image";
import { useVoiceSearch } from "@/hooks/use-voice-search";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const lastId = localStorage.getItem("drevo-last-person");
    if (lastId) {
      router.replace(`/person?id=${lastId}`);
    }
  }, [router]);

  const [searchQuery, setSearchQuery] = useState("");
  const { listening, toggle: toggleVoice, supported: voiceSupported } = useVoiceSearch({
    onResult: useCallback((text: string) => {
      setSearchQuery(text);
      router.push(`/search?q=${encodeURIComponent(text.trim())}`);
    }, [router]),
  });
  const { data: infoData, isLoading: infoLoading } = useInfo();
  const { data: eventsData, isLoading: eventsLoading } = useEvents(3, true);

  const loading = infoLoading || eventsLoading;
  const personCount = infoData?.personCount ?? null;
  const events = (eventsData?.events ?? []).slice(0, 6);

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
    <div className="min-h-screen bg-black text-white">
      {/* Hero section — dark background like Android */}
      <section className="relative flex flex-col items-center justify-center px-4 pt-8 pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md mx-auto flex flex-col items-center"
        >
          {/* Title */}
          <div className="flex items-center gap-3 mb-2">
            <TreePine className="h-8 w-8 text-yellow-400" />
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#CEBE2C" }}>
              ФАМИЛЬНОЕ ДРЕВО
            </h1>
          </div>

          {/* Person count */}
          <div className="text-center mb-6">
            {loading ? (
              <Skeleton className="h-5 w-40 mx-auto bg-gray-700" />
            ) : (
              <p className="text-sm" style={{ color: "#6ECEF8" }}>
                Персон в базе: <span className="font-bold">{personCount}</span>
              </p>
            )}
          </div>

          {/* Main action buttons — like Android */}
          <div className="w-full flex flex-col gap-3 mb-6">
            <Link href="/tree" prefetch={false} className="block">
              <button className="w-full py-4 px-8 text-xl font-semibold transition-colors active:bg-blue-900/50"
                style={{ color: "#CEBE2C", background: "rgba(0,0,0,0.58)", border: "7px solid rgba(0,0,255,0.75)", borderRadius: "30px" }}>
                ФАМИЛЬНОЕ ДРЕВО
              </button>
            </Link>
            <Link href="/events" prefetch={false} className="block">
              <button className="w-full py-4 px-8 text-lg font-semibold transition-colors active:bg-blue-900/50"
                style={{ color: "#CEBE2C", background: "rgba(0,0,0,0.58)", border: "7px solid rgba(0,0,255,0.75)", borderRadius: "30px" }}>
                БЛИЖАЙШИЕ СОБЫТИЯ
              </button>
            </Link>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="w-full flex gap-2 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Поиск по имени, фамилии, дате..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-10 ${voiceSupported ? "pr-10" : ""} h-12 text-base bg-gray-900 border-gray-700 text-white placeholder:text-gray-500`}
              />
              {voiceSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors ${
                    listening
                      ? "text-red-500 animate-pulse bg-red-500/10"
                      : "text-gray-400 hover:text-white"
                  }`}
                  title={listening ? "Остановить запись" : "Голосовой поиск"}
                >
                  <Mic className="h-5 w-5" />
                </button>
              )}
            </div>
            <Button type="submit" size="lg" className="h-12 px-6 bg-blue-800 hover:bg-blue-700">
              <Search className="h-5 w-5" />
            </Button>
          </form>

          {/* Quick nav icons — like Android bottom nav */}
          <div className="w-full flex justify-around items-center mb-6">
            {[
              { href: "/search", icon: Search, label: "Поиск" },
              { href: "/events", icon: CalendarDays, label: "События" },
              { href: "/favorites", icon: Star, label: "Избранное" },
              { href: "/stats", icon: BarChart3, label: "Статистика" },
              { href: "/kinship", icon: Users, label: "Родство" },
            ].map((item) => (
              <Link key={item.href} href={item.href} prefetch={false} className="flex flex-col items-center gap-1 group">
                <div className="h-11 w-11 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-gray-700 transition-colors">
                  <item.icon className="h-5 w-5 text-gray-300 group-hover:text-white" />
                </div>
                <span className="text-[10px] text-gray-400 group-hover:text-white">{item.label}</span>
              </Link>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Events section */}
      <section className="px-4 pb-8 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Ближайшие события</h2>
          <Link href="/events" prefetch={false}>
            <Button variant="ghost" size="sm" className="gap-1 text-gray-400 hover:text-white">
              Все <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-gray-900">
                <Skeleton className="h-[70px] w-[70px] rounded-md bg-gray-700" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32 bg-gray-700" />
                  <Skeleton className="h-3 w-20 bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-gray-500 bg-gray-900 rounded-lg">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Нет ближайших событий</p>
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
                          <span className="text-black">{event.eventDate}</span>
                          {event.deathDay && (
                            <span className="font-bold" style={{ color: "#CC0000" }}>{event.deathDay}</span>
                          )}
                        </div>
                        {event.yearsCount > 0 && (
                          <p className="text-black" style={{ fontSize: 13 }}>
                            {event.yearsCount} {event.yearsCount === 1 ? "год" : event.yearsCount < 5 ? "года" : "лет"}
                          </p>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <span className="text-black font-bold" style={{ fontSize: 11 }}>#{event.id}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </AnimatedItem>
            ))}
          </div>
        )}
      </section>

      {/* Date at bottom — like Android */}
      <div className="text-center pb-6">
        <p className="text-sm" style={{ color: "#FFF7AD" }}>{dateStr}</p>
      </div>
    </div>
  );
}

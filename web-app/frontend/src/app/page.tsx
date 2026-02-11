"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  TreePine,
  Search,
  CalendarDays,
  GitFork,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedItem } from "@/components/animated-list";
import { mediaUrl } from "@/lib/api";
import { useInfo, useEvents } from "@/lib/swr";

const quickActions = [
  { href: "/tree", label: "Древо поколений", icon: GitFork, color: "text-primary" },
  { href: "/search", label: "Найти человека", icon: Search, color: "text-accent" },
  { href: "/events", label: "Ближайшие события", icon: CalendarDays, color: "text-chart-5" },
  { href: "/stats", label: "Статистика семьи", icon: BarChart3, color: "text-chart-3" },
];

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
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

  const eventTypeColor = (type: string) => {
    switch (type) {
      case "birthday": return "bg-primary/10 text-primary";
      case "memorial": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "wedding": return "bg-accent/10 text-accent";
      default: return "";
    }
  };

  const daysLabel = (days: number) => {
    if (days === 0) return "Сегодня";
    if (days === 1) return "Завтра";
    return `Через ${days} дн.`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6">
      {/* Hero with gradient */}
      <section className="py-12 md:py-20 text-center relative hero-gradient">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto"
        >
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 glass-subtle flex items-center justify-center">
              <TreePine className="h-9 w-9 text-primary" />
            </div>
          </div>
          <h1 className="text-responsive-hero font-bold tracking-tight mb-3">
            Семейное древо
          </h1>
          <p className="text-muted-foreground text-lg mb-8">
            {loading ? (
              <Skeleton className="h-6 w-48 mx-auto" />
            ) : (
              <>{personCount} человек в нашей семье</>
            )}
          </p>

          <form onSubmit={handleSearch} className="flex gap-2 max-w-lg mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени, фамилии, дате..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-6">
              Найти
            </Button>
          </form>
        </motion.div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-12">
        {quickActions.map((action, i) => (
          <AnimatedItem key={action.href} index={i}>
            <Link href={action.href} prefetch={false}>
              <Card className="glass glass-hover hover:shadow-md transition-shadow cursor-pointer group h-full card-press">
                <CardContent className="flex flex-col items-center text-center gap-3 py-6">
                  <div className="h-12 w-12 rounded-xl bg-muted glass-subtle flex items-center justify-center group-hover:scale-110 transition-transform">
                    <action.icon className={`h-6 w-6 ${action.color}`} />
                  </div>
                  <span className="text-sm font-medium">{action.label}</span>
                </CardContent>
              </Card>
            </Link>
          </AnimatedItem>
        ))}
      </section>

      {/* Upcoming events */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-responsive-title font-semibold">Ближайшие события</h2>
          <Link href="/events" prefetch={false}>
            <Button variant="ghost" size="sm" className="gap-1">
              Все события
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-14 w-14 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <CalendarDays className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-1">Нет ближайших событий</p>
              <p className="text-sm">Дни рождения и памятные даты появятся здесь</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {events.map((event, i) => (
              <AnimatedItem key={`${event.id}-${event.eventType}-${i}`} index={i}>
                <Link href={`/person?id=${event.id}`} prefetch={false}>
                  <Card className="glass glass-hover hover:shadow-md transition-shadow cursor-pointer card-press">
                    <CardContent className="flex items-center gap-4 py-4">
                      <img
                        src={mediaUrl(event.photo)}
                        alt={`${event.lastName} ${event.firstName}`}
                        loading="lazy"
                        className="h-14 w-14 rounded-full object-cover bg-muted shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {event.lastName} {event.firstName}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className={eventTypeColor(event.eventType)}>
                            {eventTypeLabel(event.eventType)}
                          </Badge>
                          {event.yearsCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {event.yearsCount} лет
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {event.daysUntil === 0 && (
                          <span className="h-2 w-2 rounded-full bg-primary pulse-dot" />
                        )}
                        <Badge variant="outline">
                          {daysLabel(event.daysUntil)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </AnimatedItem>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Minus, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, mediaUrl } from "@/lib/api";

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    api
      .getEvents(days, true)
      .then((data) => setEvents(data.events))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

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
      case "birthday": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "memorial": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      case "wedding": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      default: return "";
    }
  };

  const daysLabel = (d: number) => {
    if (d <= 0) return "Сегодня";
    if (d === 1) return "Завтра";
    return `Через ${d} дн.`;
  };

  // Group events by daysUntil
  const grouped = events.reduce<Record<string, any[]>>((acc, e) => {
    const label = daysLabel(e.daysUntil);
    if (!acc[label]) acc[label] = [];
    acc[label].push(e);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Ближайшие события</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDays((d) => Math.max(0, d - 1))}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="text-sm font-medium w-16 text-center">{days} дней</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDays((d) => Math.min(30, d + 1))}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Нет событий в ближайшие {days} дней</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([label, items]) => (
            <div key={label}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {label} ({items.length})
              </h2>
              <div className="space-y-2">
                {items.map((event: any, i: number) => (
                  <Link key={`${event.id}-${event.eventType}-${i}`} href={`/person?id=${event.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="flex items-center gap-4 py-3">
                        <img
                          src={mediaUrl(event.photo)}
                          alt={`${event.lastName} ${event.firstName}`}
                          className="h-12 w-12 rounded-full object-cover bg-muted shrink-0"
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
                        <span className="text-sm text-muted-foreground shrink-0">
                          {event.eventDate}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Minus, Plus, ChevronLeft, ChevronRight, List, Grid } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api, mediaUrl, EventItem } from "@/lib/api";
import { toast } from "sonner";
import { AnimatedItem } from "@/components/animated-list";

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDay = firstDay.getDay() - 1; // Monday=0
  if (startDay < 0) startDay = 6;
  const days: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
  return days;
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getEvents(days, true)
      .then((data) => setEvents(data.events))
      .catch((e) => toast.error(e.message || "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    if (viewMode === "calendar" && allEvents.length === 0) {
      api
        .getEvents(365, false)
        .then((data) => setAllEvents(data.events))
        .catch((e) => toast.error(e.message || "Ошибка загрузки"));
    }
  }, [viewMode]);

  // Reset selected day when changing month
  useEffect(() => {
    setSelectedDay(null);
  }, [calendarDate]);

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

  const daysLabel = (d: number) => {
    if (d <= 0) return "Сегодня";
    if (d === 1) return "Завтра";
    return `Через ${d} дн.`;
  };

  // Group events by daysUntil
  const grouped = events.reduce<Record<string, EventItem[]>>((acc, e) => {
    const label = daysLabel(e.daysUntil);
    if (!acc[label]) acc[label] = [];
    acc[label].push(e);
    return acc;
  }, {});

  // Calendar helpers
  const calendarYear = calendarDate.getFullYear();
  const calendarMonth = calendarDate.getMonth();
  const calendarDays = getCalendarDays(calendarYear, calendarMonth);

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === calendarYear && today.getMonth() === calendarMonth;

  // Map events to days for the selected month
  // eventDate is in DD.MM format
  const eventsForMonth = allEvents.filter((ev) => {
    const parts = ev.eventDate.split(".");
    if (parts.length < 2) return false;
    const eventMonth = parseInt(parts[1], 10);
    return eventMonth === calendarMonth + 1;
  });

  const eventsByDay: Record<number, EventItem[]> = {};
  eventsForMonth.forEach((ev) => {
    const dayNum = parseInt(ev.eventDate.split(".")[0], 10);
    if (!eventsByDay[dayNum]) eventsByDay[dayNum] = [];
    eventsByDay[dayNum].push(ev);
  });

  const selectedDayEvents = selectedDay ? eventsByDay[selectedDay] || [] : [];

  const prevMonth = () => {
    setCalendarDate(new Date(calendarYear, calendarMonth - 1, 1));
  };

  const nextMonth = () => {
    setCalendarDate(new Date(calendarYear, calendarMonth + 1, 1));
  };

  const renderEventCard = (event: EventItem, i: number) => (
    <AnimatedItem key={`${event.id}-${event.eventType}-${i}`} index={i}>
      <Link href={`/person?id=${event.id}`} prefetch={false}>
        <Card className="glass glass-hover hover:shadow-md transition-shadow cursor-pointer card-press">
          <CardContent className="flex items-center gap-4 py-3">
            <img
              src={mediaUrl(event.photo)}
              alt={`${event.lastName} ${event.firstName}`}
              loading="lazy"
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
            <div className="flex items-center gap-2 shrink-0">
              {event.daysUntil === 0 && (
                <span className="h-2 w-2 rounded-full bg-primary pulse-dot" />
              )}
              <span className="text-sm text-muted-foreground">
                {event.eventDate}
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </AnimatedItem>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Ближайшие события</h1>
      </div>

      <Tabs
        value={viewMode}
        onValueChange={(v) => setViewMode(v as "list" | "calendar")}
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="list">
            <List className="h-4 w-4 mr-1" />
            Список
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <Grid className="h-4 w-4 mr-1" />
            Календарь
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="flex items-center justify-end mb-4">
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
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-xl border">
                  <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <CalendarDays className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium mb-1">Нет событий</p>
                <p className="text-sm">В ближайшие {days} дней нет предстоящих событий</p>
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
                    {items.map((event, i) => renderEventCard(event, i))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-semibold">
              {MONTH_NAMES[calendarMonth]} {calendarYear}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="text-center text-xs font-medium text-muted-foreground py-1">
                {wd}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="min-h-[60px]" />;
              }

              const isToday = isCurrentMonth && day === today.getDate();
              const isSelected = selectedDay === day;
              const dayEvents = eventsByDay[day] || [];

              return (
                <div
                  key={`day-${day}`}
                  className={`min-h-[60px] p-1 border rounded-lg cursor-pointer transition-colors ${
                    isToday
                      ? "bg-primary/10 border-primary"
                      : "border-border/50 hover:bg-muted/50"
                  } ${isSelected ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedDay(day)}
                >
                  <span className={`text-xs ${isToday ? "font-bold text-primary" : ""}`}>
                    {day}
                  </span>
                  <div className="flex gap-0.5 mt-0.5 flex-wrap">
                    {dayEvents.map((ev, i) => (
                      <div
                        key={i}
                        className={`h-1.5 w-1.5 rounded-full ${
                          ev.eventType === "birthday"
                            ? "bg-primary"
                            : ev.eventType === "memorial"
                              ? "bg-red-500"
                              : "bg-accent"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span>День рождения</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span>День памяти</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-accent" />
              <span>Годовщина свадьбы</span>
            </div>
          </div>

          {/* Selected day events */}
          {selectedDay !== null && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {selectedDay} {MONTH_NAMES[calendarMonth]} ({selectedDayEvents.length})
              </h2>
              {selectedDayEvents.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <p>Нет событий в этот день</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map((event, i) => renderEventCard(event, i))}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

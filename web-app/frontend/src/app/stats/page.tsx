"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, Heart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedItem } from "@/components/animated-list";
import { AnimatedCounter } from "@/components/animated-counter";
import { api, mediaUrl, StatsData } from "@/lib/api";
import { SafeImage } from "@/components/safe-image";

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Статистика</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <Skeleton className="h-6 w-6 mx-auto rounded-full" />
              <Skeleton className="h-8 w-16 mx-auto" />
              <Skeleton className="h-3 w-20 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const summaryCards = [
    { label: "Всего людей", value: stats.totalPersons, icon: Users, color: "text-primary" },
    { label: "Мужчин", value: stats.maleCount, icon: Users, color: "text-blue-500" },
    { label: "Женщин", value: stats.femaleCount, icon: Users, color: "text-pink-500" },
    { label: "Живых", value: stats.aliveCount, icon: Heart, color: "text-primary" },
  ];

  const ageLabels: Record<string, string> = {
    "0-49": "До 50",
    "50-59": "50-59",
    "60-69": "60-69",
    "70-79": "70-79",
    "80-89": "80-89",
    "90-99": "90-99",
    "100+": "100+",
  };

  const maxAge = Math.max(...Object.values(stats.ageDistribution) as number[]);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Статистика</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {summaryCards.map((card, i) => (
          <AnimatedItem key={card.label} index={i}>
            <Card className="glass glass-hover">
              <CardContent className="py-4 text-center">
                <card.icon className={`h-6 w-6 mx-auto mb-2 ${card.color}`} />
                <p className="text-2xl font-bold">
                  <AnimatedCounter value={card.value} />
                </p>
                <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
              </CardContent>
            </Card>
          </AnimatedItem>
        ))}
      </div>

      {/* Age distribution */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card className="glass glass-hover mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Распределение по возрасту</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.ageDistribution).map(([range, count], i) => (
                <div key={range} className="flex items-center gap-3">
                  <span className="text-sm w-14 text-right text-muted-foreground">
                    {ageLabels[range] || range}
                  </span>
                  <div className="flex-1 h-7 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${((count as number) / maxAge) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.08, ease: "easeOut" }}
                      className="h-full bg-primary/70 rounded-full flex items-center justify-end pr-2"
                      style={{ minWidth: "2rem" }}
                    >
                      <span className="text-xs text-primary-foreground font-medium">
                        {(count as number).toLocaleString()}
                      </span>
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Longest lived */}
      {stats.longestLived.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Card className="glass glass-hover">
            <CardHeader>
              <CardTitle className="text-lg">Долгожители (90+ лет)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {stats.longestLived.map((person, i) => (
                  <AnimatedItem key={person.id} index={i}>
                    <a
                      href={`/person?id=${person.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors card-press"
                    >
                      <SafeImage
                        src={mediaUrl(person.photo)}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover bg-muted shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {person.lastName} {person.firstName}
                        </p>
                        <p className="text-xs text-muted-foreground">{person.age}</p>
                      </div>
                    </a>
                  </AnimatedItem>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

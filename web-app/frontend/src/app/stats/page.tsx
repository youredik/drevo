"use client";

import { useEffect, useState } from "react";
import { BarChart3, Users, Heart, HeartOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, mediaUrl } from "@/lib/api";

export default function StatsPage() {
  const [stats, setStats] = useState<any>(null);
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
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const summaryCards = [
    { label: "Всего людей", value: stats.totalPersons, icon: Users, color: "text-primary" },
    { label: "Мужчин", value: stats.maleCount, icon: Users, color: "text-blue-500" },
    { label: "Женщин", value: stats.femaleCount, icon: Users, color: "text-pink-500" },
    { label: "Живых", value: stats.aliveCount, icon: Heart, color: "text-emerald-500" },
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
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="py-4 text-center">
              <card.icon className={`h-6 w-6 mx-auto mb-2 ${card.color}`} />
              <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Age distribution */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Распределение по возрасту</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(stats.ageDistribution).map(([range, count]) => (
              <div key={range} className="flex items-center gap-3">
                <span className="text-sm w-14 text-right text-muted-foreground">
                  {ageLabels[range] || range}
                </span>
                <div className="flex-1 h-7 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${((count as number) / maxAge) * 100}%`, minWidth: "2rem" }}
                  >
                    <span className="text-xs text-primary-foreground font-medium">
                      {(count as number).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Longest lived */}
      {stats.longestLived.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Долгожители (90+ лет)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {stats.longestLived.map((person: any) => (
                <a
                  key={person.id}
                  href={`/person?id=${person.id}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <img
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
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

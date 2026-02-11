"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, User, UserPlus, UserMinus, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, AuditLog } from "@/lib/api";
import { toast } from "sonner";

const actionLabels: Record<string, string> = {
  create: "Создание",
  update: "Обновление",
  delete: "Удаление",
};

const actionColors: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  update: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const resourceLabels: Record<string, string> = {
  person: "Персона",
  user: "Пользователь",
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    setLoading(true);
    api.getAuditLogs(limit)
      .then((data) => setLogs(data.logs))
      .catch((e) => toast.error(e.message || "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [limit]);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Журнал действий</h1>
        </div>
        <div className="flex gap-2">
          {[50, 100, 200].map((n) => (
            <Button
              key={n}
              variant={limit === n ? "default" : "outline"}
              size="sm"
              onClick={() => setLimit(n)}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-3 flex items-center gap-4">
              <Skeleton className="h-6 w-20 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card className="glass">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Shield className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-1">Журнал пуст</p>
            <p className="text-sm">Действия администраторов будут отображаться здесь</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log.id} className="glass">
              <CardContent className="flex items-center gap-4 py-3">
                <div className="shrink-0">
                  <Badge variant="secondary" className={actionColors[log.action] || ""}>
                    {actionLabels[log.action] || log.action}
                  </Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {resourceLabels[log.resourceType] || log.resourceType}
                    {log.resourceId && (
                      <> #{log.resourceId}</>
                    )}
                    {log.details && (
                      <span className="text-muted-foreground"> — {log.details}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {log.userLogin} · {formatTimestamp(log.timestamp)}
                  </p>
                </div>
                {log.resourceType === "person" && log.resourceId && (
                  <Link href={`/person?id=${log.resourceId}`} prefetch={false}>
                    <Button variant="ghost" size="sm">Открыть</Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

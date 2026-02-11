"use client";

import { motion } from "framer-motion";

interface TimelineEvent {
  date: string;
  label: string;
  type: "birth" | "death" | "marriage" | "info";
}

interface TimelineProps {
  events: TimelineEvent[];
}

const typeColors: Record<string, string> = {
  birth: "bg-primary",
  death: "bg-red-500",
  marriage: "bg-accent",
  info: "bg-muted-foreground",
};

const typeLabels: Record<string, string> = {
  birth: "Рождение",
  death: "Смерть",
  marriage: "Свадьба",
  info: "",
};

export function Timeline({ events }: TimelineProps) {
  if (events.length === 0) return null;

  return (
    <div className="relative pl-6 space-y-4">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

      {events.map((event, i) => (
        <motion.div
          key={`${event.type}-${event.date}-${i}`}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: i * 0.1 }}
          className="relative flex items-start gap-3"
        >
          {/* Dot */}
          <div className={`absolute left-[-18px] top-1.5 h-3 w-3 rounded-full border-2 border-background ${typeColors[event.type]}`} />

          <div className="min-w-0">
            <p className="text-sm font-medium">{event.label}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{event.date}</span>
              {typeLabels[event.type] && (
                <span className="text-xs text-muted-foreground">{typeLabels[event.type]}</span>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

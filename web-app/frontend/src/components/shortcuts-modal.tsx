"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const shortcuts = [
  { key: "/", description: "Перейти к поиску" },
  { key: "h", description: "На главную" },
  { key: "s", description: "Поиск" },
  { key: "e", description: "События" },
  { key: "t", description: "Древо" },
  { key: "?", description: "Показать подсказки" },
];

const personShortcuts = [
  { key: "j / \u2193", description: "Следующий человек" },
  { key: "k / \u2191", description: "Предыдущий человек" },
];

export function ShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      )
        return;
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Клавиатурные сочетания</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Навигация
            </h3>
            <div className="space-y-1">
              {shortcuts.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between py-1.5"
                >
                  <span className="text-sm">{s.description}</span>
                  <kbd className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-md border bg-muted text-xs font-mono font-medium">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Страница человека
            </h3>
            <div className="space-y-1">
              {personShortcuts.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between py-1.5"
                >
                  <span className="text-sm">{s.description}</span>
                  <kbd className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-md border bg-muted text-xs font-mono font-medium">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

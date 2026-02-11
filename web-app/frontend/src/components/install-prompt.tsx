"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "drevo-install-dismissed";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  const raw = localStorage.getItem(DISMISSED_KEY);
  if (!raw) return false;
  const ts = parseInt(raw, 10);
  if (isNaN(ts)) return false;
  // Expire after 7 days so users see the prompt again
  if (Date.now() - ts > DISMISS_DURATION) {
    localStorage.removeItem(DISMISSED_KEY);
    return false;
  }
  return true;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (isDismissed() || isStandalone()) return;

    // iOS Safari — no beforeinstallprompt, show custom instructions
    if (isIOS() && isSafari()) {
      // Small delay so page loads first
      const timer = setTimeout(() => {
        setShowIOSPrompt(true);
        setVisible(true);
        requestAnimationFrame(() => setAnimateIn(true));
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Chrome / Android — standard flow
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
      requestAnimationFrame(() => setAnimateIn(true));
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      handleClose();
    }
    setDeferredPrompt(null);
  };

  const handleClose = () => {
    setAnimateIn(false);
    setTimeout(() => setVisible(false), 300);
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  };

  if (!visible) return null;

  // iOS Safari instructions
  if (showIOSPrompt) {
    return (
      <div
        className={`install-prompt fixed bottom-20 md:bottom-6 left-3 right-3 md:left-auto md:right-4 md:w-80 z-50 rounded-2xl p-4 transition-all duration-300 ${
          animateIn
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 h-12 w-12 rounded-xl btn-gradient flex items-center justify-center shadow-lg">
            <Download className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Установить Drevo</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Добавьте приложение на главный экран:
            </p>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-primary/10 flex-shrink-0">
                  <Share className="h-3 w-3 text-primary" />
                </span>
                <span>
                  Нажмите{" "}
                  <strong className="text-foreground">Поделиться</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-primary/10 flex-shrink-0">
                  <Plus className="h-3 w-3 text-primary" />
                </span>
                <span>
                  Выберите{" "}
                  <strong className="text-foreground">
                    На экран «Домой»
                  </strong>
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2 mt-2"
              onClick={handleClose}
            >
              Понятно
            </Button>
          </div>
          <button
            onClick={handleClose}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Chrome / Android standard prompt
  return (
    <div
      className={`install-prompt fixed bottom-20 md:bottom-6 left-3 right-3 md:left-auto md:right-4 md:w-80 z-50 rounded-2xl p-4 transition-all duration-300 ${
        animateIn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 h-12 w-12 rounded-xl btn-gradient flex items-center justify-center shadow-lg">
          <Download className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Установить Drevo</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Добавьте на главный экран для быстрого доступа
          </p>
          <div className="flex gap-2 mt-2.5">
            <Button
              size="sm"
              className="btn-gradient h-8 text-xs px-4 font-medium"
              onClick={handleInstall}
            >
              Установить
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs px-2"
              onClick={handleClose}
            >
              Не сейчас
            </Button>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

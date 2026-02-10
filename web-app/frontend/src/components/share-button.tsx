"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
  className?: string;
}

export function ShareButton({ title, text, url, className }: ShareButtonProps) {
  const handleShare = async () => {
    const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");
    const shareData = { title, text: text || title, url: shareUrl };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e: any) {
        if (e.name !== "AbortError") {
          fallbackCopy(shareUrl);
        }
      }
    } else {
      fallbackCopy(shareUrl);
    }
  };

  const fallbackCopy = (shareUrl: string) => {
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.success("Ссылка скопирована"),
      () => toast.error("Не удалось скопировать")
    );
  };

  return (
    <Button variant="outline" size="sm" className={`gap-2 ${className || ""}`} onClick={handleShare}>
      <Share2 className="h-4 w-4" />
      <span className="hidden sm:inline">Поделиться</span>
    </Button>
  );
}

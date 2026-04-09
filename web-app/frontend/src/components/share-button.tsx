"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { RefObject } from "react";
import { useState } from "react";

interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
  className?: string;
  /** When provided, the referenced element is captured as PNG and shared
   *  as a file via the Web Share API (mobile native share sheet). */
  captureRef?: RefObject<HTMLElement | null>;
  /** Custom label for the screenshot file. */
  fileName?: string;
  /** Background colour for the captured screenshot. */
  backgroundColor?: string;
}

export function ShareButton({
  title,
  text,
  url,
  className,
  captureRef,
  fileName = "drevo.png",
  backgroundColor = "#000000",
}: ShareButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleShare = async () => {
    if (busy) return;
    const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

    // ── Screenshot mode ─────────────────────────────────────
    if (captureRef?.current) {
      setBusy(true);
      try {
        const { toBlob } = await import("html-to-image");
        const blob = await toBlob(captureRef.current, {
          backgroundColor,
          pixelRatio: 2,
          cacheBust: true,
        });
        if (!blob) throw new Error("Не удалось создать скриншот");

        const file = new File([blob], fileName, { type: "image/png" });

        if (
          typeof navigator !== "undefined" &&
          navigator.canShare &&
          navigator.canShare({ files: [file] }) &&
          navigator.share
        ) {
          try {
            await navigator.share({ title, text: text || title, files: [file] });
            return;
          } catch (e: any) {
            if (e?.name === "AbortError") return;
            // fall through to download fallback
          }
        }

        // Fallback — copy image to clipboard
        try {
          if (
            typeof navigator !== "undefined" &&
            navigator.clipboard &&
            typeof ClipboardItem !== "undefined"
          ) {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            toast.success("Скриншот скопирован в буфер обмена");
            return;
          }
        } catch (clipErr) {
          console.warn("Clipboard image write failed:", clipErr);
        }

        // Last resort — download the screenshot
        const dl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = fileName;
        link.href = dl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(dl);
        toast.info("Скриншот сохранён — отправьте его вручную");
      } catch (e: any) {
        console.error("Share screenshot failed:", e);
        toast.error("Не удалось поделиться: " + (e?.message || "ошибка"));
      } finally {
        setBusy(false);
      }
      return;
    }

    // ── URL-only share mode (original behaviour) ────────────
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
    <Button
      variant="outline"
      size="sm"
      className={`gap-2 ${className || ""}`}
      onClick={handleShare}
      disabled={busy}
    >
      <Share2 className="h-4 w-4" />
      <span className="hidden sm:inline">{busy ? "..." : "Поделиться"}</span>
    </Button>
  );
}

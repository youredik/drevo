"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      // Escape: close modals / go back
      if (e.key === "Escape" && !isInput) {
        // Let other escape handlers (lightbox, dialogs) take priority
        return;
      }

      // Don't handle shortcuts when typing
      if (isInput) return;

      // "/" — focus search
      if (e.key === "/") {
        e.preventDefault();
        router.push("/search");
        return;
      }

      // "g" then key combos (vim-style go-to)
      if (e.key === "g" && !e.ctrlKey && !e.metaKey) {
        // We'll handle single-key shortcuts instead
        return;
      }

      // Navigation shortcuts
      if (e.key === "h" && !e.ctrlKey && !e.metaKey) {
        router.push("/");
        return;
      }

      if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
        router.push("/search");
        return;
      }

      if (e.key === "e" && !e.ctrlKey && !e.metaKey) {
        router.push("/events");
        return;
      }

      if (e.key === "t" && !e.ctrlKey && !e.metaKey) {
        router.push("/tree");
        return;
      }

      // J/K — navigate person IDs on person page
      if (pathname.startsWith("/person")) {
        const params = new URLSearchParams(window.location.search);
        const currentId = parseInt(params.get("id") || "0");
        if (currentId > 0) {
          if (e.key === "j" || e.key === "ArrowDown") {
            router.push(`/person?id=${currentId + 1}`);
            return;
          }
          if (e.key === "k" || e.key === "ArrowUp") {
            if (currentId > 1) router.push(`/person?id=${currentId - 1}`);
            return;
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, pathname]);

  return null;
}

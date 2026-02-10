"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollToTop } from "@/components/scroll-to-top";
import { NavProgress } from "@/components/nav-progress";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { Breadcrumbs } from "@/components/breadcrumbs";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Suspense>
            <NavProgress />
          </Suspense>
          <KeyboardShortcuts />
          <Breadcrumbs />
          {children}
          <ScrollToTop />
          <Toaster position="top-right" richColors closeButton duration={4000} />
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

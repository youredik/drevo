"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-bold mb-2">Произошла ошибка</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            {error.message || "Что-то пошло не так. Попробуйте обновить страницу."}
          </p>
          <Button onClick={reset}>Попробовать снова</Button>
        </CardContent>
      </Card>
    </div>
  );
}

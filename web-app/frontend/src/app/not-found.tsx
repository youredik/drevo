import Link from "next/link";
import { TreePine, Home, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 gradient-dramatic">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center">
            <TreePine className="h-10 w-10 text-muted-foreground" />
          </div>
        </div>
        <h1 className="text-6xl font-bold text-gradient mb-2">404</h1>
        <h2 className="text-xl font-semibold mb-2">Страница не найдена</h2>
        <p className="text-muted-foreground mb-8">
          Возможно, эта ветвь ещё не выросла в нашем древе
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button className="gap-2 w-full sm:w-auto">
              <Home className="h-4 w-4" />
              На главную
            </Button>
          </Link>
          <Link href="/search">
            <Button variant="outline" className="gap-2 w-full sm:w-auto">
              <Search className="h-4 w-4" />
              Поиск
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  TreePine,
  Search,
  CalendarDays,
  Users,
  BarChart3,
  GitFork,
  Menu,
  X,
  LogIn,
  LogOut,
  Settings,
  Sun,
  Moon,
  ClipboardList,
  Heart,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { api } from "@/lib/api";

const navItems = [
  { href: "/", label: "Главная", icon: TreePine },
  { href: "/search", label: "Поиск", icon: Search },
  { href: "/events", label: "События", icon: CalendarDays },
  { href: "/tree", label: "Древо", icon: GitFork },
  { href: "/favorites", label: "Избранное", icon: Heart },
  { href: "/stats", label: "Статистика", icon: BarChart3 },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout, isAdmin, canEdit } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    api.getEvents(0, false)
      .then((data) => setTodayCount(data.events.filter((e) => e.daysUntil === 0).length))
      .catch(() => {});
  }, []);

  // Hide navbar on login page
  if (pathname === "/login") return null;

  return (
    <>
      {/* Desktop navbar */}
      <header className="sticky top-0 z-50 hidden md:block border-b bg-card/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <TreePine className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold tracking-tight">Drevo</span>
          </Link>

          <nav aria-label="Основная навигация" className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} prefetch={false} aria-current={isActive ? "page" : undefined}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className="gap-2"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                    {item.href === "/events" && todayCount > 0 && (
                      <span className="h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {todayCount}
                      </span>
                    )}
                  </Button>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                        {user.login[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{user.login}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled>
                    Роль: {user.role === "admin" ? "Админ" : user.role === "manager" ? "Менеджер" : "Просмотр"}
                  </DropdownMenuItem>
                  {canEdit && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/admin/persons" prefetch={false}>
                          <ClipboardList className="h-4 w-4 mr-2" />
                          Управление
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/settings" prefetch={false}>
                          <Settings className="h-4 w-4 mr-2" />
                          Настройки
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/users" prefetch={false}>
                          <Users className="h-4 w-4 mr-2" />
                          Пользователи
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/audit" prefetch={false}>
                          <Shield className="h-4 w-4 mr-2" />
                          Журнал
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Выйти
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/login" prefetch={false}>
                <Button variant="outline" size="sm" className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Войти
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav aria-label="Мобильная навигация" className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur-md">
        <div className="flex items-center justify-around h-16">
          {navItems.slice(0, 5).map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div className="relative">
                  <item.icon className="h-5 w-5" />
                  {item.href === "/events" && todayCount > 0 && (
                    <span className="absolute -top-1 -right-2 h-3.5 min-w-3.5 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {todayCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-muted-foreground">
                <Menu className="h-5 w-5" />
                <span className="text-[10px] font-medium">Ещё</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <div className="flex flex-col gap-2 py-4">
                <Link href="/stats" prefetch={false} onClick={() => setOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start gap-3">
                    <BarChart3 className="h-5 w-5" />
                    Статистика
                  </Button>
                </Link>
                <Button variant="ghost" className="w-full justify-start gap-3" onClick={toggleTheme}>
                  {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
                </Button>
                {user ? (
                  <>
                    <div className="px-4 py-2 text-sm text-muted-foreground">
                      {user.login} ({user.role === "admin" ? "Админ" : user.role === "manager" ? "Менеджер" : "Просмотр"})
                    </div>
                    {canEdit && (
                      <Link href="/admin/persons" prefetch={false} onClick={() => setOpen(false)}>
                        <Button variant="ghost" className="w-full justify-start gap-3">
                          <ClipboardList className="h-5 w-5" />
                          Управление
                        </Button>
                      </Link>
                    )}
                    {isAdmin && (
                      <>
                        <Link href="/settings" prefetch={false} onClick={() => setOpen(false)}>
                          <Button variant="ghost" className="w-full justify-start gap-3">
                            <Settings className="h-5 w-5" />
                            Настройки
                          </Button>
                        </Link>
                        <Link href="/users" prefetch={false} onClick={() => setOpen(false)}>
                          <Button variant="ghost" className="w-full justify-start gap-3">
                            <Users className="h-5 w-5" />
                            Пользователи
                          </Button>
                        </Link>
                        <Link href="/admin/audit" prefetch={false} onClick={() => setOpen(false)}>
                          <Button variant="ghost" className="w-full justify-start gap-3">
                            <Shield className="h-5 w-5" />
                            Журнал
                          </Button>
                        </Link>
                      </>
                    )}
                    <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { logout(); setOpen(false); }}>
                      <LogOut className="h-5 w-5" />
                      Выйти
                    </Button>
                  </>
                ) : (
                  <Link href="/login" prefetch={false} onClick={() => setOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start gap-3">
                      <LogIn className="h-5 w-5" />
                      Войти
                    </Button>
                  </Link>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-40 border-b bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-between h-14 px-4">
          <Link href="/" className="flex items-center gap-2">
            <TreePine className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Drevo</span>
          </Link>
          {user && (
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {user.login[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </header>
    </>
  );
}

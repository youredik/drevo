"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Search, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { api, mediaUrl } from "@/lib/api";

export default function AdminPersonsPage() {
  const { canEdit, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPerson, setNewPerson] = useState({ firstName: "", lastName: "", sex: "1" as string });

  const limit = 50;

  useEffect(() => {
    if (authLoading) return;
    if (!canEdit) { router.push("/"); return; }
    loadPage(1);
  }, [canEdit, authLoading]);

  function loadPage(p: number) {
    setLoading(true);
    setSearchResults(null);
    api.getPersons(p, limit)
      .then((d) => { setItems(d.items); setTotal(d.total); setPage(p); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  function doSearch() {
    if (!searchQuery.trim()) { loadPage(1); return; }
    setLoading(true);
    api.search(searchQuery)
      .then((d) => { setSearchResults(d.results); setLoading(false); })
      .catch(() => setLoading(false));
  }

  function handleDelete() {
    if (!deleteId) return;
    api.deletePerson(deleteId)
      .then(() => { setDeleteId(null); searchResults ? doSearch() : loadPage(page); })
      .catch(console.error);
  }

  function handleCreate() {
    api.createPerson({
      firstName: newPerson.firstName,
      lastName: newPerson.lastName,
      sex: Number(newPerson.sex) as 0 | 1,
    }).then((d) => {
      setCreateOpen(false);
      setNewPerson({ firstName: "", lastName: "", sex: "1" });
      router.push(`/admin/person?id=${d.person.id}`);
    }).catch(console.error);
  }

  const displayItems = searchResults || items;
  const totalPages = Math.ceil(total / limit);

  if (authLoading) return <div className="max-w-6xl mx-auto px-4 py-8"><Skeleton className="h-96 rounded-xl" /></div>;
  if (!canEdit) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle>Управление людьми</CardTitle>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Поиск по имени, фамилии..."
              className="max-w-sm"
            />
            <Button variant="outline" onClick={doSearch}><Search className="h-4 w-4" /></Button>
            {searchResults && (
              <Button variant="ghost" onClick={() => loadPage(page)}>Сбросить</Button>
            )}
          </div>

          {loading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">ID</TableHead>
                      <TableHead>Фамилия Имя</TableHead>
                      <TableHead className="hidden md:table-cell">Рождение</TableHead>
                      <TableHead className="hidden lg:table-cell">Адрес</TableHead>
                      <TableHead className="w-24">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayItems.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm">{p.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={p.sex === 1 ? "default" : "secondary"} className="text-xs">
                              {p.sex === 1 ? "М" : "Ж"}
                            </Badge>
                            {p.lastName} {p.firstName}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {p.birthDay || "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground truncate max-w-48">
                          {p.address || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Link href={`/admin/person?id=${p.id}`}>
                              <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
                            </Link>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {displayItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          {searchResults ? "Ничего не найдено" : "Нет данных"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {!searchResults && totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => loadPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {page} / {totalPages} (всего: {total})
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => loadPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить человека?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Все связи (супруги, дети) будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create person dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый человек</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Фамилия</Label>
              <Input value={newPerson.lastName} onChange={(e) => setNewPerson({ ...newPerson, lastName: e.target.value })} />
            </div>
            <div>
              <Label>Имя</Label>
              <Input value={newPerson.firstName} onChange={(e) => setNewPerson({ ...newPerson, firstName: e.target.value })} />
            </div>
            <div>
              <Label>Пол</Label>
              <Select value={newPerson.sex} onValueChange={(v) => setNewPerson({ ...newPerson, sex: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Мужской</SelectItem>
                  <SelectItem value="0">Женский</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={!newPerson.firstName || !newPerson.lastName}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

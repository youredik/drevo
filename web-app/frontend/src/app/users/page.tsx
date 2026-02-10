"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

const roleLabels: Record<string, string> = { admin: "Админ", manager: "Менеджер", viewer: "Просмотр" };

export default function UsersPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ login: "", password: "", role: "viewer" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) { router.push("/"); return; }
    loadUsers();
  }, [isAdmin, authLoading]);

  function loadUsers() {
    setLoading(true);
    api.getUsers()
      .then((d) => setUsers(d.users))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  function showMsg(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleCreate() {
    try {
      await api.createUser(form.login, form.password, form.role);
      setCreateOpen(false);
      setForm({ login: "", password: "", role: "viewer" });
      loadUsers();
      showMsg("Пользователь создан");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  async function handleEdit() {
    if (!editUser) return;
    try {
      const updates: any = { login: form.login, role: form.role };
      if (form.password) updates.password = form.password;
      await api.updateUser(editUser.id, updates);
      setEditUser(null);
      loadUsers();
      showMsg("Пользователь обновлён");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await api.deleteUser(deleteId);
      setDeleteId(null);
      loadUsers();
      showMsg("Пользователь удалён");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  function openEdit(user: any) {
    setForm({ login: user.login, password: "", role: user.role });
    setEditUser(user);
  }

  if (authLoading) return <div className="max-w-4xl mx-auto px-4 py-8"><Skeleton className="h-64 rounded-xl" /></div>;
  if (!isAdmin) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
      {message && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${message.startsWith("Ошибка") ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-700 dark:text-green-400"}`}>
          {message}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Пользователи</CardTitle>
          <Button className="gap-2" onClick={() => { setForm({ login: "", password: "", role: "viewer" }); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Логин</TableHead>
                    <TableHead>Роль</TableHead>
                    <TableHead className="hidden sm:table-cell">Создан</TableHead>
                    <TableHead className="w-24">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.login}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "default" : u.role === "manager" ? "secondary" : "outline"}>
                          {roleLabels[u.role] || u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("ru") : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(u.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Новый пользователь</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Логин</Label><Input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} /></div>
            <div><Label>Пароль</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div>
              <Label>Роль</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Админ</SelectItem>
                  <SelectItem value="manager">Менеджер</SelectItem>
                  <SelectItem value="viewer">Просмотр</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={!form.login || !form.password}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Редактировать пользователя</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Логин</Label><Input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} /></div>
            <div><Label>Пароль (оставьте пустым для сохранения текущего)</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div>
              <Label>Роль</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Админ</SelectItem>
                  <SelectItem value="manager">Менеджер</SelectItem>
                  <SelectItem value="viewer">Просмотр</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Отмена</Button>
            <Button onClick={handleEdit} disabled={!form.login}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
            <AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

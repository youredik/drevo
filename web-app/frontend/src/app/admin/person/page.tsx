"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Save, ArrowLeft, Trash2, Plus, Upload, X, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { api, mediaUrl } from "@/lib/api";
import { PersonSearchSelect } from "@/components/person-search-select";

function PersonEditor() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { canEdit } = useAuth();
  const id = Number(searchParams.get("id"));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [data, setData] = useState<any>(null);

  // Form fields
  const [form, setForm] = useState({
    firstName: "", lastName: "", sex: "1",
    birthDay: "", birthPlace: "", deathDay: "", deathPlace: "",
    address: "", marryDay: "",
    orderByDad: "0", orderByMom: "0", orderBySpouse: "0",
  });

  // Relations
  const [fatherId, setFatherId] = useState<number | undefined>();
  const [motherId, setMotherId] = useState<number | undefined>();
  const [spouses, setSpouses] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [bioLoaded, setBioLoaded] = useState(false);

  // Dialogs
  const [deletePhotoName, setDeletePhotoName] = useState<string | null>(null);
  const [removeSpouseId, setRemoveSpouseId] = useState<number | null>(null);
  const [removeChildId, setRemoveChildId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id || !canEdit) return;
    setLoading(true);
    api.getPerson(id).then((d) => {
      setData(d);
      const p = d.person;
      setForm({
        firstName: p.firstName || "", lastName: p.lastName || "",
        sex: String(p.sex), birthDay: p.birthDay || "", birthPlace: p.birthPlace || "",
        deathDay: p.deathDay || "", deathPlace: p.deathPlace || "",
        address: p.address || "", marryDay: p.marryDay || "",
        orderByDad: String(p.orderByDad || 0), orderByMom: String(p.orderByMom || 0),
        orderBySpouse: String(p.orderBySpouse || 0),
      });
      setFatherId(d.father?.id || undefined);
      setMotherId(d.mother?.id || undefined);
      setSpouses(d.spouses || []);
      setChildren(d.children || []);
      setPhotos(d.photos || []);
      if (d.hasBio) {
        api.getBio(id).then((b) => { setBio(b.text); setBioLoaded(true); }).catch(() => setBioLoaded(true));
      } else {
        setBioLoaded(true);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [id, canEdit]);

  function showMsg(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updatePerson(id, {
        firstName: form.firstName, lastName: form.lastName,
        sex: Number(form.sex), birthDay: form.birthDay, birthPlace: form.birthPlace,
        deathDay: form.deathDay, deathPlace: form.deathPlace,
        address: form.address, marryDay: form.marryDay,
        orderByDad: Number(form.orderByDad), orderByMom: Number(form.orderByMom),
        orderBySpouse: Number(form.orderBySpouse),
      });

      // Update parents if changed
      const oldFather = data?.father?.id || 0;
      const oldMother = data?.mother?.id || 0;
      if ((fatherId || 0) !== oldFather || (motherId || 0) !== oldMother) {
        await api.setParents(id, fatherId || 0, motherId || 0);
      }

      showMsg("Сохранено!");
      // Reload data
      const d = await api.getPerson(id);
      setData(d);
      setSpouses(d.spouses || []);
      setChildren(d.children || []);
      setPhotos(d.photos || []);
    } catch (e: any) {
      showMsg("Ошибка: " + e.message);
    }
    setSaving(false);
  }

  async function handleSaveBio() {
    try {
      await api.saveBio(id, bio);
      showMsg("Биография сохранена!");
    } catch (e: any) {
      showMsg("Ошибка: " + e.message);
    }
  }

  async function handleAddSpouse(spouseId: number | undefined) {
    if (!spouseId) return;
    try {
      await api.addSpouse(id, spouseId);
      const d = await api.getPerson(id);
      setSpouses(d.spouses || []);
      showMsg("Супруг(а) добавлен(а)");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  async function handleRemoveSpouse() {
    if (!removeSpouseId) return;
    try {
      await api.removeSpouse(id, removeSpouseId);
      setSpouses((prev) => prev.filter((s) => s.id !== removeSpouseId));
      setRemoveSpouseId(null);
      showMsg("Супруг(а) удалён(а)");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  async function handleAddChild(childId: number | undefined) {
    if (!childId) return;
    try {
      await api.addChild(id, childId);
      const d = await api.getPerson(id);
      setChildren(d.children || []);
      showMsg("Ребёнок добавлен");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  async function handleRemoveChild() {
    if (!removeChildId) return;
    try {
      await api.removeChild(id, removeChildId);
      setChildren((prev) => prev.filter((c) => c.id !== removeChildId));
      setRemoveChildId(null);
      showMsg("Ребёнок удалён из списка");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  async function handleUploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        await api.uploadPhoto(id, base64, file.name);
        const d = await api.getPerson(id);
        setPhotos(d.photos || []);
        showMsg("Фото загружено");
      } catch (err: any) { showMsg("Ошибка: " + err.message); }
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDeletePhoto() {
    if (!deletePhotoName) return;
    try {
      await api.deletePhoto(id, deletePhotoName);
      setPhotos((prev) => prev.filter((p) => p !== deletePhotoName));
      setDeletePhotoName(null);
      showMsg("Фото удалено");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><Skeleton className="h-96 rounded-xl" /></div>;
  }
  if (!data) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center"><p className="text-muted-foreground">Человек не найден</p></div>;
  }

  const usedIds = [id, fatherId, motherId, ...spouses.map((s: any) => s.id), ...children.map((c: any) => c.id)].filter(Boolean) as number[];

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/persons">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-xl font-bold flex-1">
          Редактирование: {data.person.lastName} {data.person.firstName}
          <Badge variant="secondary" className="ml-2">ID: {id}</Badge>
        </h1>
        <Link href={`/person?id=${id}`}>
          <Button variant="outline" size="sm" className="gap-2"><Eye className="h-4 w-4" /> Просмотр</Button>
        </Link>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${message.startsWith("Ошибка") ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-700 dark:text-green-400"}`}>
          {message}
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList className="w-full">
          <TabsTrigger value="info" className="flex-1">Информация</TabsTrigger>
          <TabsTrigger value="relations" className="flex-1">Связи</TabsTrigger>
          <TabsTrigger value="photos" className="flex-1">Фото</TabsTrigger>
          <TabsTrigger value="bio" className="flex-1">Биография</TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Фамилия</Label>
                  <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
                <div>
                  <Label>Имя</Label>
                  <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Пол</Label>
                <Select value={form.sex} onValueChange={(v) => setForm({ ...form, sex: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Мужской</SelectItem>
                    <SelectItem value="0">Женский</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Дата рождения (ДД.ММ.ГГГГ)</Label>
                  <Input value={form.birthDay} onChange={(e) => setForm({ ...form, birthDay: e.target.value })} placeholder="01.01.1990" />
                </div>
                <div>
                  <Label>Место рождения</Label>
                  <Input value={form.birthPlace} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Дата смерти</Label>
                  <Input value={form.deathDay} onChange={(e) => setForm({ ...form, deathDay: e.target.value })} placeholder="Пусто = жив" />
                </div>
                <div>
                  <Label>Место смерти</Label>
                  <Input value={form.deathPlace} onChange={(e) => setForm({ ...form, deathPlace: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Адрес</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <Label>Дата свадьбы</Label>
                <Input value={form.marryDay} onChange={(e) => setForm({ ...form, marryDay: e.target.value })} placeholder="ДД.ММ.ГГГГ" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Порядок (отец)</Label>
                  <Input type="number" value={form.orderByDad} onChange={(e) => setForm({ ...form, orderByDad: e.target.value })} />
                </div>
                <div>
                  <Label>Порядок (мать)</Label>
                  <Input type="number" value={form.orderByMom} onChange={(e) => setForm({ ...form, orderByMom: e.target.value })} />
                </div>
                <div>
                  <Label>Порядок (супруг)</Label>
                  <Input type="number" value={form.orderBySpouse} onChange={(e) => setForm({ ...form, orderBySpouse: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" /> {saving ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Relations Tab */}
        <TabsContent value="relations" className="mt-4 space-y-4">
          {/* Parents */}
          <Card>
            <CardHeader><CardTitle className="text-base">Родители</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Отец</Label>
                <PersonSearchSelect value={fatherId} onChange={setFatherId} placeholder="Поиск отца..." excludeIds={[id]} />
              </div>
              <div>
                <Label>Мать</Label>
                <PersonSearchSelect value={motherId} onChange={setMotherId} placeholder="Поиск матери..." excludeIds={[id]} />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
                  <Save className="h-4 w-4" /> Сохранить родителей
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Spouses */}
          <Card>
            <CardHeader><CardTitle className="text-base">Супруги</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {spouses.map((s: any) => (
                <div key={s.id} className="flex items-center gap-2 p-2 border rounded-md">
                  <span className="flex-1 text-sm">{s.lastName} {s.firstName} (ID: {s.id})</span>
                  <Button variant="ghost" size="icon" onClick={() => setRemoveSpouseId(s.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <div>
                <Label>Добавить супруга</Label>
                <PersonSearchSelect onChange={handleAddSpouse} placeholder="Поиск..." excludeIds={usedIds} />
              </div>
            </CardContent>
          </Card>

          {/* Children */}
          <Card>
            <CardHeader><CardTitle className="text-base">Дети</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {children.map((c: any) => (
                <div key={c.id} className="flex items-center gap-2 p-2 border rounded-md">
                  <span className="flex-1 text-sm">{c.lastName} {c.firstName} (ID: {c.id})</span>
                  <Button variant="ghost" size="icon" onClick={() => setRemoveChildId(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <div>
                <Label>Добавить ребёнка</Label>
                <PersonSearchSelect onChange={handleAddChild} placeholder="Поиск..." excludeIds={usedIds} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Фотографии ({photos.length})</CardTitle>
              <Button size="sm" className="gap-2" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Загрузить
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadPhoto} />
            </CardHeader>
            <CardContent>
              {photos.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">Нет фотографий</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {photos.map((photo) => (
                    <div key={photo} className="relative group">
                      <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted">
                        <img src={mediaUrl(photo)} alt="" className="w-full h-full object-cover" />
                      </div>
                      <button
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setDeletePhotoName(photo)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{photo}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bio Tab */}
        <TabsContent value="bio" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Биография</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={12}
                placeholder="Текст биографии..."
              />
              <div className="flex justify-end">
                <Button onClick={handleSaveBio} className="gap-2">
                  <Save className="h-4 w-4" /> Сохранить биографию
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete photo dialog */}
      <AlertDialog open={!!deletePhotoName} onOpenChange={() => setDeletePhotoName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить фото?</AlertDialogTitle>
            <AlertDialogDescription>Файл {deletePhotoName} будет удалён.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePhoto} className="bg-destructive text-destructive-foreground">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove spouse dialog */}
      <AlertDialog open={!!removeSpouseId} onOpenChange={() => setRemoveSpouseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Убрать супруга?</AlertDialogTitle>
            <AlertDialogDescription>Связь будет удалена у обоих.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveSpouse} className="bg-destructive text-destructive-foreground">Убрать</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove child dialog */}
      <AlertDialog open={!!removeChildId} onOpenChange={() => setRemoveChildId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Убрать ребёнка?</AlertDialogTitle>
            <AlertDialogDescription>Связь родитель-ребёнок будет удалена.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveChild} className="bg-destructive text-destructive-foreground">Убрать</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminPersonPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-8"><Skeleton className="h-96 rounded-xl" /></div>}>
      <PersonEditor />
    </Suspense>
  );
}

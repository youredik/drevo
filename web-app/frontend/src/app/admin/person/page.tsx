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
import { api, mediaUrl, PersonCard, PersonBrief } from "@/lib/api";
import { PersonSearchSelect } from "@/components/person-search-select";
import { SafeImage } from "@/components/safe-image";
import { toast } from "sonner";

function validateDate(value: string): boolean {
  if (!value) return true; // empty is ok
  return /^\d{4}$/.test(value) || /^\d{2}\.\d{2}\.\d{4}$/.test(value);
}

function PersonEditor() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { canEdit } = useAuth();
  const id = Number(searchParams.get("id"));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PersonCard | null>(null);

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
  const [spouses, setSpouses] = useState<PersonBrief[]>([]);
  const [children, setChildren] = useState<PersonBrief[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [bioLoaded, setBioLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);

  const updateForm = (updates: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  };

  // Dialogs
  const [deletePhotoName, setDeletePhotoName] = useState<string | null>(null);
  const [removeSpouseId, setRemoveSpouseId] = useState<number | null>(null);
  const [removeChildId, setRemoveChildId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Mutation loading states
  const [addingSpouse, setAddingSpouse] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [removingSpouse, setRemovingSpouse] = useState(false);
  const [removingChild, setRemovingChild] = useState(false);

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
    }).catch((e) => toast.error(e.message || "Ошибка загрузки")).finally(() => setLoading(false));
  }, [id, canEdit]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  async function handleSave() {
    if (!form.firstName.trim() && !form.lastName.trim()) {
      toast.error("Укажите имя или фамилию");
      return;
    }
    if (!validateDate(form.birthDay)) {
      toast.error("Неверный формат даты рождения (ДД.ММ.ГГГГ или ГГГГ)");
      return;
    }
    if (!validateDate(form.deathDay)) {
      toast.error("Неверный формат даты смерти");
      return;
    }
    if (!validateDate(form.marryDay)) {
      toast.error("Неверный формат даты свадьбы");
      return;
    }
    setSaving(true);
    try {
      await api.updatePerson(id, {
        firstName: form.firstName, lastName: form.lastName,
        sex: Number(form.sex) as 0 | 1, birthDay: form.birthDay, birthPlace: form.birthPlace,
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

      toast.success("Сохранено!");
      setDirty(false);
      // Reload data
      const d = await api.getPerson(id);
      setData(d);
      setSpouses(d.spouses || []);
      setChildren(d.children || []);
      setPhotos(d.photos || []);
    } catch (e: any) {
      toast.error(e.message || "Ошибка");
    }
    setSaving(false);
  }

  async function handleSaveBio() {
    setSavingBio(true);
    try {
      await api.saveBio(id, bio);
      toast.success("Биография сохранена!");
      setDirty(false);
    } catch (e: any) {
      toast.error(e.message || "Ошибка");
    } finally {
      setSavingBio(false);
    }
  }

  async function handleAddSpouse(spouseId: number | undefined) {
    if (!spouseId) return;
    setAddingSpouse(true);
    try {
      await api.addSpouse(id, spouseId);
      const d = await api.getPerson(id);
      setSpouses(d.spouses || []);
      toast.success("Супруг(а) добавлен(а)");
    } catch (e: any) { toast.error(e.message || "Ошибка"); }
    finally { setAddingSpouse(false); }
  }

  async function handleRemoveSpouse() {
    if (!removeSpouseId) return;
    const removedId = removeSpouseId;
    const removedSpouse = spouses.find((s) => s.id === removedId);
    setRemovingSpouse(true);
    try {
      await api.removeSpouse(id, removedId);
      setSpouses((prev) => prev.filter((s) => s.id !== removedId));
      setRemoveSpouseId(null);
      toast.success("Супруг(а) удалён(а)", {
        action: {
          label: "Отменить",
          onClick: async () => {
            try {
              await api.addSpouse(id, removedId);
              const d = await api.getPerson(id);
              setSpouses(d.spouses || []);
              toast.success("Связь восстановлена");
            } catch { toast.error("Не удалось отменить"); }
          },
        },
      });
    } catch (e: any) { toast.error(e.message || "Ошибка"); }
    finally { setRemovingSpouse(false); }
  }

  async function handleAddChild(childId: number | undefined) {
    if (!childId) return;
    setAddingChild(true);
    try {
      await api.addChild(id, childId);
      const d = await api.getPerson(id);
      setChildren(d.children || []);
      toast.success("Ребёнок добавлен");
    } catch (e: any) { toast.error(e.message || "Ошибка"); }
    finally { setAddingChild(false); }
  }

  async function handleRemoveChild() {
    if (!removeChildId) return;
    const removedId = removeChildId;
    setRemovingChild(true);
    try {
      await api.removeChild(id, removedId);
      setChildren((prev) => prev.filter((c) => c.id !== removedId));
      setRemoveChildId(null);
      toast.success("Ребёнок удалён из списка", {
        action: {
          label: "Отменить",
          onClick: async () => {
            try {
              await api.addChild(id, removedId);
              const d = await api.getPerson(id);
              setChildren(d.children || []);
              toast.success("Связь восстановлена");
            } catch { toast.error("Не удалось отменить"); }
          },
        },
      });
    } catch (e: any) { toast.error(e.message || "Ошибка"); }
    finally { setRemovingChild(false); }
  }

  async function handleUploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        await api.uploadPhoto(id, base64, file.name);
        const d = await api.getPerson(id);
        setPhotos(d.photos || []);
        toast.success("Фото загружено");
      } catch (err: any) { toast.error(err.message || "Ошибка"); }
      finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDeletePhoto() {
    if (!deletePhotoName) return;
    setDeletingPhoto(true);
    try {
      await api.deletePhoto(id, deletePhotoName);
      setPhotos((prev) => prev.filter((p) => p !== deletePhotoName));
      setDeletePhotoName(null);
      toast.success("Фото удалено");
    } catch (e: any) { toast.error(e.message || "Ошибка"); }
    finally { setDeletingPhoto(false); }
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><Skeleton className="h-96 rounded-xl" /></div>;
  }
  if (!data) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center"><p className="text-muted-foreground">Человек не найден</p></div>;
  }

  const usedIds = [id, fatherId, motherId, ...spouses.map((s) => s.id), ...children.map((c) => c.id)].filter(Boolean) as number[];

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
          {dirty && <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-600">Не сохранено</Badge>}
        </h1>
        <Link href={`/person?id=${id}`}>
          <Button variant="outline" size="sm" className="gap-2"><Eye className="h-4 w-4" /> Просмотр</Button>
        </Link>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="w-full">
          <TabsTrigger value="info" className="flex-1">Информация</TabsTrigger>
          <TabsTrigger value="relations" className="flex-1">Связи</TabsTrigger>
          <TabsTrigger value="photos" className="flex-1">Фото</TabsTrigger>
          <TabsTrigger value="bio" className="flex-1">Биография</TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="mt-4">
          <Card className="glass">
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="field-lastName">Фамилия</Label>
                  <Input id="field-lastName" value={form.lastName} onChange={(e) => updateForm({ lastName: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="field-firstName">Имя</Label>
                  <Input id="field-firstName" value={form.firstName} onChange={(e) => updateForm({ firstName: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="field-sex">Пол</Label>
                <Select value={form.sex} onValueChange={(v) => updateForm({ sex: v })}>
                  <SelectTrigger id="field-sex"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Мужской</SelectItem>
                    <SelectItem value="0">Женский</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="field-birthDay">Дата рождения (ДД.ММ.ГГГГ)</Label>
                  <Input id="field-birthDay" value={form.birthDay} onChange={(e) => updateForm({ birthDay: e.target.value })} placeholder="01.01.1990" />
                </div>
                <div>
                  <Label htmlFor="field-birthPlace">Место рождения</Label>
                  <Input id="field-birthPlace" value={form.birthPlace} onChange={(e) => updateForm({ birthPlace: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="field-deathDay">Дата смерти</Label>
                  <Input id="field-deathDay" value={form.deathDay} onChange={(e) => updateForm({ deathDay: e.target.value })} placeholder="Пусто = жив" />
                </div>
                <div>
                  <Label htmlFor="field-deathPlace">Место смерти</Label>
                  <Input id="field-deathPlace" value={form.deathPlace} onChange={(e) => updateForm({ deathPlace: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="field-address">Адрес</Label>
                <Input id="field-address" value={form.address} onChange={(e) => updateForm({ address: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="field-marryDay">Дата свадьбы</Label>
                <Input id="field-marryDay" value={form.marryDay} onChange={(e) => updateForm({ marryDay: e.target.value })} placeholder="ДД.ММ.ГГГГ" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="field-orderByDad">Порядок (отец)</Label>
                  <Input id="field-orderByDad" type="number" value={form.orderByDad} onChange={(e) => updateForm({ orderByDad: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="field-orderByMom">Порядок (мать)</Label>
                  <Input id="field-orderByMom" type="number" value={form.orderByMom} onChange={(e) => updateForm({ orderByMom: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="field-orderBySpouse">Порядок (супруг)</Label>
                  <Input id="field-orderBySpouse" type="number" value={form.orderBySpouse} onChange={(e) => updateForm({ orderBySpouse: e.target.value })} />
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
          <Card className="glass">
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
          <Card className="glass">
            <CardHeader><CardTitle className="text-base">Супруги</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {spouses.map((s) => (
                <div key={s.id} className="flex items-center gap-2 p-2 border rounded-md">
                  <span className="flex-1 text-sm">{s.lastName} {s.firstName} (ID: {s.id})</span>
                  <Button variant="ghost" size="icon" onClick={() => setRemoveSpouseId(s.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <div>
                <Label>Добавить супруга</Label>
                <PersonSearchSelect onChange={handleAddSpouse} placeholder="Поиск..." excludeIds={usedIds} disabled={addingSpouse} />
              </div>
            </CardContent>
          </Card>

          {/* Children */}
          <Card className="glass">
            <CardHeader><CardTitle className="text-base">Дети</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {children.map((c) => (
                <div key={c.id} className="flex items-center gap-2 p-2 border rounded-md">
                  <span className="flex-1 text-sm">{c.lastName} {c.firstName} (ID: {c.id})</span>
                  <Button variant="ghost" size="icon" onClick={() => setRemoveChildId(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <div>
                <Label>Добавить ребёнка</Label>
                <PersonSearchSelect onChange={handleAddChild} placeholder="Поиск..." excludeIds={usedIds} disabled={addingChild} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="mt-4">
          <Card className="glass">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Фотографии ({photos.length})</CardTitle>
              <Button size="sm" className="gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> {uploading ? "Загрузка..." : "Загрузить"}
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
                        <SafeImage src={mediaUrl(photo)} alt="" className="w-full h-full object-cover" loading="lazy" />
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
          <Card className="glass">
            <CardHeader><CardTitle className="text-base">Биография</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={bio}
                onChange={(e) => { setBio(e.target.value); setDirty(true); }}
                rows={12}
                placeholder="Текст биографии..."
              />
              <div className="flex justify-end">
                <Button onClick={handleSaveBio} disabled={savingBio} className="gap-2">
                  <Save className="h-4 w-4" /> {savingBio ? "Сохранение..." : "Сохранить биографию"}
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
            <AlertDialogAction onClick={handleDeletePhoto} disabled={deletingPhoto} className="bg-destructive text-destructive-foreground">{deletingPhoto ? "Удаление..." : "Удалить"}</AlertDialogAction>
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
            <AlertDialogAction onClick={handleRemoveSpouse} disabled={removingSpouse} className="bg-destructive text-destructive-foreground">{removingSpouse ? "Удаление..." : "Убрать"}</AlertDialogAction>
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
            <AlertDialogAction onClick={handleRemoveChild} disabled={removingChild} className="bg-destructive text-destructive-foreground">{removingChild ? "Удаление..." : "Убрать"}</AlertDialogAction>
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

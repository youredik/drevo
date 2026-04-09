"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { api, PersonFormData } from "@/lib/api";
import { toast } from "sonner";

export type AddMode = "spouse" | "son" | "daughter" | "father" | "mother";

interface AddPersonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: AddMode;
  /** The person from whose page "Add" was triggered. */
  currentPersonId: number;
  currentPersonSex: 0 | 1;
  currentPersonLastName: string;
  /** Spouse IDs of the current person (used to auto-fill the second parent). */
  currentPersonSpouseIds: number[];
  onCreated: (newPersonId: number) => void;
}

export function AddPersonModal({
  open,
  onOpenChange,
  mode,
  currentPersonId,
  currentPersonSex,
  currentPersonLastName,
  currentPersonSpouseIds,
  onCreated,
}: AddPersonModalProps) {
  // Determine auto-fill values based on mode
  const isChild = mode === "son" || mode === "daughter";
  const isParent = mode === "father" || mode === "mother";
  const autoSex: 0 | 1 =
    mode === "son" || mode === "father" ? 1
    : mode === "daughter" || mode === "mother" ? 0
    : currentPersonSex === 1 ? 0 : 1;

  // Auto-fill parents for children
  let autoFatherId = 0;
  let autoMotherId = 0;
  if (isChild) {
    if (currentPersonSex === 1) {
      autoFatherId = currentPersonId;
      autoMotherId = currentPersonSpouseIds.length === 1 ? currentPersonSpouseIds[0] : 0;
    } else {
      autoMotherId = currentPersonId;
      autoFatherId = currentPersonSpouseIds.length === 1 ? currentPersonSpouseIds[0] : 0;
    }
  }

  const [form, setForm] = useState({
    lastName: isChild || isParent ? currentPersonLastName : "",
    firstName: "",
    sex: String(autoSex),
    birthDay: "",
    birthPlace: "",
    address: "",
    deathDay: "",
    deathPlace: "",
    marryDay: "",
    fatherId: String(autoFatherId || ""),
    motherId: String(autoMotherId || ""),
  });

  const [saving, setSaving] = useState(false);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const title =
    mode === "spouse"
      ? currentPersonSex === 1 ? "Добавить жену" : "Добавить мужа"
      : mode === "son" ? "Добавить сына"
      : mode === "daughter" ? "Добавить дочь"
      : mode === "father" ? "Добавить отца"
      : "Добавить мать";

  async function handleSave() {
    if (!form.firstName.trim() && !form.lastName.trim()) {
      toast.error("Укажите имя или фамилию");
      return;
    }
    setSaving(true);
    try {
      // 1. Backup the database
      await api.backup();

      // 2. Create the person
      const personData: PersonFormData = {
        sex: Number(form.sex) as 0 | 1,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        birthDay: form.birthDay.trim(),
        birthPlace: form.birthPlace.trim(),
        address: form.address.trim(),
        deathDay: form.deathDay.trim(),
        deathPlace: form.deathPlace.trim(),
        marryDay: form.marryDay.trim(),
        fatherId: Number(form.fatherId) || undefined,
        motherId: Number(form.motherId) || undefined,
      };

      const result = await api.createPerson(personData);
      const newId = result.person.id;

      // 3. Set up relationships
      if (mode === "spouse") {
        await api.addSpouse(currentPersonId, newId);
      } else if (isParent) {
        // Set the new person as father or mother of the current person
        const newFatherId = mode === "father" ? newId : 0;
        const newMotherId = mode === "mother" ? newId : 0;
        await api.setParents(currentPersonId, newFatherId, newMotherId);
      }
      // For children, parent relationships are already set via fatherId/motherId
      // in createPerson, and the backend adds childRelations automatically.

      toast.success(`Персона #${newId} создана`);
      onCreated(newId);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Row: Sex */}
          <div>
            <Label>Пол</Label>
            <div className="flex gap-3 mt-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="sex"
                  value="1"
                  checked={form.sex === "1"}
                  onChange={() => update("sex", "1")}
                  className="accent-blue-500"
                />
                <span className="text-sm">Муж.</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="sex"
                  value="0"
                  checked={form.sex === "0"}
                  onChange={() => update("sex", "0")}
                  className="accent-pink-500"
                />
                <span className="text-sm">Жен.</span>
              </label>
            </div>
          </div>

          {/* Row: Last Name + First Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Фамилия</Label>
              <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
            </div>
            <div>
              <Label>Имя</Label>
              <Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
            </div>
          </div>

          {/* Row: Birth date + place */}
          <div>
            <Label>Дата и место рождения</Label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <Input placeholder="ДД.ММ.ГГГГ" value={form.birthDay} onChange={(e) => update("birthDay", e.target.value)} />
              <Input placeholder="Место рождения" value={form.birthPlace} onChange={(e) => update("birthPlace", e.target.value)} />
            </div>
          </div>

          {/* Row: Address */}
          <div>
            <Label>Адрес проживания</Label>
            <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
          </div>

          {/* Row: Death date + place */}
          <div>
            <Label>Дата и место кончины</Label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <Input placeholder="ДД.ММ.ГГГГ" value={form.deathDay} onChange={(e) => update("deathDay", e.target.value)} />
              <Input placeholder="Место кончины" value={form.deathPlace} onChange={(e) => update("deathPlace", e.target.value)} />
            </div>
          </div>

          {/* Row: Wedding date (spouse only) */}
          {mode === "spouse" && (
            <div>
              <Label>Свадьба / Никах</Label>
              <Input placeholder="ДД.ММ.ГГГГ" value={form.marryDay} onChange={(e) => update("marryDay", e.target.value)} />
            </div>
          )}

          {/* Row: Parents (for children) */}
          {isChild && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Папа (ID)</Label>
                <Input value={form.fatherId} onChange={(e) => update("fatherId", e.target.value)} />
              </div>
              <div>
                <Label>Мама (ID)</Label>
                <Input value={form.motherId} onChange={(e) => update("motherId", e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

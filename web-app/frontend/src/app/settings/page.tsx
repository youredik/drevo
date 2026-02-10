"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Download, Upload, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import { useAuth } from "@/lib/auth-context";
import { api, AppConfig, ValidationIssue } from "@/lib/api";

export default function SettingsPage() {
  const { isAdmin, canEdit, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  // Config
  const [config, setConfig] = useState({
    appName: "", appDescription: "", telegramLink: "",
    defaultEventDays: "5", defaultStartPage: "home",
    aboutText: "", infoText: "", dataCollectionDate: "",
  });

  // Validation
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ issues: ValidationIssue[]; counts: Record<string, number> } | null>(null);

  // Import
  const [importConfirm, setImportConfirm] = useState(false);
  const [importCsv, setImportCsv] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) { router.push("/"); return; }
    api.getConfig()
      .then((d) => {
        const c = d.config;
        setConfig({
          appName: c.appName || "", appDescription: c.appDescription || "",
          telegramLink: c.telegramLink || "", defaultEventDays: String(c.defaultEventDays || 5),
          defaultStartPage: c.defaultStartPage || "home", aboutText: c.aboutText || "",
          infoText: c.infoText || "", dataCollectionDate: c.dataCollectionDate || "",
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAdmin, authLoading]);

  function showMsg(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleSaveConfig() {
    try {
      await api.saveConfig({ ...config, defaultEventDays: Number(config.defaultEventDays), defaultStartPage: config.defaultStartPage as AppConfig["defaultStartPage"] });
      showMsg("Настройки сохранены");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  async function handleExport() {
    try {
      const csv = await api.exportCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fam.csv";
      a.click();
      URL.revokeObjectURL(url);
      showMsg("CSV экспортирован");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  async function handleExportGedcom() {
    try {
      const gedcom = await api.exportGedcom();
      const blob = new Blob([gedcom], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "drevo-export.ged";
      a.click();
      URL.revokeObjectURL(url);
      showMsg("GEDCOM экспортирован");
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  async function handleImport() {
    try {
      const result = await api.importCsv(importCsv);
      setImportConfirm(false);
      setImportCsv("");
      showMsg(`Импортировано: ${result.count} записей`);
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportCsv(reader.result as string);
      setImportConfirm(true);
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleValidate() {
    setValidating(true);
    try {
      const result = await api.validate();
      setValidation(result);
    } catch (e: any) { showMsg("Ошибка: " + e.message); }
    setValidating(false);
  }

  if (authLoading || loading) return <div className="max-w-4xl mx-auto px-4 py-8"><Skeleton className="h-96 rounded-xl" /></div>;
  if (!isAdmin) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {message && (
        <div className={`px-4 py-2 rounded-lg text-sm ${message.startsWith("Ошибка") ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-700 dark:text-green-400"}`}>
          {message}
        </div>
      )}

      {/* Config */}
      <Card>
        <CardHeader><CardTitle>Настройки приложения</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Название приложения</Label><Input value={config.appName} onChange={(e) => setConfig({ ...config, appName: e.target.value })} /></div>
            <div><Label>Ссылка на Telegram</Label><Input value={config.telegramLink} onChange={(e) => setConfig({ ...config, telegramLink: e.target.value })} /></div>
          </div>
          <div><Label>Описание</Label><Textarea value={config.appDescription} onChange={(e) => setConfig({ ...config, appDescription: e.target.value })} rows={2} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Дни для событий (по умолчанию)</Label><Input type="number" value={config.defaultEventDays} onChange={(e) => setConfig({ ...config, defaultEventDays: e.target.value })} /></div>
            <div><Label>Дата сбора данных</Label><Input value={config.dataCollectionDate} onChange={(e) => setConfig({ ...config, dataCollectionDate: e.target.value })} placeholder="ДД.ММ.ГГГГ" /></div>
          </div>
          <div><Label>Текст «О приложении»</Label><Textarea value={config.aboutText} onChange={(e) => setConfig({ ...config, aboutText: e.target.value })} rows={4} /></div>
          <div><Label>Информационный текст</Label><Textarea value={config.infoText} onChange={(e) => setConfig({ ...config, infoText: e.target.value })} rows={4} /></div>
          <div className="flex justify-end">
            <Button onClick={handleSaveConfig} className="gap-2"><Save className="h-4 w-4" /> Сохранить настройки</Button>
          </div>
        </CardContent>
      </Card>

      {/* Import/Export */}
      <Card>
        <CardHeader><CardTitle>Импорт / Экспорт</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" /> Экспорт CSV
            </Button>
            <Button variant="outline" onClick={handleExportGedcom} className="gap-2">
              <Download className="h-4 w-4" /> Экспорт GEDCOM
            </Button>
            <div className="relative">
              <Button variant="outline" className="gap-2" onClick={() => document.getElementById("csv-import")?.click()}>
                <Upload className="h-4 w-4" /> Импорт CSV
              </Button>
              <input id="csv-import" type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Валидация данных</CardTitle>
          <Button variant="outline" onClick={handleValidate} disabled={validating} className="gap-2">
            {validating ? "Проверка..." : <><AlertTriangle className="h-4 w-4" /> Проверить</>}
          </Button>
        </CardHeader>
        <CardContent>
          {validation ? (
            <>
              {validation.issues.length === 0 ? (
                <div className="flex items-center gap-2 text-green-600 py-4">
                  <CheckCircle className="h-5 w-5" /> Проблем не найдено!
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(validation.counts).map(([type, count]) => (
                      <Badge key={type} variant="secondary">{type}: {count}</Badge>
                    ))}
                  </div>
                  <div className="rounded-md border max-h-96 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-32">Тип</TableHead>
                          <TableHead className="w-20">ID</TableHead>
                          <TableHead>Описание</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validation.issues.slice(0, 100).map((issue, i) => (
                          <TableRow key={i}>
                            <TableCell><Badge variant="outline" className="text-xs">{issue.type}</Badge></TableCell>
                            <TableCell className="font-mono">{issue.personId}</TableCell>
                            <TableCell className="text-sm">{issue.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {validation.issues.length > 100 && (
                    <p className="text-sm text-muted-foreground mt-2">Показано 100 из {validation.issues.length}</p>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm py-4">Нажмите «Проверить» для запуска валидации</p>
          )}
        </CardContent>
      </Card>

      {/* Import confirmation */}
      <AlertDialog open={importConfirm} onOpenChange={setImportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Импорт CSV</AlertDialogTitle>
            <AlertDialogDescription>
              Это заменит все текущие данные. Убедитесь, что у вас есть резервная копия. Продолжить?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport}>Импортировать</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { api, mediaUrl } from "@/lib/api";

interface Props {
  value?: number;
  onChange: (id: number | undefined) => void;
  placeholder?: string;
  excludeIds?: number[];
}

export function PersonSearchSelect({ value, onChange, placeholder = "Поиск человека...", excludeIds = [] }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && !selected) {
      api.getPerson(value).then((d) => setSelected({ id: d.person.id, firstName: d.person.firstName, lastName: d.person.lastName })).catch(() => {});
    }
  }, [value, selected]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.search(query).then((d) => {
        setResults(d.results.filter((r: any) => !excludeIds.includes(r.id)));
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query, excludeIds]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (person: any) => {
    setSelected(person);
    onChange(person.id);
    setQuery("");
    setOpen(false);
  };

  const handleClear = () => {
    setSelected(null);
    onChange(undefined);
    setQuery("");
  };

  return (
    <div ref={ref} className="relative">
      {selected ? (
        <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50">
          <span className="text-sm flex-1">{selected.lastName} {selected.firstName} (ID: {selected.id})</span>
          <button onClick={handleClear} className="text-muted-foreground hover:text-foreground text-sm">&times;</button>
        </div>
      ) : (
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder={placeholder}
        />
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
          {results.slice(0, 10).map((r) => (
            <button
              key={r.id}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left text-sm"
              onClick={() => handleSelect(r)}
            >
              <span className="font-medium">{r.lastName} {r.firstName}</span>
              <span className="text-muted-foreground">ID: {r.id}</span>
              {r.birthDay && <span className="text-muted-foreground">{r.birthDay}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

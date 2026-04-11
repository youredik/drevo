"use client";

import useSWR from "swr";
import { api, PersonCard, StatsData, EventItem, SearchResult, KinshipResult, TreeNode } from "./api";
import { useData } from "./data-context";
import { useMemo } from "react";

// SWR config defaults
const defaultConfig = {
  revalidateOnFocus: false,
  revalidateIfStale: true,
  dedupingInterval: 30000, // 30s dedup
};

// ─── Local-first hooks: use client repo if available, fallback to API ──

export function usePerson(id: number | null) {
  const { repo } = useData();
  const local = useMemo(() => {
    if (!repo || !id) return undefined;
    return repo.getPersonCard(id) ?? undefined;
  }, [repo, id]);

  const swr = useSWR<PersonCard>(
    id && !local ? `person-${id}` : null,
    () => api.getPerson(id!),
    defaultConfig
  );

  return local ? { data: local, error: undefined, isLoading: false, mutate: swr.mutate } : swr;
}

export function useStats() {
  const { repo } = useData();
  const local = useMemo(() => repo?.getStats(), [repo]);

  const swr = useSWR<StatsData>(
    !local ? "stats" : null,
    () => api.getStats(),
    { ...defaultConfig, revalidateIfStale: false }
  );

  return local ? { data: local, error: undefined, isLoading: false, mutate: swr.mutate } : swr;
}

export function useEvents(days: number | null = 5, yesterday = true) {
  const { repo } = useData();
  const local = useMemo(() => {
    if (!repo || days === null) return undefined;
    return repo.getEvents(days, yesterday);
  }, [repo, days, yesterday]);

  const swr = useSWR<{ events: EventItem[]; count: number }>(
    days !== null && !local ? `events-${days}-${yesterday}` : null,
    () => api.getEvents(days!, yesterday),
    defaultConfig
  );

  return local ? { data: local, error: undefined, isLoading: false, mutate: swr.mutate } : swr;
}

export function useSearch(query: string) {
  const { repo } = useData();
  const trimmed = query.trim();
  const local = useMemo(() => {
    if (!repo || trimmed.length < 2) return undefined;
    return repo.search(trimmed);
  }, [repo, trimmed]);

  const swr = useSWR<{ results: SearchResult[]; count: number }>(
    trimmed.length >= 2 && !local ? `search-${trimmed}` : null,
    () => api.search(trimmed),
    { ...defaultConfig, dedupingInterval: 5000 }
  );

  return local ? { data: local, error: undefined, isLoading: false, mutate: swr.mutate } : swr;
}

export function useTree(id: number | null, type: "ancestors" | "descendants" = "ancestors") {
  const { repo } = useData();
  const local = useMemo(() => {
    if (!repo || !id) return undefined;
    return (type === "descendants" ? repo.getDescendantTree(id) : repo.getAncestorTree(id)) ?? undefined;
  }, [repo, id, type]);

  const swr = useSWR<TreeNode>(
    id && !local ? `tree-${id}-${type}` : null,
    () => api.getTree(id!, type),
    defaultConfig
  );

  return local ? { data: local, error: undefined, isLoading: false, mutate: swr.mutate } : swr;
}

export function useKinship(id1: number | null, id2: number | null) {
  const { repo } = useData();
  const local = useMemo(() => {
    if (!repo || !id1 || !id2) return undefined;
    return repo.checkKinship(id1, id2) ?? undefined;
  }, [repo, id1, id2]);

  const swr = useSWR<KinshipResult>(
    id1 && id2 && !local ? `kinship-${id1}-${id2}` : null,
    () => api.getKinship(id1!, id2!),
    defaultConfig
  );

  return local ? { data: local, error: undefined, isLoading: false, mutate: swr.mutate } : swr;
}

export function useFavorites() {
  const { repo } = useData();
  const local = useMemo(() => {
    if (!repo) return undefined;
    return { favorites: repo.getFavoriteCards() };
  }, [repo]);

  const swr = useSWR(
    !local ? "favorites" : null,
    () => api.getFavorites(),
    defaultConfig
  );

  return local ? { data: local, error: undefined, isLoading: false, mutate: swr.mutate } : swr;
}

export function useCheckFavorite(personId: number | null) {
  const { repo } = useData();
  const local = useMemo(() => {
    if (!repo || !personId) return undefined;
    return { isFavorite: repo.isFavorite(personId) };
  }, [repo, personId]);

  const swr = useSWR<{ isFavorite: boolean }>(
    personId && !local ? `fav-check-${personId}` : null,
    () => api.checkFavorite(personId!),
    defaultConfig
  );

  return local ? { data: local, error: undefined, isLoading: false, mutate: swr.mutate } : swr;
}

// ─── These always use API (no local equivalent) ──────

export function useBio(id: number | null, hasBio: boolean) {
  return useSWR<{ text: string }>(
    id && hasBio ? `bio-${id}` : null,
    () => api.getBio(id!),
    { ...defaultConfig, revalidateIfStale: false }
  );
}

export function useInfo() {
  return useSWR(
    "info",
    () => api.getInfo(),
    { ...defaultConfig, revalidateIfStale: false }
  );
}

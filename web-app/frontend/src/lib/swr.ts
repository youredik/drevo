"use client";

import useSWR from "swr";
import { api, PersonCard, StatsData, EventItem, SearchResult, KinshipResult, TreeNode } from "./api";

// SWR config defaults
const defaultConfig = {
  revalidateOnFocus: false,
  revalidateIfStale: true,
  dedupingInterval: 30000, // 30s dedup
};

export function usePerson(id: number | null) {
  return useSWR<PersonCard>(
    id ? `person-${id}` : null,
    () => api.getPerson(id!),
    { ...defaultConfig, revalidateOnFocus: false }
  );
}

export function useStats() {
  return useSWR<StatsData>(
    "stats",
    () => api.getStats(),
    { ...defaultConfig, revalidateIfStale: false }
  );
}

export function useEvents(days: number | null = 5, yesterday = true) {
  return useSWR<{ events: EventItem[]; count: number }>(
    days !== null ? `events-${days}-${yesterday}` : null,
    () => api.getEvents(days!, yesterday),
    defaultConfig
  );
}

export function useSearch(query: string) {
  return useSWR<{ results: SearchResult[]; count: number }>(
    query.trim().length >= 2 ? `search-${query.trim()}` : null,
    () => api.search(query.trim()),
    { ...defaultConfig, dedupingInterval: 5000 }
  );
}

export function useTree(id: number | null, type: "ancestors" | "descendants" = "ancestors") {
  return useSWR<TreeNode>(
    id ? `tree-${id}-${type}` : null,
    () => api.getTree(id!, type),
    { ...defaultConfig, revalidateIfStale: false }
  );
}

export function useKinship(id1: number | null, id2: number | null) {
  return useSWR<KinshipResult>(
    id1 && id2 ? `kinship-${id1}-${id2}` : null,
    () => api.getKinship(id1!, id2!),
    defaultConfig
  );
}

export function useFavorites() {
  return useSWR(
    "favorites",
    () => api.getFavorites(),
    defaultConfig
  );
}

export function useCheckFavorite(personId: number | null) {
  return useSWR<{ isFavorite: boolean }>(
    personId ? `fav-check-${personId}` : null,
    () => api.checkFavorite(personId!),
    defaultConfig
  );
}

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

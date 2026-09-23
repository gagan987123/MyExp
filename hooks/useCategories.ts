import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import {
  DEFAULT_CATEGORIES,
  getCategories,
  type CategoryEntry,
} from "@/lib/service";

/** Combined built-in + custom categories, refreshed on every visit. */
export function useCategories(): CategoryEntry[] {
  const db = useSQLiteContext();
  const [categories, setCategories] =
    useState<CategoryEntry[]>(DEFAULT_CATEGORIES);

  const load = useCallback(async () => {
    try {
      setCategories(await getCategories(db));
    } catch {
      setCategories(DEFAULT_CATEGORIES);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return categories;
}

export function findCategory(
  categories: CategoryEntry[],
  id: string
): CategoryEntry {
  return (
    categories.find((c) => c.id === id) ?? {
      id,
      name: id,
      icon: "dots-horizontal",
      kind: "expense",
      builtin: false,
    }
  );
}

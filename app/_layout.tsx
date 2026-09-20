import "@/global.css";
import { Stack, useRouter } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import * as Linking from "expo-linking";
import { Suspense, useEffect } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DATABASE_NAME, migrateDbIfNeeded } from "@/lib/db";

function DbLoadingFallback() {
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff9e3" }}
    >
      <Text style={{ fontSize: 24, fontWeight: "bold", color: "#081126" }}>
        MyExp
      </Text>
      <Text style={{ marginTop: 8, color: "rgba(0,0,0,0.6)" }}>
        Opening your expense database…
      </Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Suspense fallback={<DbLoadingFallback />}>
        <SQLiteProvider
          databaseName={DATABASE_NAME}
          onInit={migrateDbIfNeeded}
          useSuspense
        >
          <DeepLinkHandler />
          <Stack screenOptions={{ headerShown: false }} />
        </SQLiteProvider>
      </Suspense>
    </SafeAreaProvider>
  );
}

/**
 * Siri / Shortcuts intake can arrive as expensetracker://add-expense?...,
 * where the route sits in the URL host position. This handler routes it
 * explicitly so saving never depends on implicit link-to-route matching.
 */
function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      if (!url) return;
      try {
        const parsed = Linking.parse(url);
        const first = `${parsed.hostname ?? ""}/${parsed.path ?? ""}`
          .split("/")
          .filter(Boolean)[0];
        if (first === "add-expense") {
          router.push({
            pathname: "/(tabs)/add-expense",
            params: (parsed.queryParams ?? {}) as Record<string, string>,
          });
        }
      } catch {
        // Malformed URL: stay where we are.
      }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (event) => handle(event.url));
    return () => sub.remove();
  }, [router]);

  return null;
}

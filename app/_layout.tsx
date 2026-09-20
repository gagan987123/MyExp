import "@/global.css";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { Suspense, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  DATABASE_NAME,
  migrateDbIfNeeded,
  resolveDatabaseDirectory,
} from "@/lib/db";

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
  // Resolve the shared App Group folder (if entitled) and migrate the
  // sandbox database over on first run — before SQLiteProvider opens it.
  const [dbDirectory, setDbDirectory] = useState<string | undefined>(undefined);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    resolveDatabaseDirectory()
      .then(setDbDirectory)
      .catch(() => setDbDirectory(undefined))
      .finally(() => setDbReady(true));
  }, []);

  if (!dbReady) return <DbLoadingFallback />;

  return (
    <SafeAreaProvider>
      <Suspense fallback={<DbLoadingFallback />}>
        <SQLiteProvider
          databaseName={DATABASE_NAME}
          directory={dbDirectory}
          onInit={migrateDbIfNeeded}
          useSuspense
        >
          <Stack screenOptions={{ headerShown: false }} />
        </SQLiteProvider>
      </Suspense>
    </SafeAreaProvider>
  );
}

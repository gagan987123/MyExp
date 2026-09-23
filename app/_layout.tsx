import "@/global.css";
import {
  SpaceGrotesk_300Light,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import * as SplashScreen from "expo-splash-screen";
import { Suspense, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  DATABASE_NAME,
  migrateDbIfNeeded,
  resolveDatabaseDirectory,
} from "@/lib/db";

SplashScreen.preventAutoHideAsync().catch(() => {});

function DbLoadingFallback() {
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B0E17" }}
    >
      <Text style={{ fontSize: 24, fontWeight: "bold", color: "#F4F1EA" }}>
        MyExp
      </Text>
      <Text style={{ marginTop: 8, color: "rgba(244,241,234,0.6)" }}>
        Opening your expense database…
      </Text>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_300Light,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
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

  useEffect(() => {
    if (fontsLoaded && dbReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, dbReady]);

  if (!dbReady || !fontsLoaded) return <DbLoadingFallback />;

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

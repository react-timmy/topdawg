import React, { useEffect } from "react";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NotificationProvider } from "./src/context/NotificationContext";
import { ProProvider } from "./src/context/ProContext";
import { AccountProvider } from "./src/context/AccountContext";
import { CastProvider } from "./src/context/CastContext";
import { WatchPartyProvider } from "./src/context/WatchPartyContext";
import { CollectionsProvider } from "./src/context/CollectionsContext";
import { setupNotificationTapHandler } from "./src/services/notificationService";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { navigationRef } from "./src/navigation/navigationRef";
import "./global.css";

const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#0a0a0a",
    card: "#0a0a0a",
    border: "rgba(255,255,255,0.1)",
  },
};

export default function App() {
  // ── Notifications ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = setupNotificationTapHandler();
    return unsub;
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ backgroundColor: "#0a0a0a" }}>
        <StatusBar style="light" />
        <NotificationProvider>
          <AccountProvider>
            <CastProvider>
              <WatchPartyProvider>
                <ProProvider>
                  <CollectionsProvider>
                    {/*
                      NavigationContainer handles our routing.
                      We no longer reset navigation on resume, so users stay where they were unless they cold-boot the app.
                    */}
                    <NavigationContainer
                      ref={navigationRef}
                      theme={AppTheme}
                    >
                      <RootNavigator />
                    </NavigationContainer>
                  </CollectionsProvider>
                </ProProvider>
              </WatchPartyProvider>
            </CastProvider>
          </AccountProvider>
        </NotificationProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

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
  // ── Notifications & System Bar ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = setupNotificationTapHandler();
    import('expo-navigation-bar').then(NavigationBar => {
      NavigationBar.setBackgroundColorAsync('#0a0a0a').catch(() => {});
    }).catch(() => {});
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
                      <NavigationBarBackground />
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

  import { useSafeAreaInsets } from "react-native-safe-area-context";
  import { View } from "react-native";

  function NavigationBarBackground() {
    const insets = useSafeAreaInsets();
    if (insets.bottom === 0) return null;
    return (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: insets.bottom,
          backgroundColor: "#0a0a0a",
          zIndex: 9999,
        }}
      />
    );
  }

import React, { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NotificationProvider } from "./src/context/NotificationContext";
import { ProProvider } from "./src/context/ProContext";
import { BadgeUnlockProvider } from "./src/context/BadgeUnlockContext";
import { AccountProvider } from "./src/context/AccountContext";
import { BadgeUnlockOverlay } from "./src/components/BadgeUnlockOverlay";
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
  // ── Nav reset on every foreground resume ───────────────────────────────────
  // Each time the app comes to the foreground from background (or cold opens),
  // we bump this counter which remounts NavigationContainer, resetting the
  // stack back to ProfilePicker automatically via initialRouteName.
  // Exception: native system pickers (DocumentPicker, ImagePicker, etc.) also
  // background the app temporarily — we skip the reset for those returns.
  const [navKey, setNavKey] = useState(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const isFirstMount = useRef(true);
  // True while a native picker/permission sheet is open.
  const pickerOpenRef = useRef(false);
  // After the picker promise settles, AppState "active" often fires a moment
  // later. Keep a short grace window so we still skip the ProfilePicker reset.
  const pickerGraceUntilRef = useRef(0);

  // Scanner (and any other picker) calls this around DocumentPicker / MediaLibrary.
  // true  → picker opening
  // false → picker closed (start grace for late AppState events)
  (globalThis as any).__setPickerActive = (val: boolean) => {
    if (val) {
      pickerOpenRef.current = true;
      pickerGraceUntilRef.current = 0;
    } else {
      pickerOpenRef.current = false;
      // Cover the common race: promise resolves → flag clear → then "active"
      pickerGraceUntilRef.current = Date.now() + 4000;
    }
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const wasBackground =
        appState.current === "background" || appState.current === "inactive";
      const isNowActive = nextState === "active";

      if (wasBackground && isNowActive && !isFirstMount.current) {
        const fromPicker =
          pickerOpenRef.current || Date.now() < pickerGraceUntilRef.current;

        if (fromPicker) {
          // Still in picker: keep flag. After close: consume grace once.
          if (!pickerOpenRef.current) {
            pickerGraceUntilRef.current = 0;
          }
        } else {
          // Genuine background→foreground (app switcher, notifications, etc.)
          setNavKey((k) => k + 1);
        }
      }

      if (isNowActive) {
        isFirstMount.current = false;
      }

      appState.current = nextState;
    });

    return () => sub.remove();
  }, []);

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
            <ProProvider>
              <BadgeUnlockProvider>
                {/*
                  key={navKey} remounts NavigationContainer on every foreground
                  resume, which resets the stack to ProfilePicker (initialRouteName).
                  Screens and providers are NOT remounted — only navigation state resets.
                */}
                <NavigationContainer
                  key={navKey}
                  ref={navigationRef}
                  theme={AppTheme}
                >
                  <RootNavigator />
                </NavigationContainer>
                <BadgeUnlockOverlay />
              </BadgeUnlockProvider>
            </ProProvider>
          </AccountProvider>
        </NotificationProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

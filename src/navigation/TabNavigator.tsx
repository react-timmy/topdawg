import React, { useEffect } from "react";
import { createBottomTabNavigator , BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  withSpring,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Film, Tv, BookOpen, User, FolderHeart, LucideIcon } from "lucide-react-native";

import { MoviesScreen } from "../screens/MoviesScreen";
import { TVScreen } from "../screens/TVScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ScannerScreen } from "../screens/ScannerScreen";

// ─── Tab config ───────────────────────────────────────────────────────────────

const TAB_CONFIG: Record<string, { icon: LucideIcon; label: string }> = {
  Movies: { icon: Film, label: "Movies" },
  TV: { icon: Tv, label: "TV Shows" },
  Library: { icon: BookOpen, label: "Library" },
  Profile: { icon: User, label: "You" },
};

// ─── Spring config ────────────────────────────────────────────────────────────

const SPRING_CONFIG = {
  duration: 280,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

// ─── Individual tab button ────────────────────────────────────────────────────

function TabButton({
  routeName,
  isFocused,
  onPress,
}: {
  routeName: string;
  isFocused: boolean;
  onPress: () => void;
}) {
  const { icon: Icon, label } = TAB_CONFIG[routeName] ?? {
    icon: Film,
    label: routeName,
  };

  const iconScale = useSharedValue(isFocused ? 1 : 0.85);
  const opacity = useSharedValue(isFocused ? 1 : 0.5);

  useEffect(() => {
    iconScale.value = withSpring(isFocused ? 1 : 0.85, {
      damping: 15,
      stiffness: 300,
      mass: 0.6,
    });
    opacity.value = withTiming(isFocused ? 1 : 0.5, SPRING_CONFIG);
  }, [isFocused]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: opacity.value,
  }));

  return (
    <Pressable onPress={onPress} style={styles.tab}>
      <Animated.View style={iconStyle}>
        <Icon
          size={27}
          color={isFocused ? "#ffffff" : "#71717a"}
          strokeWidth={isFocused ? 2.5 : 2}
        />
      </Animated.View>
      <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Custom bottom tab bar ────────────────────────────────────────────────────

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.outerWrapper, { paddingBottom: insets.bottom + 6 }]}
      pointerEvents="box-none"
    >
      <View style={styles.tabBarContainer}>
        {state.routes.map((route, index) => {
          if (!TAB_CONFIG[route.name]) return null;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (event.defaultPrevented) return;

            // If this TabNavigator is embedded (e.g., ScannerScreen), navigate the
            // parent navigator so the app's primary tabs switch. Fall back to local
            // navigation when no parent exists.
            const parentNav = navigation.getParent?.();
            if (!isFocused) {
              if (parentNav) {
                try {
                  // If the parent stack exposes the MainTabs screen, navigate to it
                  // and select the requested child tab there. This anchors embedded
                  // TabNavigator instances (e.g., in ScannerScreen) to the app's
                  // primary MainTabs navigator.
                  const parentState = (parentNav as any).getState?.();
                  const hasMainTabs = Array.isArray(parentState?.routeNames) && parentState.routeNames.includes('MainTabs');
                  if (hasMainTabs) {
                    (parentNav as any).navigate('MainTabs', { screen: route.name });
                  } else {
                    parentNav.navigate(route.name as never);
                  }
                } catch (e) {
                  // Fallback to local navigation if parent navigation fails
                  navigation.navigate(route.name as never);
                }
              } else {
                navigation.navigate(route.name as never);
              }
            }
          };

          return (
            <TabButton
              key={route.key}
              routeName={route.name}
              isFocused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── Navigator ────────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

export function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "#000000" },
        tabBarHideOnKeyboard: false,
        animation: "fade",
      }}
    >
      <Tab.Screen name="Movies"  component={MoviesScreen} />
      <Tab.Screen name="TV"      component={TVScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outerWrapper: {
    backgroundColor: "#141414",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  tabBarContainer: {
    flexDirection: "row",
    backgroundColor: "#141414",
    paddingTop: 12,
    paddingBottom: 2,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingBottom: 3,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: "#71717a",
  },
  tabLabelActive: {
    color: "#ffffff",
    fontWeight: "800",
  },
});

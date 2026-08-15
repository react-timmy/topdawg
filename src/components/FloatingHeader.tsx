import React from "react";
import { View, Text, StyleSheet, LayoutChangeEvent, Pressable } from "react-native";
import { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Search, Settings, User, ScanLine } from "lucide-react-native";
import { useNotifications } from "../context/NotificationContext";
import { useNavigation } from "@react-navigation/native";

interface FloatingHeaderProps {
  title: string;
  subtitle: string;
  scrollY?: SharedValue<number>;
  onHeightChange?: (height: number) => void;
  onSearchPress?: () => void;
  /** When provided a gear icon is shown that navigates to Settings */
  onSettingsPress?: () => void;
  /**
   * When true, renders the FilmSort "F" monogram to the left of the title,
   * styled after the Netflix logo. Only pass this on Movies and TV screens.
   */
  showLogo?: boolean;
  /**
   * When true, renders the profile icon button in the header actions.
   * Defaults to false — only pass on Library screen.
   */
  showProfile?: boolean;
}

// ─── FilmSortLogo ─────────────────────────────────────────────────────────────
/**
 * Netflix-style "F" logo — 3D red letterform with a bright diagonal stripe
 * cutting through it. No background — pure geometric assembly using absolute-
 * positioned views to build the "F" shape: left vertical bar, top bar, mid bar,
 * with a brighter diagonal highlight slicing through all three.
 */
export function FilmSortLogo() {
  return (
    <View style={logoStyles.wrap}>
      {/* Main F shape — darker base layer */}
      <View style={[logoStyles.rect, logoStyles.leftBar]} />
      <View style={[logoStyles.rect, logoStyles.topBar]} />
      <View style={[logoStyles.rect, logoStyles.midBar]} />
    </View>
  );
}

const logoStyles = StyleSheet.create({
  wrap: {
    position: 'relative',
    width: 28,
    height: 53,
    marginBottom: 2, // baseline-align with title text
  },
  rect: {
    position: 'absolute',
    backgroundColor: '#8c185c', // dark red (Netflix shadow tone)
  },
  // Left vertical bar
  leftBar: {
    left: 0,
    top: 0,
    width: 15,
    height: 63,
    borderBottomRightRadius: 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 15,
  },
  // Top horizontal bar
  topBar: {
    left: 10,
    top: 0,
    width: 25,
    height: 15,
    borderBottomLeftRadius: 22,
    borderTopRightRadius: 10,
  },
  // Mid horizontal bar (slightly shorter)
  midBar: {
    left: 15,
    top: 24,
    width: 17,
    height: 13,
    borderBottomLeftRadius: 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 15,
  },
  playIcon: {
position: 'absolute',
left:14,
top: 26,
width: 0, 
height: 0, 
backgroundColor: 'transparent',
borderStyle: 'solid', 
borderLeftWidth: 12,
borderRightWidth: 0,
borderBottomWidth: 8,
borderTopWidth: 8,
borderLeftColor: '#ffffff', 
borderRightColor: 'transparent',
borderTopColor: 'transparent',
borderBottomColor: 'transparent',
zIndex: 10,
},
  // Bright diagonal highlight (10deg tilt, overlayed on top)
  highlight: {
    position: 'absolute',
    left: 3,
    top: -4,
    width: 7,
    height: 50,
    backgroundColor: '#ef4444', // bright Netflix red
    transform: [{ rotate: '10deg' }],
  },
});

export function FloatingHeader({
  title,
  subtitle,
  onHeightChange,
  onSearchPress,
  onSettingsPress,
  showLogo = false,
  showProfile = false,
}: FloatingHeaderProps) {
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  const navigation = useNavigation<any>();

  const handleLayout = (e: LayoutChangeEvent) => {
    onHeightChange?.(e.nativeEvent.layout.height);
  };

  return (
    <View style={styles.root} onLayout={handleLayout}>
      <View style={styles.border} />
      <View style={[styles.content, { paddingTop: insets.top + 14 }]}>
        <View style={styles.row}>
          <View style={styles.titleGroup}>
            {showLogo && <FilmSortLogo />}
            <View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            {onSearchPress && (
              <Pressable style={styles.iconBtn} onPress={onSearchPress} hitSlop={10}>
                <Search size={19} color="#71717a" />
              </Pressable>
            )}
            <Pressable
              style={styles.iconBtn}
              onPress={() => navigation.navigate("Notifications")}
              hitSlop={10}
            >
              <Bell size={19} color={unreadCount > 0 ? "#facc15" : "#52525b"} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
                </View>
              )}
            </Pressable>
            {showProfile && (
              <Pressable
                style={styles.iconBtn}
                onPress={() => navigation.navigate("Profile")}
                hitSlop={10}
              >
                <User size={19} color="#71717a" />
              </Pressable>
            )}

            {onSettingsPress && (
              <Pressable style={styles.iconBtn} onPress={onSettingsPress} hitSlop={10}>
                <Settings size={19} color="#52525b" />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: "#000000",
  },
  border: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#ffffff",
  },
  subtitle: {
    fontSize: 11,
    color: "#52525b",
    marginTop: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 2,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanIconBtn: {
    backgroundColor: '#ffffff',
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
  },

  // ── Title + logo row ───────────────────────────────────────────────────────
  titleGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginRight: 12,
  },
});

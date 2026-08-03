/**
 * CastButton.tsx
 *
 * A single icon button that opens a bottom sheet to:
 *  - Show discovered Chromecast devices and connect/disconnect
 *  - Show an iOS AirPlay picker (native AVRoutePickerView)
 *  - Show current cast session status
 *
 * Designed to live in the VideoPlayerScreen controls overlay.
 *
 * Props:
 *  item            — current MediaItem being played
 *  currentPosition — current playhead in seconds (passed to castMedia on connect)
 *  size            — icon size (default 24)
 *  color           — icon color (default white)
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
  requireNativeComponent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Tv2,
  Cast,
  Wifi,
  WifiOff,
  X,
  Check,
  Bluetooth,
  Radio,
} from 'lucide-react-native';
import { useDevices, useCastState, CastState as GCastState } from 'react-native-google-cast';

import { useCast } from '../context/CastContext';
import { MediaItem, CastDevice } from '../types';

// ─── Native AirPlay picker (iOS only) ────────────────────────────────────────
// react-native-google-cast ships a thin RCTAirPlayButton on iOS.
// We try to require it and fall back to a no-op View if unavailable.
let AirPlayButton: React.ComponentType<{ style?: object }> | null = null;
if (Platform.OS === 'ios') {
  try {
    AirPlayButton = requireNativeComponent<{ style?: object }>('RCTAirPlayButton');
  } catch {
    // Module not available in current build — AirPlay section is hidden
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CastButtonProps {
  item: MediaItem;
  currentPosition?: number;
  size?: number;
  color?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BG = 'rgba(12,12,12,0.97)';
const SURFACE = '#1e1e1e';
const BORDER = '#2a2a2a';
const NF_RED = '#E50914';
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = '#8a8a8a';

// ─── Component ────────────────────────────────────────────────────────────────

export function CastButton({
  item,
  currentPosition = 0,
  size = 24,
  color = '#ffffff',
}: CastButtonProps) {
  const insets = useSafeAreaInsets();
  const { castState, castMedia, endSession } = useCast();
  const gCastState = useCastState();
  const rawDevices = useDevices();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null); // deviceId being connected

  const isConnected = castState.sessionState === 'connected';
  const isConnecting = castState.sessionState === 'connecting';

  // ── Map RNGC devices to our CastDevice type ───────────────────────────────
  const chromecastDevices: CastDevice[] = (rawDevices ?? []).map((d) => ({
    deviceId: d.deviceId,
    friendlyName: d.friendlyName,
    technology: 'chromecast' as const,
    modelName: (d as any).modelName,
  }));

  // ── Connect to a Chromecast device ────────────────────────────────────────
  const handleConnectDevice = useCallback(
    async (device: CastDevice) => {
      if (connecting) return;
      setConnecting(device.deviceId);
      try {
        // react-native-google-cast: obtain session manager and start session
        const { default: GoogleCast } = await import('react-native-google-cast');
        await GoogleCast.getCastContext().then((ctx: any) => ctx?.startDiscovery?.());
        const sessionManager = await GoogleCast.getSessionManager();
        await sessionManager.startSession(device.deviceId);
        // Cast current media at current position
        await castMedia(item, currentPosition);
        setSheetOpen(false);
      } catch (e) {
        // If connect fails, silently log — user can try again
        console.warn('[CastButton] connect failed:', e);
      } finally {
        setConnecting(null);
      }
    },
    [connecting, castMedia, item, currentPosition],
  );

  // ── Disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = useCallback(async () => {
    await endSession();
    setSheetOpen(false);
  }, [endSession]);

  // ── Icon color reflecting session state ───────────────────────────────────
  const iconColor = isConnected ? NF_RED : isConnecting ? '#f59e0b' : color;

  return (
    <>
      {/* Cast icon button */}
      <Pressable
        style={styles.iconBtn}
        onPress={() => setSheetOpen(true)}
        hitSlop={10}
        accessibilityLabel="Cast to TV"
        accessibilityRole="button"
      >
        {isConnected ? (
          <Tv2 size={size} color={iconColor} />
        ) : (
          <Cast size={size} color={iconColor} />
        )}
      </Pressable>

      {/* Bottom sheet */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setSheetOpen(false)}
        >
          {/* Stop tap-through */}
          <Pressable onPress={() => {}} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

            {/* Handle */}
            <View style={styles.handle} />

            {/* Title row */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Cast to Device</Text>
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={12}>
                <X size={20} color={TEXT_SECONDARY} />
              </Pressable>
            </View>

            {/* Active session banner */}
            {isConnected && castState.connectedDevice && (
              <View style={styles.activeBanner}>
                <View style={styles.activeBannerLeft}>
                  <Tv2 size={18} color={NF_RED} />
                  <View>
                    <Text style={styles.activeBannerTitle}>
                      Casting to {castState.connectedDevice.friendlyName}
                    </Text>
                    <Text style={styles.activeBannerSub}>
                      {castState.connectedDevice.technology === 'airplay' ? 'AirPlay' : 'Chromecast'}
                    </Text>
                  </View>
                </View>
                <Pressable style={styles.disconnectBtn} onPress={handleDisconnect}>
                  <Text style={styles.disconnectBtnText}>Stop</Text>
                </Pressable>
              </View>
            )}

            <ScrollView bounces={false} style={styles.deviceList}>
              {/* Chromecast section */}
              {chromecastDevices.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Chromecast</Text>
                  {chromecastDevices.map((device) => {
                    const isThisConnected =
                      isConnected && castState.connectedDevice?.deviceId === device.deviceId;
                    const isThisConnecting = connecting === device.deviceId;

                    return (
                      <Pressable
                        key={device.deviceId}
                        style={[styles.deviceRow, isThisConnected && styles.deviceRowActive]}
                        onPress={() =>
                          isThisConnected ? handleDisconnect() : handleConnectDevice(device)
                        }
                      >
                        <View style={styles.deviceIcon}>
                          <Tv2 size={20} color={isThisConnected ? NF_RED : TEXT_PRIMARY} />
                        </View>
                        <View style={styles.deviceInfo}>
                          <Text
                            style={[
                              styles.deviceName,
                              isThisConnected && { color: NF_RED },
                            ]}
                          >
                            {device.friendlyName}
                          </Text>
                          {device.modelName && (
                            <Text style={styles.deviceModel}>{device.modelName}</Text>
                          )}
                        </View>
                        {isThisConnecting && <ActivityIndicator size="small" color={NF_RED} />}
                        {isThisConnected && !isThisConnecting && (
                          <Check size={18} color={NF_RED} />
                        )}
                      </Pressable>
                    );
                  })}
                </>
              )}

              {/* No devices found */}
              {chromecastDevices.length === 0 && !AirPlayButton && (
                <View style={styles.noDevices}>
                  <WifiOff size={32} color={TEXT_SECONDARY} />
                  <Text style={styles.noDevicesTitle}>No devices found</Text>
                  <Text style={styles.noDevicesSub}>
                    Make sure your Chromecast is on the same Wi-Fi network.
                  </Text>
                </View>
              )}

              {/* AirPlay section (iOS only) */}
              {Platform.OS === 'ios' && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>AirPlay</Text>
                  {AirPlayButton ? (
                    <View style={styles.airPlayRow}>
                      <View style={styles.deviceIcon}>
                        <Radio size={20} color={TEXT_PRIMARY} />
                      </View>
                      <Text style={styles.deviceName}>AirPlay & Bluetooth</Text>
                      {/* Native picker button overlaid on top */}
                      <AirPlayButton style={styles.airPlayNativeBtn} />
                    </View>
                  ) : (
                    <View style={styles.airPlayRow}>
                      <View style={styles.deviceIcon}>
                        <Radio size={20} color={TEXT_SECONDARY} />
                      </View>
                      <Text style={[styles.deviceName, { color: TEXT_SECONDARY }]}>
                        AirPlay (rebuild required)
                      </Text>
                    </View>
                  )}
                </>
              )}

              {/* Scanning indicator */}
              {gCastState === GCastState.NOT_CONNECTED && chromecastDevices.length === 0 && (
                <View style={styles.scanningRow}>
                  <ActivityIndicator size="small" color={TEXT_SECONDARY} />
                  <Text style={styles.scanningText}>Scanning for devices…</Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  iconBtn: { padding: 4 },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: 'rgba(12,12,12,0.97)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    maxHeight: '75%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginTop: 10, marginBottom: 4 },

  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  sheetTitle: { color: TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },

  activeBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#1a0000', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#3a0000' },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activeBannerTitle: { color: TEXT_PRIMARY, fontSize: 14, fontWeight: '600' },
  activeBannerSub: { color: TEXT_SECONDARY, fontSize: 12, marginTop: 1 },
  disconnectBtn: { backgroundColor: NF_RED, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  disconnectBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  deviceList: { paddingHorizontal: 16 },
  sectionLabel: { color: TEXT_SECONDARY, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },

  deviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  deviceRowActive: { backgroundColor: 'rgba(229,9,20,0.06)', borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8 },
  deviceIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: SURFACE, justifyContent: 'center', alignItems: 'center' },
  deviceInfo: { flex: 1 },
  deviceName: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '500' },
  deviceModel: { color: TEXT_SECONDARY, fontSize: 12, marginTop: 1 },

  airPlayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12, position: 'relative' },
  airPlayNativeBtn: { position: 'absolute', right: 0, width: 44, height: 44 },

  noDevices: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  noDevicesTitle: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '600' },
  noDevicesSub: { color: TEXT_SECONDARY, fontSize: 13, textAlign: 'center', maxWidth: 260 },

  scanningRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  scanningText: { color: TEXT_SECONDARY, fontSize: 13 },
});

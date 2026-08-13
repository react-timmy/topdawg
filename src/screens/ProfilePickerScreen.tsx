/**
 * ProfilePickerScreen.tsx
 *
 * Full-screen gate shown on every cold app open.
 *
 * State 1 — Not signed in:
 *   Dark background, FilmSort logo/title, "Continue with Google" button.
 *
 * State 2 — Signed in:
 *   "Who's watching?" header, user's profile card (avatar + name),
 *   Edit pencil button that opens an inline bottom sheet to rename
 *   and repick the avatar. Tapping the profile card enters the app.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  TextInput,
  Modal,
  FlatList,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pencil, Clapperboard } from 'lucide-react-native';
import { proxyFetchPublic } from '../services/proxyClient';

import { useAccount } from '../context/AccountContext';
import {
  profileService,
  LocalProfile,
  AVATAR_PRESETS,
  DEFAULT_PROFILE,
} from '../storage/profileService';

// ─── Constants ────────────────────────────────────────────────────────────────

const NF_RED = '#E50914';

// ─── Avatar bubble ────────────────────────────────────────────────────────────

/**
 * Shows the Google profile photo only when the user hasn't chosen a custom
 * emoji avatar (i.e. still on the default 🎬). Once they pick any preset
 * from the grid, their emoji takes precedence everywhere.
 */
function AvatarBubble({
  emoji,
  color,
  photoUrl,
  size = 88,
  fontSize = 38,
  isDefaultEmoji = false,
}: {
  emoji: string;
  color: string;
  photoUrl?: string | null;
  size?: number;
  fontSize?: number;
  /** True when the emoji is still the factory default — allows Google photo to show. */
  isDefaultEmoji?: boolean;
}) {
  // Google photo wins only when no custom emoji has been chosen yet
  if (photoUrl && isDefaultEmoji) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[
          styles.avatarBubble,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      />
    );
  }
  return (
    <View
      style={[
        styles.avatarBubble,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Text style={{ fontSize }}>{emoji}</Text>
    </View>
  );
}

// ─── Signed-out view ──────────────────────────────────────────────────────────

function SignedOutView({
  signingIn,
  signInError,
  onSignIn,
}: {
  signingIn: boolean;
  signInError: string | null;
  onSignIn: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.signedOutRoot}>
      {/* App icon / logo */}
      <Animated.View entering={ZoomIn.delay(100).duration(500)} style={styles.logoRing}>
        <Clapperboard size={44} color="#ffffff" strokeWidth={1.8} />
      </Animated.View>

      <Animated.Text entering={FadeInDown.delay(200).duration(400)} style={styles.appName}>
        FilmSort
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(260).duration(400)} style={styles.appTagline}>
        Your personal movie & TV library
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(340).duration(400)} style={styles.signedOutActions}>
        {/* Google button */}
        <Pressable
          style={({ pressed }) => [
            styles.googleBtn,
            (pressed || signingIn) && { opacity: 0.85 },
          ]}
          onPress={onSignIn}
          disabled={signingIn}
        >
          {signingIn ? (
            <ActivityIndicator color="#1a1a1a" size="small" />
          ) : (
            <>
              <Text style={styles.googleG}>G</Text>
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        {signInError ? (
          <Text style={styles.errorText}>{signInError}</Text>
        ) : null}

        <Text style={styles.signedOutHint}>
          Sign in to back up your history and badges across devices.
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Edit sheet (modal) ───────────────────────────────────────────────────────

function EditSheet({
  visible,
  profile,
  onSave,
  onClose,
}: {
  visible: boolean;
  profile: LocalProfile;
  onSave: (p: LocalProfile) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [selectedEmoji, setSelectedEmoji] = useState(profile.avatarEmoji);
  const [selectedColor, setSelectedColor] = useState(profile.avatarColor);
  const inputRef = useRef<TextInput>(null);

  // Sync from parent whenever sheet opens
  useEffect(() => {
    if (visible) {
      setName(profile.displayName);
      setSelectedEmoji(profile.avatarEmoji);
      setSelectedColor(profile.avatarColor);
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [visible, profile]);

  const handleSave = () => {
    const trimmed = name.trim() || DEFAULT_PROFILE.displayName;
    onSave({ displayName: trimmed, avatarEmoji: selectedEmoji, avatarColor: selectedColor });
    Keyboard.dismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />

        <Text style={styles.sheetTitle}>Edit Profile</Text>

        {/* Live preview */}
        <View style={styles.sheetPreview}>
          <AvatarBubble emoji={selectedEmoji} color={selectedColor} size={80} fontSize={34} />
          <Text style={styles.sheetPreviewName} numberOfLines={1}>
            {name.trim() || 'Your Name'}
          </Text>
        </View>

        {/* Name input */}
        <TextInput
          ref={inputRef}
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="Enter your name"
          placeholderTextColor="#52525b"
          maxLength={24}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          selectionColor={NF_RED}
        />

        {/* Avatar grid */}
        <Text style={styles.sheetSectionLabel}>Choose Avatar</Text>
        <FlatList
          data={AVATAR_PRESETS}
          keyExtractor={(item) => item.emoji}
          numColumns={6}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const isSelected =
              item.emoji === selectedEmoji && item.color === selectedColor;
            return (
              <Pressable
                onPress={() => {
                  setSelectedEmoji(item.emoji);
                  setSelectedColor(item.color);
                }}
                style={[styles.avatarOption, isSelected && styles.avatarOptionSelected]}
              >
                <AvatarBubble
                  emoji={item.emoji}
                  color={item.color}
                  size={46}
                  fontSize={20}
                />
              </Pressable>
            );
          }}
          contentContainerStyle={styles.avatarGrid}
        />

        {/* Save button */}
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Signed-in view ───────────────────────────────────────────────────────────

function SignedInView({
  profile,
  photoUrl,
  onEnter,
  onEdit,
}: {
  profile: LocalProfile;
  photoUrl?: string | null;
  onEnter: () => void;
  onEdit: () => void;
}) {
  const cardScale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const handlePressIn = () => {
    cardScale.value = withSpring(0.94, { damping: 18, stiffness: 300 });
  };
  const handlePressOut = () => {
    cardScale.value = withSpring(1, { damping: 18, stiffness: 300 });
  };

  return (
    <Animated.View entering={FadeIn.duration(380)} style={styles.signedInRoot}>
      <Animated.Text
        entering={FadeInDown.delay(80).duration(340)}
        style={styles.whoTitle}
      >
        Select Your Profile
      </Animated.Text>

      {/* Profile card with overlapping edit button */}
      <Animated.View
        entering={FadeInDown.delay(160).duration(340)}
        style={styles.profileRow}
      >
        {/* Tappable profile card */}
        <Pressable
          onPress={onEnter}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.profileCardWrap}
        >
          <Animated.View style={[styles.profileCard, cardStyle]}>
            <AvatarBubble
              emoji={profile.avatarEmoji}
              color={profile.avatarColor}
              photoUrl={photoUrl}
              isDefaultEmoji={profile.avatarEmoji === DEFAULT_PROFILE.avatarEmoji}
              size={88}
              fontSize={38}
            />
            <Text style={styles.profileName} numberOfLines={1}>
              {profile.displayName}
            </Text>
          </Animated.View>
        </Pressable>

        {/* Edit button — half-overlapping the top-right corner of the card */}
        <Pressable onPress={onEdit} style={styles.editBtn} hitSlop={12}>
          <Pencil size={14} color="#ffffff" strokeWidth={2} />
        </Pressable>
      </Animated.View>

      <Animated.Text
        entering={FadeInDown.delay(240).duration(340)}
        style={styles.tapHint}
      >
        Tap your profile to continue
      </Animated.Text>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ProfilePickerScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { account, loaded, signIn } = useAccount();
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [profile, setProfile] = useState<LocalProfile>(DEFAULT_PROFILE);
  const [editVisible, setEditVisible] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Background poster pulled from TMDB (proxy must expose /tmdb/public)
  const [bgPosterUrl, setBgPosterUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadBackground = async () => {
      try {
        const data = await proxyFetchPublic<{ results?: Array<{ poster_path?: string }> }>('tmdb', {
          path: '/trending/movie/week',
          params: { language: 'en-US' },
        });
        const results = data.results ?? [];
        const posters = results
          .filter((r) => r.poster_path)
          .map((r) => `https://image.tmdb.org/t/p/w780${r.poster_path}`);
        if (posters.length && !cancelled) {
          setBgPosterUrl(posters[Math.floor(Math.random() * posters.length)]);
        }
      } catch (e) {
        // silently ignore — background is decorative and should not block sign-in
      }
    };
    loadBackground();
    return () => { cancelled = true; };
  }, []);

  // Load stored profile on mount
  useEffect(() => {
    profileService.get().then((p) => {
      setProfile(p);
      setProfileLoaded(true);
    });
  }, []);

  // If account is set and user came from a sign-in, ensure profile loaded
  const handleEnter = useCallback(() => {
    navigation.replace('MainTabs');
  }, [navigation]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setSignInError(null);
    try {
      await signIn();
      // After sign-in, sync displayName from Google account if no custom name set
      const hasExisting = await profileService.hasProfile();
      if (!hasExisting && account) {
        // Will re-read via useEffect below after account state updates
      }
    } catch (err: unknown) {
      const e = err as any;
      const rawMsg = String(e?.message ?? 'Sign-in failed. Please try again.');

      // Friendly mapping for common, actionable cases
      let friendly = rawMsg;
      const code = String(e?.code ?? '').toLowerCase();
      const lower = rawMsg.toLowerCase();

      if (code.includes('network') || lower.includes('network request failed') || lower.includes('network')) {
        friendly = 'No internet connection. Check your network and try again.';
      } else if (lower.includes('play services')) {
        friendly = 'Google Play Services is not available or out of date on this device.';
      }

      setSignInError(friendly);
    } finally {
      setSigningIn(false);
    }
  };

  // After account loads (post sign-in), seed profile name from Google if first time
  useEffect(() => {
    if (!account) return;
    profileService.hasProfile().then((has) => {
      if (!has) {
        // Seed from Google display name on first sign-in
        const seeded: LocalProfile = {
          displayName: account.displayName ?? DEFAULT_PROFILE.displayName,
          avatarEmoji: DEFAULT_PROFILE.avatarEmoji,
          avatarColor: DEFAULT_PROFILE.avatarColor,
        };
        profileService.save(seeded);
        setProfile(seeded);
      }
    });
  }, [account]);

  const handleSaveProfile = async (updated: LocalProfile) => {
    await profileService.save(updated);
    setProfile(updated);
    setEditVisible(false);
  };

  // Loading state — show nothing until account and profile are both ready
  if (!loaded || !profileLoaded) {
    return (
      <View style={styles.loadingRoot}>
        <StatusBar hidden />
        <ActivityIndicator color="#ffffff" size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {bgPosterUrl ? (
        <Image source={{ uri: bgPosterUrl }} style={styles.bgImage} blurRadius={6} />
      ) : null}

      <StatusBar hidden />

      {account ? (
        <SignedInView
          profile={profile}
          photoUrl={account.photoUrl}
          onEnter={handleEnter}
          onEdit={() => setEditVisible(true)}
        />
      ) : (
        <SignedOutView
          signingIn={signingIn}
          signInError={signInError}
          onSignIn={handleSignIn}
        />
      )}

      <EditSheet
        visible={editVisible}
        profile={profile}
        onSave={handleSaveProfile}
        onClose={() => setEditVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Root containers ────────────────────────────────────────────────────────
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Signed-out ─────────────────────────────────────────────────────────────
  signedOutRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 0,
    width: '100%',
  },
  logoRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: NF_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  appName: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  appTagline: {
    color: '#52525b',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 48,
  },
  signedOutActions: {
    width: '100%',
    alignItems: 'center',
    gap: 14,
    marginTop: 140, // increased to push the sign-in action further down
  },
  googleBtn: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleG: {
    color: '#4285F4',
    fontSize: 18,
    fontWeight: '900',
  },
  googleBtnText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  signedOutHint: {
    color: '#3f3f46',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Signed-in ──────────────────────────────────────────────────────────────
  signedInRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    width: '100%',
  },
  whoTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 40,
  },
  profileRow: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCardWrap: {
    alignItems: 'center',
  },
  profileCard: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    minWidth: 130,
  },
  profileName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 110,
  },
  // Pencil sits half-inside / half-outside the top-right corner of the card.
  // The card has borderRadius: 20 and the avatar is 88px wide centred in it.
  // top: -16 puts half of the 32px button above the card top edge.
  // right: -16 puts half of the 32px button beyond the card right edge.
  editBtn: {
    position: 'absolute',
    top: -14,
    right: -14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: NF_RED,
    borderWidth: 2,
    borderColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  tapHint: {
    color: '#3f3f46',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 32,
  },

  // ── Avatar ─────────────────────────────────────────────────────────────────
  avatarBubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Decorative background pulled from TMDB via the public proxy route
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.08,
  },

  // ── Edit sheet ─────────────────────────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    backgroundColor: '#111113',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  sheetPreview: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  sheetPreviewName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    marginBottom: 20,
  },
  sheetSectionLabel: {
    color: '#52525b',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  avatarGrid: {
    gap: 8,
    marginBottom: 24,
  },
  avatarOption: {
    flex: 1,
    alignItems: 'center',
    padding: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    margin: 3,
  },
  avatarOptionSelected: {
    borderColor: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  saveBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: NF_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});

/**
 * WatchPartyScreen.tsx
 *
 * Full-screen watch party experience:
 *  - Lobby: shows invite code, waiting-room member list, "Start Watching" (host only)
 *  - Live:  shows currently-playing title, synced member list, real-time chat
 *
 * Navigation params: { roomId: string; item: MediaItem }
 *
 * The VideoPlayerScreen is pushed on top of this screen — WatchPartyScreen
 * stays on the stack so guests can see chat even when the player is closed.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Users,
  Send,
  Share2,
  Play,
  ChevronLeft,
  Crown,
  Wifi,
  WifiOff,
  Copy,
  Check,
} from 'lucide-react-native';

import { RootStackParamList, WatchPartyMember, WatchPartyMessage } from '../types';
import { useWatchParty } from '../context/WatchPartyContext';
import { useAccount } from '../context/AccountContext';
import { MEMBER_TIMEOUT_MS } from '../services/watchPartyService';

// ─── Types ────────────────────────────────────────────────────────────────────

type WatchPartyRouteProp = RouteProp<RootStackParamList, 'WatchParty'>;
type WatchPartyNavProp = NativeStackNavigationProp<RootStackParamList, 'WatchParty'>;

// ─── Colours ──────────────────────────────────────────────────────────────────

const NF_RED = '#E50914';
const BG = '#0a0a0a';
const SURFACE = '#161616';
const BORDER = '#2a2a2a';
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = '#8a8a8a';
const ONLINE_DOT = '#22c55e';
const BUFFERING_DOT = '#f59e0b';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOnline(m: WatchPartyMember): boolean {
  return Date.now() - new Date(m.lastSeen).getTime() < MEMBER_TIMEOUT_MS;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Avatar({
  member,
  size = 36,
  showStatus = true,
}: {
  member: WatchPartyMember;
  size?: number;
  showStatus?: boolean;
}) {
  const online = isOnline(member);
  const dotColor = member.isBuffering ? BUFFERING_DOT : ONLINE_DOT;

  return (
    <View style={{ width: size, height: size }}>
      {member.photoUrl ? (
        <Image
          source={{ uri: member.photoUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View
          style={[
            styles.avatarFallback,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={[styles.avatarInitials, { fontSize: size * 0.36 }]}>
            {initials(member.displayName)}
          </Text>
        </View>
      )}
      {showStatus && (
        <View
          style={[
            styles.statusDot,
            {
              width: size * 0.3,
              height: size * 0.3,
              borderRadius: (size * 0.3) / 2,
              bottom: -1,
              right: -1,
              backgroundColor: online ? dotColor : '#555',
            },
          ]}
        />
      )}
      {member.role === 'host' && (
        <View style={styles.crownBadge}>
          <Crown size={9} color="#facc15" fill="#facc15" />
        </View>
      )}
    </View>
  );
}

function MemberRow({ member }: { member: WatchPartyMember }) {
  const online = isOnline(member);
  return (
    <View style={styles.memberRow}>
      <Avatar member={member} size={40} />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.displayName}
          {member.role === 'host' ? ' (host)' : ''}
        </Text>
        <Text style={[styles.memberStatus, { color: online ? ONLINE_DOT : TEXT_SECONDARY }]}>
          {!online ? 'disconnected' : member.isBuffering ? 'buffering…' : 'watching'}
        </Text>
      </View>
      {online ? (
        <Wifi size={14} color={ONLINE_DOT} />
      ) : (
        <WifiOff size={14} color={TEXT_SECONDARY} />
      )}
    </View>
  );
}

function ChatBubble({
  msg,
  isMine,
}: {
  msg: WatchPartyMessage;
  isMine: boolean;
}) {
  return (
    <View style={[styles.bubbleWrap, isMine && styles.bubbleWrapMine]}>
      {!isMine && (
        <View style={styles.bubbleAuthorRow}>
          <Text style={styles.bubbleAuthor}>{msg.displayName}</Text>
          <Text style={styles.bubbleTime}>{formatTime(msg.sentAt)}</Text>
        </View>
      )}
      <View style={[styles.bubble, isMine && styles.bubbleMine]}>
        <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
          {msg.text}
        </Text>
      </View>
      {isMine && (
        <Text style={[styles.bubbleTime, { alignSelf: 'flex-end', marginTop: 2 }]}>
          {formatTime(msg.sentAt)}
        </Text>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function WatchPartyScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<WatchPartyNavProp>();
  const route = useRoute<WatchPartyRouteProp>();
  const { roomId, item } = route.params;
  const { account } = useAccount();
  const party = useWatchParty();

  const [draftMsg, setDraftMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'members' | 'chat'>('members');
  const chatListRef = useRef<FlatList<WatchPartyMessage>>(null);

  // ── Join on mount if not already in room ─────────────────────────────────
  useEffect(() => {
    if (!party.isInParty && !party.isLoading && account) {
      party.joinParty(roomId, item).catch((e: Error) => {
        Alert.alert('Could not join', e.message, [
          { text: 'Go back', onPress: () => navigation.goBack() },
        ]);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'chat' && party.messages.length > 0) {
      chatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [party.messages, tab]);

  // ── Handle party ended by host ────────────────────────────────────────────
  useEffect(() => {
    if (party.isInParty || party.isLoading) return;
    // Room was torn down (host ended it)
    if (navigation.canGoBack()) navigation.goBack();
  }, [party.isInParty, party.isLoading, navigation]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    await Share.share({
      message: `Join my FilmSort watch party!\n\nRoom code: ${roomId}\n\nOpen FilmSort and tap "Join Watch Party" to enter.`,
      title: `Watch "${item.title}" together`,
    });
  }, [roomId, item.title]);

  const handleCopyCode = useCallback(async () => {
    // Clipboard import deferred to avoid requiring the package at module level
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // expo-clipboard may not be installed — fall back to Share
      handleShare();
    }
  }, [roomId, handleShare]);

  const handleStartWatching = useCallback(() => {
    navigation.navigate('VideoPlayer', {
      item,
      startPosition: 0,
      watchPartyRoomId: roomId,
    });
  }, [navigation, item, roomId]);

  const handleLeave = useCallback(() => {
    Alert.alert(
      party.isHost ? 'End watch party?' : 'Leave watch party?',
      party.isHost
        ? 'Ending the party will disconnect all members.'
        : 'You can rejoin with the same room code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: party.isHost ? 'End Party' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            await party.leaveParty();
            navigation.goBack();
          },
        },
      ],
    );
  }, [party, navigation]);

  const handleSendMessage = useCallback(async () => {
    if (!draftMsg.trim()) return;
    const text = draftMsg.trim();
    setDraftMsg('');
    await party.sendMessage(text);
  }, [draftMsg, party]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (party.isLoading && !party.isInParty) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={NF_RED} size="large" />
        <Text style={styles.loadingText}>Joining watch party…</Text>
      </View>
    );
  }

  const posterUrl = item.posterUrl ?? item.backdropUrl;
  const isLobby = party.room?.status === 'lobby';
  const onlineCount = party.members.filter(isOnline).length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* ── Header ── */}
      <LinearGradient
        colors={['#1a0000', BG]}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable style={styles.backBtn} onPress={handleLeave} hitSlop={12}>
          <ChevronLeft size={22} color={TEXT_PRIMARY} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.headerMeta}>
            <Users size={12} color={NF_RED} />
            <Text style={styles.headerMetaText}>
              {onlineCount} watching
            </Text>
            <View style={[styles.statusPill, { backgroundColor: isLobby ? '#1a3a1a' : '#1a0000' }]}>
              <Text style={[styles.statusPillText, { color: isLobby ? ONLINE_DOT : NF_RED }]}>
                {isLobby ? 'Lobby' : party.room?.status ?? ''}
              </Text>
            </View>
          </View>
        </View>

        <Pressable style={styles.shareBtn} onPress={handleShare} hitSlop={12}>
          <Share2 size={20} color={TEXT_PRIMARY} />
        </Pressable>
      </LinearGradient>

      {/* ── Poster + room code ── */}
      <View style={styles.heroRow}>
        {posterUrl && (
          <Image source={{ uri: posterUrl }} style={styles.poster} />
        )}
        <View style={styles.heroInfo}>
          <Text style={styles.heroTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.heroSub}>
            {item.type === 'movie' ? 'Movie' : 'TV Show'}
            {item.releaseDate ? ` · ${item.releaseDate.slice(0, 4)}` : ''}
          </Text>

          {/* Room code */}
          <Pressable style={styles.codeRow} onPress={handleCopyCode}>
            <Text style={styles.codeLabel}>Room code</Text>
            <View style={styles.codePill}>
              <Text style={styles.codeText}>{roomId}</Text>
              {copied
                ? <Check size={13} color={ONLINE_DOT} />
                : <Copy size={13} color={TEXT_SECONDARY} />
              }
            </View>
          </Pressable>

          {/* Start / rejoin button */}
          {party.isHost && (
            <Pressable style={styles.startBtn} onPress={handleStartWatching}>
              <Play size={15} color="#fff" fill="#fff" />
              <Text style={styles.startBtnText}>
                {isLobby ? 'Start Watching' : 'Open Player'}
              </Text>
            </Pressable>
          )}
          {!party.isHost && (
            <Pressable style={styles.startBtn} onPress={handleStartWatching}>
              <Play size={15} color="#fff" fill="#fff" />
              <Text style={styles.startBtnText}>Open Player</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabs}>
        {(['members', 'chat'] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'members' ? `Members (${party.members.length})` : 'Chat'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Members tab ── */}
      {tab === 'members' && (
        <ScrollView
          style={styles.listWrap}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        >
          {party.members.map((m) => (
            <MemberRow key={m.uid} member={m} />
          ))}
          {party.members.length === 0 && (
            <Text style={styles.emptyText}>No members yet — share the code!</Text>
          )}
        </ScrollView>
      )}

      {/* ── Chat tab ── */}
      {tab === 'chat' && (
        <>
          <FlatList
            ref={chatListRef}
            data={party.messages}
            keyExtractor={(m) => m.id}
            style={styles.listWrap}
            contentContainerStyle={{ padding: 12, paddingBottom: 4 }}
            onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item: msg }) => (
              <ChatBubble
                msg={msg}
                isMine={msg.uid === account?.uid}
              />
            )}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { marginTop: 32 }]}>
                No messages yet. Say hi!
              </Text>
            }
          />

          {/* Chat input */}
          <View
            style={[
              styles.inputRow,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <TextInput
              style={styles.chatInput}
              value={draftMsg}
              onChangeText={setDraftMsg}
              placeholder="Message…"
              placeholderTextColor={TEXT_SECONDARY}
              returnKeyType="send"
              onSubmitEditing={handleSendMessage}
              maxLength={300}
              multiline={false}
            />
            <Pressable
              style={[styles.sendBtn, !draftMsg.trim() && styles.sendBtnDisabled]}
              onPress={handleSendMessage}
              disabled={!draftMsg.trim()}
            >
              <Send size={18} color={draftMsg.trim() ? '#fff' : TEXT_SECONDARY} />
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: TEXT_SECONDARY, marginTop: 12, fontSize: 14 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12 },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, marginHorizontal: 10 },
  headerTitle: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '600' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  headerMetaText: { color: TEXT_SECONDARY, fontSize: 12 },
  statusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  shareBtn: { padding: 4 },

  // Hero
  heroRow: { flexDirection: 'row', padding: 14, gap: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  poster: { width: 72, height: 108, borderRadius: 6, backgroundColor: SURFACE },
  heroInfo: { flex: 1 },
  heroTitle: { color: TEXT_PRIMARY, fontSize: 16, fontWeight: '700', marginBottom: 3 },
  heroSub: { color: TEXT_SECONDARY, fontSize: 13, marginBottom: 10 },

  // Room code
  codeRow: { marginBottom: 12 },
  codeLabel: { color: TEXT_SECONDARY, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  codePill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SURFACE, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: BORDER },
  codeText: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '700', letterSpacing: 2, fontVariant: ['tabular-nums'] },

  // Start button
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: NF_RED, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, alignSelf: 'flex-start' },
  startBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Tabs
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: NF_RED },
  tabText: { color: TEXT_SECONDARY, fontSize: 14 },
  tabTextActive: { color: TEXT_PRIMARY, fontWeight: '600' },

  listWrap: { flex: 1 },
  emptyText: { color: TEXT_SECONDARY, fontSize: 14, textAlign: 'center', marginTop: 24 },

  // Member row
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  memberInfo: { flex: 1 },
  memberName: { color: TEXT_PRIMARY, fontSize: 14, fontWeight: '500' },
  memberStatus: { fontSize: 12, marginTop: 1 },

  // Avatar
  avatarFallback: { backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { color: '#fff', fontWeight: '700' },
  statusDot: { position: 'absolute', borderWidth: 1.5, borderColor: BG },
  crownBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#1a1a00', borderRadius: 8, padding: 2 },

  // Chat
  bubbleWrap: { marginBottom: 10, maxWidth: '80%', alignSelf: 'flex-start' },
  bubbleWrapMine: { alignSelf: 'flex-end' },
  bubbleAuthorRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 3 },
  bubbleAuthor: { color: NF_RED, fontSize: 12, fontWeight: '600' },
  bubbleTime: { color: TEXT_SECONDARY, fontSize: 11 },
  bubble: { backgroundColor: SURFACE, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: '#5a0009', borderBottomLeftRadius: 14, borderBottomRightRadius: 4 },
  bubbleText: { color: TEXT_PRIMARY, fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },

  // Input
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: BG, gap: 8 },
  chatInput: { flex: 1, backgroundColor: SURFACE, color: TEXT_PRIMARY, fontSize: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: BORDER },
  sendBtn: { width: 40, height: 40, backgroundColor: NF_RED, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#3a0000' },
});

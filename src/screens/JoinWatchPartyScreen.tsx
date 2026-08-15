/**
 * JoinWatchPartyScreen.tsx
 *
 * Screen where users can enter a room code to join an existing watch party.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ChevronLeft, Users, LogIn, ScanLine } from 'lucide-react-native';

import { useWatchParty } from '../context/WatchPartyContext';
import { useAccount } from '../context/AccountContext';
import { storageService } from '../storage/asyncStorage';
import { QRScanner } from '../components/QRScanner';

const NF_RED = '#E50914';

export function JoinWatchPartyScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const party = useWatchParty();
  const { account } = useAccount();

  const [roomCode, setRoomCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const handleJoin = async () => {
    if (!account) {
      Alert.alert('Sign in required', 'You must be signed in to join a watch party.');
      return;
    }

    const code = roomCode.trim();
    if (code.length === 0) {
      Alert.alert('Invalid code', 'Please enter a room code.');
      return;
    }

    await joinWithCode(code);
  };

  const joinWithCode = async (code: string) => {
    setIsJoining(true);

    try {
      // First, try to get the room to find out what media item it is
      const room = await party.getRoom?.(code);
      if (!room) {
        Alert.alert('Room not found', 'This watch party does not exist or has ended.');
        setIsJoining(false);
        return;
      }

      // Use the item from the room - this is what the host is watching
      const roomItem = room.item;

      // Check if we have this item in our library (with local file)
      const library = await storageService.getLibrary();
      const localItem = library.find((i) => i.id === roomItem.id);

      // Prefer local item if available (has file), otherwise use room item
      const itemToUse = localItem?.localFile || localItem?.localFiles?.length 
        ? localItem 
        : roomItem;

      // Join the party with the room's item
      await party.joinParty(code, itemToUse);

      // Navigate to the watch party screen with the room's item
      navigation.navigate('WatchParty', { roomId: code, item: itemToUse });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to join watch party.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleQRScanned = async (code: string) => {
    if (!account) {
      Alert.alert('Sign in required', 'You must be signed in to join a watch party.');
      return;
    }
    setRoomCode(code);
    await joinWithCode(code);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Background gradient */}
      <LinearGradient
        colors={['#1a0033', '#0a0a0a']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
          <ChevronLeft size={22} color="#ffffff" />
        </Pressable>
        <Text style={styles.headerTitle}>Join Watch Party</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconRing}>
          <Users size={48} color="#a78bfa" strokeWidth={1.8} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Enter Room Code</Text>
        <Text style={styles.subtitle}>
          Ask the host to share the room code with you
        </Text>

        {/* Input */}
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={roomCode}
            onChangeText={setRoomCode}
            placeholder="Room code"
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={20}
            returnKeyType="join"
            onSubmitEditing={handleJoin}
            editable={!isJoining}
          />
        </View>

        {/* Join button and Scan button row */}
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.joinBtn, (!roomCode.trim() || isJoining) && styles.joinBtnDisabled]}
            onPress={handleJoin}
            disabled={!roomCode.trim() || isJoining}
          >
            {isJoining ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <LogIn size={18} color="#ffffff" strokeWidth={2.5} />
                <Text style={styles.joinBtnText}>Join Party</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.scanBtn}
            onPress={() => setShowScanner(true)}
            disabled={isJoining}
          >
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
            <ScanLine size={24} color="#a78bfa" strokeWidth={2.5} />
          </Pressable>
        </View>

        {/* Help text */}
        <View style={styles.helpBox}>
          <Text style={styles.helpText}>
            💡 The host can find the room code on the watch party screen and share it with you via
            text, email, or any messaging app.
          </Text>
        </View>
      </View>

      {/* QR Scanner */}
      <QRScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onCodeScanned={handleQRScanned}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 40,
  },

  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },

  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(167,139,250,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(167,139,250,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },

  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  subtitle: {
    color: '#71717a',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 40,
  },

  inputWrap: {
    width: '100%',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 2,
  },

  buttonRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  joinBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#a78bfa',
    paddingVertical: 16,
    borderRadius: 16,
  },
  joinBtnDisabled: {
    opacity: 0.4,
  },
  joinBtnText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  scanBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(167,139,250,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
  },

  helpBox: {
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 12,
    padding: 16,
  },
  helpText: {
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});

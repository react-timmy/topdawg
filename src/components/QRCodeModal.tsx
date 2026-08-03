/**
 * QRCodeModal.tsx
 *
 * Modal that displays a QR code for the watch party room code.
 * Hosts can share this QR code for easy joining.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { X } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';

const { width } = Dimensions.get('window');

interface QRCodeModalProps {
  visible: boolean;
  onClose: () => void;
  roomCode: string;
  movieTitle: string;
}

export function QRCodeModal({ visible, onClose, roomCode, movieTitle }: QRCodeModalProps) {
  // QR code data format: filmsort://join?code=XXXXX
  const qrData = `filmsort://join?code=${roomCode}`;
  const qrSize = Math.min(width * 0.6, 260);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
        
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          {/* Close button */}
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <X size={24} color="#ffffff" strokeWidth={2} />
          </Pressable>

          {/* Header */}
          <Text style={styles.modalTitle}>Scan to Join</Text>
          <Text style={styles.modalSubtitle}>
            Have your friends scan this QR code to join the party
          </Text>

          {/* QR Code */}
          <View style={styles.qrContainer}>
            <View style={styles.qrWrapper}>
              <QRCode
                value={qrData}
                size={qrSize}
                color="#000000"
                backgroundColor="#ffffff"
                logo={undefined}
                logoSize={40}
                logoBackgroundColor="transparent"
              />
            </View>
          </View>

          {/* Movie title */}
          <Text style={styles.movieTitle} numberOfLines={2}>
            {movieTitle}
          </Text>

          {/* Room code display */}
          <View style={styles.codeDisplay}>
            <Text style={styles.codeLabel}>Room Code</Text>
            <Text style={styles.codeText}>{roomCode}</Text>
          </View>

          <Text style={styles.helpText}>
            Or share the room code manually
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  modalContent: {
    width: width * 0.85,
    maxWidth: 380,
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    color: '#8a8a8a',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  qrContainer: {
    marginBottom: 24,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  movieTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  codeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  codeLabel: {
    color: '#8a8a8a',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  helpText: {
    color: '#6a6a6a',
    fontSize: 12,
    textAlign: 'center',
  },
});

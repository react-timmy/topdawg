/**
 * QRScanner.tsx
 *
 * Full-screen QR code scanner for joining watch parties.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Alert,
  Dimensions,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { X, Scan } from 'lucide-react-native';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

interface QRScannerProps {
  visible: boolean;
  onClose: () => void;
  onCodeScanned: (code: string) => void;
}

export function QRScanner({ visible, onClose, onCodeScanned }: QRScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) {
      requestCameraPermission();
      setScanned(false);
    }
  }, [visible]);

  const requestCameraPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
    
    if (status !== 'granted') {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera access in your device settings to scan QR codes.',
        [{ text: 'OK', onPress: onClose }]
      );
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    
    setScanned(true);
    
    // Parse QR code data
    // Format: filmsort://join?code=XXXXX
    let roomCode = '';
    
    if (data.startsWith('filmsort://join?code=')) {
      roomCode = data.replace('filmsort://join?code=', '');
    } else if (data.length > 0 && data.length < 30) {
      // Assume it's just the room code
      roomCode = data;
    }
    
    if (roomCode) {
      onCodeScanned(roomCode);
      onClose();
    } else {
      Alert.alert(
        'Invalid QR Code',
        'This QR code does not contain a valid watch party room code.',
        [{ text: 'Try Again', onPress: () => setScanned(false) }]
      );
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {hasPermission === false ? (
          <View style={styles.permissionDenied}>
            <Scan size={64} color="#8a8a8a" strokeWidth={1.5} />
            <Text style={styles.permissionTitle}>Camera Access Needed</Text>
            <Text style={styles.permissionText}>
              Enable camera access in your device settings to scan QR codes
            </Text>
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
            />

            {/* Overlay with scanning frame */}
            <View style={styles.overlay}>
              <View style={styles.topOverlay} />
              
              <View style={styles.middleRow}>
                <View style={styles.sideOverlay} />
                
                {/* Scanning frame */}
                <View style={styles.scanFrame}>
                  {/* Corner accents */}
                  <View style={[styles.corner, styles.cornerTopLeft]} />
                  <View style={[styles.corner, styles.cornerTopRight]} />
                  <View style={[styles.corner, styles.cornerBottomLeft]} />
                  <View style={[styles.corner, styles.cornerBottomRight]} />
                </View>
                
                <View style={styles.sideOverlay} />
              </View>
              
              <View style={styles.bottomOverlay}>
                <Text style={styles.instructionText}>
                  Position the QR code within the frame
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Close button */}
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
          <X size={28} color="#ffffff" strokeWidth={2.5} />
        </Pressable>
      </View>
    </Modal>
  );
}

const SCAN_SIZE = Math.min(width * 0.7, 280);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: '#0a0a0a',
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    color: '#8a8a8a',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  middleRow: {
    flexDirection: 'row',
    height: SCAN_SIZE,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanFrame: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#a78bfa',
    borderWidth: 4,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 8,
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  instructionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});

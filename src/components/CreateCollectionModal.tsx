/**
 * CreateCollectionModal.tsx
 *
 * Modal for creating a new collection.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Sparkles } from 'lucide-react-native';

interface CreateCollectionModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function CreateCollectionModal({
  visible,
  onClose,
  onCreate,
}: CreateCollectionModalProps) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) {
      setName('');
    }
  }, [visible]);

  const handleCreate = () => {
    if (name.trim().length === 0) return;
    onCreate(name.trim());
    onClose();
  };

  const canCreate = name.trim().length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <BlurView intensity={40} style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.modalContainer}>
            <View style={styles.modal}>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Create Collection</Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <X size={22} color="#71717a" strokeWidth={2} />
                </Pressable>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="My Top 10 Romance Anime"
                  placeholderTextColor="#52525b"
                  value={name}
                  onChangeText={setName}
                  maxLength={50}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                />
                <Text style={styles.charCount}>{name.length}/50</Text>
              </View>

              <View style={styles.callout}>
                <View style={styles.calloutIcon}>
                  <Sparkles size={18} color="#a78bfa" strokeWidth={2} />
                </View>
                <View style={styles.calloutTextWrap}>
                  <Text style={styles.calloutTitle}>Collections stay flexible</Text>
                  <Text style={styles.calloutBody}>
                    Group any titles you want into a single shelf and back it up if needed.
                  </Text>
                </View>
              </View>

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.cancelButton,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={onClose}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.createButton,
                    !canCreate && styles.createButtonDisabled,
                    pressed && canCreate && { opacity: 0.7 },
                  ]}
                  onPress={handleCreate}
                  disabled={!canCreate}
                >
                  <Text
                    style={[
                      styles.createButtonText,
                      !canCreate && styles.createButtonTextDisabled,
                    ]}
                  >
                    Create
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    width: '100%',
    paddingHorizontal: 16,
  },
  modal: {
    backgroundColor: '#111111',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  charCount: {
    marginTop: 8,
    color: '#52525b',
    fontSize: 12,
    textAlign: 'right',
  },
  callout: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.18)',
    marginBottom: 18,
  },
  calloutIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(167,139,250,0.12)',
  },
  calloutTextWrap: {
    flex: 1,
    gap: 3,
  },
  calloutTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  calloutBody: {
    color: '#a1a1aa',
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  createButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    opacity: 0.4,
  },
  createButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  createButtonTextDisabled: {
    color: '#1a1a1a',
  },
});

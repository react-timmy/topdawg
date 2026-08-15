/**
 * ShareCollectionScreen.tsx
 *
 * Screen for sharing a collection via JSON export or text format.
 * Allows users to copy collection data to share with friends.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Share as RNShare,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ArrowLeft, Copy, Share2, FileJson, FileText } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { RootStackParamList } from '../types';

type ShareCollectionRouteProp = RouteProp<RootStackParamList, 'ShareCollection'>;

type ExportFormat = 'json' | 'text';

export function ShareCollectionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<ShareCollectionRouteProp>();
  const { collection } = route.params;

  const [format, setFormat] = useState<ExportFormat>('text');
  const [copied, setCopied] = useState(false);

  const generateJSON = () => {
    const exportData = {
      name: collection.name,
      type: collection.listType,
      itemCount: collection.items.length,
      items: collection.items.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : null,
        posterUrl: item.posterUrl,
        verified: item.verified,
      })),
      createdAt: collection.createdAt,
      sharedAt: new Date().toISOString(),
    };

    return JSON.stringify(exportData, null, 2);
  };

  const generateText = () => {
    const lines = [
      `📚 ${collection.name}`,
      ``,
      `${collection.items.length} ${collection.items.length === 1 ? 'item' : 'items'}:`,
      ``,
    ];

    collection.items.forEach((item, index) => {
      const year = item.releaseDate
        ? ` (${new Date(item.releaseDate).getFullYear()})`
        : '';
      const type = item.type === 'movie' ? '🎬' : '📺';
      const verified = item.verified ? ' ✓' : '';
      lines.push(`${index + 1}. ${type} ${item.title}${year}${verified}`);
    });

    lines.push(``);
    lines.push(`Shared from FilmSort`);

    return lines.join('\n');
  };

  const getExportContent = () => {
    return format === 'json' ? generateJSON() : generateText();
  };

  const handleCopy = async () => {
    try {
      const content = getExportContent();
      await Clipboard.setStringAsync(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[ShareCollection] Failed to copy:', err);
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const handleShare = async () => {
    try {
      const content = getExportContent();
      const title = `${collection.name} - FilmSort Collection`;

      await RNShare.share({
        message: content,
        title,
      });
    } catch (err) {
      console.warn('[ShareCollection] Failed to share:', err);
    }
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <ArrowLeft size={24} color="#a1a1aa" strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>Share Collection</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text style={styles.headerSubtitle}>{collection.name}</Text>
      </View>

      {/* Format selector */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Export Format</Text>
        <View style={styles.formatSelector}>
          <Pressable
            style={({ pressed }) => [
              styles.formatOption,
              format === 'text' && styles.formatOptionActive,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => setFormat('text')}
          >
            <FileText
              size={20}
              color={format === 'text' ? '#a78bfa' : '#71717a'}
              strokeWidth={2}
            />
            <View style={styles.formatContent}>
              <Text
                style={[
                  styles.formatName,
                  format === 'text' && styles.formatNameActive,
                ]}
              >
                Text
              </Text>
              <Text style={styles.formatDescription}>
                Easy to read, great for messages
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.formatOption,
              format === 'json' && styles.formatOptionActive,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => setFormat('json')}
          >
            <FileJson
              size={20}
              color={format === 'json' ? '#a78bfa' : '#71717a'}
              strokeWidth={2}
            />
            <View style={styles.formatContent}>
              <Text
                style={[
                  styles.formatName,
                  format === 'json' && styles.formatNameActive,
                ]}
              >
                JSON
              </Text>
              <Text style={styles.formatDescription}>
                Structured data with metadata
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* Preview */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Preview</Text>
        <ScrollView
          style={styles.preview}
          contentContainerStyle={styles.previewContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.previewText} selectable>
            {getExportContent()}
          </Text>
        </ScrollView>
      </View>

      {/* Actions */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.copyButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleCopy}
        >
          <Copy size={20} color="#ffffff" strokeWidth={2} />
          <Text style={styles.actionButtonText}>
            {copied ? 'Copied!' : 'Copy'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.shareButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleShare}
        >
          <Share2 size={20} color="#ffffff" strokeWidth={2} />
          <Text style={styles.actionButtonText}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    backgroundColor: '#09090b',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#71717a',
  },
  section: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formatSelector: {
    gap: 12,
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#27272a',
  },
  formatOptionActive: {
    borderColor: '#a78bfa',
    backgroundColor: '#1e1b4b',
  },
  formatContent: {
    flex: 1,
  },
  formatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: 2,
  },
  formatNameActive: {
    color: '#ffffff',
  },
  formatDescription: {
    fontSize: 12,
    color: '#52525b',
  },
  preview: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    maxHeight: 300,
  },
  previewContent: {
    padding: 16,
  },
  previewText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#e4e4e7',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#18181b',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  copyButton: {
    backgroundColor: '#3f3f46',
  },
  shareButton: {
    backgroundColor: '#a78bfa',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

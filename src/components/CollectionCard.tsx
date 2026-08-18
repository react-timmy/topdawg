/**
 * CollectionCard.tsx
 *
 * Card displaying collection items as a horizontally scrollable row of posters.
 * The header is tappable to open the collection; the scroll area handles its
 * own touch events independently so horizontal swipe always works.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import CachedImage from './CachedImage';
import { Collection } from '../types';
import { Sparkles, Film } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32; // 16px padding on each side
const POSTER_WIDTH = 120;
const POSTER_HEIGHT = 180;
const POSTER_GAP = 12;

interface CollectionCardProps {
  collection: Collection;
  onPress: () => void;
}

export const CollectionCard = React.memo(function CollectionCard({ collection, onPress }: CollectionCardProps) {
  // ── Empty state ────────────────────────────────────────────────────────────
  if (collection.items.length === 0) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
        onPress={onPress}
      >
        <CollectionHeader collection={collection} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Tap to add items</Text>
        </View>
      </Pressable>
    );
  }

  // ── Has items — header tappable, scroll area independent ──────────────────
  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.8 }}>
        <CollectionHeader collection={collection} />
      </Pressable>

      <ScrollView
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {collection.items.map((item, index) => (
          <View key={`${item.id}-${index}`} style={styles.posterContainer}>
            {item.posterUrl ? (
            <CachedImage uri={item.posterUrl} style={styles.poster} />
            ) : (
              <View style={[styles.poster, styles.posterPlaceholder]}>
                <Text style={styles.posterPlaceholderText}>{item.title[0]}</Text>
              </View>
            )}
            {item.verified && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>✓</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
});

// ─── Shared header ─────────────────────────────────────────────────────────────

const CollectionHeader = React.memo(function CollectionHeader({ collection }: { collection: Collection }) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        {collection.listType === 'collection' && collection.backedUp && (
          <View style={styles.backedUpBadge}>
            <Sparkles size={11} color="#a78bfa" strokeWidth={2} />
          </View>
        )}
        <Text style={styles.collectionName} numberOfLines={1}>
          {collection.name}
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{collection.items.length}</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  header: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  backedUpBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
    flex: 1,
  },
  itemCount: {
    fontSize: 12,
    color: '#71717a',
    fontWeight: '500',
  },
  scrollView: {
    marginHorizontal: -4,
  },
  scrollContent: {
    paddingHorizontal: 4,
    gap: POSTER_GAP,
  },
  posterContainer: {
    width: POSTER_WIDTH,
    position: 'relative',
  },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#27272a',
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPlaceholderText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#52525b',
  },
  verifiedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  emptyState: {
    height: POSTER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#09090b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 14,
    color: '#52525b',
  },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  countBadgeText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '700',
  },
});

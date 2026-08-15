/**
 * ListItemRow.tsx
 *
 * Compact numbered row used inside the List detail view.
 * Shows rank number, small poster thumbnail, title + meta,
 * and a right-side swipe-to-delete affordance (long-press).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, {
  FadeInLeft,
  useSharedValue,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { CheckCircle, Film, Tv, Star, Trash2 } from 'lucide-react-native';
import { CollectionItem } from '../types';

interface ListItemRowProps {
  item: CollectionItem;
  rank: number;
  onLongPress: (itemId: string) => void;
  onPress?: (item: CollectionItem) => void;
}

export function ListItemRow({ item, rank, onLongPress, onPress }: ListItemRowProps) {
  const [longPressed, setLongPressed] = useState(false);
  const translateX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handlePressIn = () => {};

  const handleLongPress = () => {
    setLongPressed(true);
    translateX.value = withSpring(-6, { damping: 12, stiffness: 300 });
    onLongPress(item.id);
    setTimeout(() => {
      setLongPressed(false);
      translateX.value = withSpring(0, { damping: 12, stiffness: 300 });
    }, 800);
  };

  const year = item.releaseDate
    ? new Date(item.releaseDate).getFullYear()
    : null;

  // Rank number colour: gold for top 3
  const rankColor =
    rank === 1
      ? '#f59e0b'
      : rank === 2
      ? '#a1a1aa'
      : rank === 3
      ? '#b45309'
      : '#3f3f46';

  return (
    <Animated.View
      entering={FadeInLeft.delay(rank * 35).duration(380).springify()}
      style={animatedStyle}
    >
      <Pressable
        onPress={() => onPress?.(item)}
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        {/* Rank */}
        <View style={styles.rankWrapper}>
          <Text style={[styles.rank, { color: rankColor }]}>
            {rank <= 3 ? (
              <Text style={[styles.rank, { color: rankColor }]}>{rank}</Text>
            ) : (
              rank
            )}
          </Text>
        </View>

        {/* Poster thumbnail */}
        <View style={styles.thumbContainer}>
          {item.posterUrl ? (
            <Image
              source={{ uri: item.posterUrl }}
              style={styles.thumb}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={styles.thumbPlaceholderText}>{item.title[0]}</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>

          <View style={styles.metaRow}>
            {/* Type chip */}
            <View style={styles.typeChip}>
              {item.type === 'movie' ? (
                <Film size={10} color="#71717a" strokeWidth={2.5} />
              ) : (
                <Tv size={10} color="#71717a" strokeWidth={2.5} />
              )}
              <Text style={styles.typeText}>
                {item.type === 'movie' ? 'Movie' : 'TV'}
              </Text>
            </View>

            {year && <Text style={styles.metaSep}>·</Text>}
            {year && <Text style={styles.metaText}>{year}</Text>}

            {item.rating != null && item.rating > 0 && (
              <>
                <Text style={styles.metaSep}>·</Text>
                <Star size={10} color="#f59e0b" fill="#f59e0b" strokeWidth={0} />
                <Text style={styles.metaText}>{item.rating != null ? item.rating.toFixed(1) : '—'}</Text>
              </>
            )}
          </View>

          {/* Genres */}
          {item.genres && item.genres.length > 0 && (
            <Text style={styles.genres} numberOfLines={1}>
              {item.genres.slice(0, 3).join(', ')}
            </Text>
          )}
        </View>

        {/* Right side indicators */}
        <View style={styles.rightSide}>
          {longPressed ? (
            <View style={styles.deleteHint}>
              <Trash2 size={16} color="#ef4444" strokeWidth={2} />
            </View>
          ) : (
            <View style={styles.badges}>
              {item.verified && (
                <CheckCircle size={16} color="#22c55e" fill="#22c55e" strokeWidth={0} />
              )}
              {item.hasLocalFile && (
                <View style={styles.localDot} />
              )}
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  rankWrapper: {
    width: 28,
    alignItems: 'center',
  },
  rank: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  thumbContainer: {
    width: 44,
    height: 64,
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3f3f46',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 4,
  },
  typeText: {
    fontSize: 10,
    color: '#71717a',
    fontWeight: '600',
  },
  metaSep: {
    color: '#3f3f46',
    fontSize: 11,
  },
  metaText: {
    fontSize: 11,
    color: '#71717a',
  },
  genres: {
    fontSize: 11,
    color: '#52525b',
  },
  rightSide: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
  },
  badges: {
    alignItems: 'center',
    gap: 4,
  },
  deleteHint: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  localDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#60a5fa',
  },
});

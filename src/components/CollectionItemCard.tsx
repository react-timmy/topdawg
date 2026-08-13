/**
 * CollectionItemCard.tsx
 *
 * Rich poster card used inside the Collection detail grid view.
 * Shows the poster, title, year, verified badge, local-file badge,
 * and a subtle long-press hint overlay.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { CheckCircle, Film, Tv, Trash2 } from 'lucide-react-native';
import { CollectionItem } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// 3-column grid with 16px side padding and 10px gap
const CARD_WIDTH = (SCREEN_WIDTH - 32 - 20) / 3;
const CARD_HEIGHT = CARD_WIDTH * 1.5; // 2:3 poster ratio

interface CollectionItemCardProps {
  item: CollectionItem;
  index: number;
  onLongPress: (itemId: string) => void;
  onPress?: (item: CollectionItem) => void;
}

export function CollectionItemCard({
  item,
  index,
  onLongPress,
  onPress,
}: CollectionItemCardProps) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.94, { damping: 15, stiffness: 400 });
    setPressed(true);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
    setPressed(false);
  };

  const year = item.releaseDate
    ? new Date(item.releaseDate).getFullYear()
    : null;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 40).duration(400).springify()}
      style={[styles.wrapper, animatedStyle]}
    >
      <Pressable
        onPress={() => onPress?.(item)}
        onLongPress={() => onLongPress(item.id)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        delayLongPress={400}
      >
        {/* Poster */}
        <View style={styles.posterContainer}>
          {item.posterUrl ? (
            <Image
              source={{ uri: item.posterUrl }}
              style={styles.poster}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]}>
              <Text style={styles.placeholderLetter}>{item.title[0]}</Text>
            </View>
          )}

          {/* Long-press delete hint */}
          {pressed && (
            <View style={styles.deleteOverlay}>
              <Trash2 size={22} color="#ffffff" strokeWidth={2} />
            </View>
          )}

          {/* Top-right badges */}
          <View style={styles.badgeStack}>
            {item.verified && (
              <View style={styles.verifiedBadge}>
                <CheckCircle size={13} color="#ffffff" fill="#22c55e" strokeWidth={0} />
              </View>
            )}
            {item.hasLocalFile && (
              <View style={styles.localBadge}>
                {item.type === 'movie' ? (
                  <Film size={11} color="#ffffff" strokeWidth={2.5} />
                ) : (
                  <Tv size={11} color="#ffffff" strokeWidth={2.5} />
                )}
              </View>
            )}
          </View>
        </View>

        {/* Text */}
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {year && <Text style={styles.year}>{year}</Text>}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: CARD_WIDTH,
  },
  posterContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1c1c1e',
    marginBottom: 7,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27272a',
  },
  placeholderLetter: {
    fontSize: 36,
    fontWeight: '800',
    color: '#3f3f46',
  },
  deleteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(239,68,68,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeStack: {
    position: 'absolute',
    top: 5,
    right: 5,
    gap: 4,
    alignItems: 'flex-end',
  },
  verifiedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  localBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(96,165,250,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#e4e4e7',
    lineHeight: 16,
  },
  year: {
    fontSize: 10.5,
    color: '#52525b',
    marginTop: 2,
    fontWeight: '500',
  },
});

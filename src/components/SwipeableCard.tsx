import React from 'react';
import { StyleSheet, View, Text, Image } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
  Extrapolate,
} from 'react-native-reanimated';
import { watchlistService } from '../storage/watchlistService';

interface SwipeableCardProps {
  item: any;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
}

export function SwipeableCard({ item, onSwipeRight, onSwipeLeft }: SwipeableCardProps) {
  const x = useSharedValue(0);
  const rotation = useSharedValue(0);

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      x.value = e.translationX;
      rotation.value = interpolate(e.translationX, [-200, 200], [-30, 30]);
    })
    .onEnd((e) => {
      if (e.translationX > 100) {
        x.value = withSpring(800, {}, () => runOnJS(onSwipeRight)());
        runOnJS(watchlistService.addToWatchlist)(item);
      } else if (e.translationX < -100) {
        x.value = withSpring(-800, {}, () => runOnJS(onSwipeLeft)());
      } else {
        x.value = withSpring(0);
        rotation.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [10, 100], [0, 1], Extrapolate.CLAMP),
  }));

  const nopeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-10, -100], [0, 1], Extrapolate.CLAMP),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <Image source={{ uri: item.posterUrl }} style={styles.image} />
        <View style={styles.overlay}>
          <Text style={styles.title}>{item.title}</Text>
        </View>
        <Animated.View style={[styles.badge, styles.likeBadge, likeStyle]}>
          <Text style={styles.badgeText}>KEEP</Text>
        </Animated.View>
        <Animated.View style={[styles.badge, styles.nopeBadge, nopeStyle]}>
          <Text style={styles.badgeText}>DISMISS</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '90%',
    height: '70%',
    borderRadius: 20,
    backgroundColor: '#18181b',
    position: 'absolute',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  badge: {
    position: 'absolute',
    top: 50,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 3,
  },
  likeBadge: { left: 20, borderColor: '#10b981', transform: [{ rotate: '-20deg' }] },
  nopeBadge: { right: 20, borderColor: '#ef4444', transform: [{ rotate: '20deg' }] },
  badgeText: { fontSize: 24, fontWeight: '900', color: '#ffffff' }
});

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FolderHeart } from 'lucide-react-native';

export function CollectionsFab() {
  const nav = useNavigation<any>();

  // Use same outer sizing as ScanFab and the same floating icon size
  return (
    <View pointerEvents="box-none" style={[styles.outer, { right: -15, bottom: -21 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Collections"
        onPress={() => nav.navigate('Collections')}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
      >
        <FolderHeart size={26} color="#ffffff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    zIndex: 140,
    elevation: 140,
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  btn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 12,
  },
});

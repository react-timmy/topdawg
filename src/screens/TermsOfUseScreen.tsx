import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ExternalLink } from 'lucide-react-native';
import {
  APP_NAME, LAST_UPDATED, TERMS_VERSION,
  TERMS_OF_USE_URL, TERMS_OF_USE_SECTIONS,
} from '../legal/legalContent';

export function TermsOfUseScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
          <ChevronLeft size={22} color="#ffffff" strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.topBarTitle}>Terms of Use</Text>
        <Pressable onPress={() => Linking.openURL(TERMS_OF_USE_URL).catch(() => {})} hitSlop={12} style={styles.iconBtn}>
          <ExternalLink size={18} color="#60a5fa" strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{APP_NAME} Terms of Use</Text>
        <Text style={styles.meta}>Version {TERMS_VERSION} · Last updated {LAST_UPDATED}</Text>

        {TERMS_OF_USE_SECTIONS.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}

        <Pressable onPress={() => Linking.openURL(TERMS_OF_USE_URL).catch(() => {})} style={styles.link}>
          <ExternalLink size={14} color="#60a5fa" />
          <Text style={styles.linkText}>View online version</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { flex: 1, color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  scroll: { paddingHorizontal: 22, paddingTop: 24 },
  title: { color: '#ffffff', fontSize: 26, fontWeight: '900', letterSpacing: -0.6, marginBottom: 6 },
  meta: { color: '#52525b', fontSize: 13, marginBottom: 28 },
  section: { marginBottom: 24 },
  heading: { color: '#e4e4e7', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  body: { color: '#a1a1aa', fontSize: 14, lineHeight: 22 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 4 },
  linkText: { color: '#60a5fa', fontSize: 14, fontWeight: '600' },
});

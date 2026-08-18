import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { TabNavigator } from './TabNavigator';
import { ProfilePickerScreen } from '../screens/ProfilePickerScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { DetailsScreen } from '../screens/DetailsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { VideoPlayerScreen } from '../screens/VideoPlayerScreen';
import { PrivacyPolicyScreen } from '../screens/PrivacyPolicyScreen';
import { TermsOfUseScreen } from '../screens/TermsOfUseScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { WatchPartyScreen } from '../screens/WatchPartyScreen';
import { JoinWatchPartyScreen } from '../screens/JoinWatchPartyScreen';
import { CreatePartyScreen } from '../screens/CreatePartyScreen';
import { CollectionDetailScreen } from '../screens/CollectionDetailScreen';
import { CollectionsScreen } from '../screens/CollectionsScreen';
import { CollectionsSearchScreen } from '../screens/CollectionsSearchScreen';
import { PartyHubScreen } from '../screens/PartyHubScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AddToCollectionScreen } from '../screens/AddToCollectionScreen';
import { ShareCollectionScreen } from '../screens/ShareCollectionScreen';
import { ScannerScreen } from '../screens/ScannerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      // ProfilePicker is always the initial route — it replaces itself with
      // MainTabs once the user taps their profile card.
      initialRouteName="ProfilePicker"
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="ProfilePicker" component={ProfilePickerScreen} />
      <Stack.Screen
        name="MainTabs"
        component={TabNavigator}
        // No back gesture back to the picker — use replace() not navigate()
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="Scanner" component={ScannerScreen} />
      <Stack.Screen name="Search"        component={SearchScreen} />
      <Stack.Screen name="Details"       component={DetailsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="VideoPlayer"   component={VideoPlayerScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="TermsOfUse"    component={TermsOfUseScreen} />
      <Stack.Screen name="Settings"      component={SettingsScreen} />
      <Stack.Screen
        name="WatchParty"
        component={WatchPartyScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="JoinWatchParty"
        component={JoinWatchPartyScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="CreateParty"
        component={CreatePartyScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="PartyHub" component={PartyHubScreen} />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="Collections" component={CollectionsScreen} />
      <Stack.Screen name="CollectionsSearch" component={CollectionsSearchScreen} />
      <Stack.Screen
        name="CollectionDetail"
        component={CollectionDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="AddToCollection"
        component={AddToCollectionScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ShareCollection"
        component={ShareCollectionScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToNotificationsUpcoming() {
  if (!navigationRef.isReady()) {
    throw new Error('Navigation not ready');
  }
  navigationRef.navigate('Notifications', { initialTab: 'upcoming' });
}

export function navigateToScanner() {
  if (!navigationRef.isReady()) {
    throw new Error('Navigation not ready');
  }
  navigationRef.navigate('Scanner');
}

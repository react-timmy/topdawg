import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotificationTag = 'NEW_ARRIVAL' | 'NEW_EPISODE' | 'NEW_SEASON' | 'NOW_AVAILABLE' | 'DONT_MISS';

export interface InAppNotification {
  id: string;
  type: 'added' | 'upcoming';
  tag?: NotificationTag;
  title: string;
  body: string;
  mediaTitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  accentColor?: string;
  timestamp: string;
  read: boolean;
}

interface NotificationContextType {
  notifications: InAppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<InAppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);
const STORAGE_KEY = '@inapp_notifications';
const AUTO_DELETE_DAYS = 10;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  const cleanupOldNotifications = useCallback((items: InAppNotification[]) => {
    const now = Date.now();
    const threshold = AUTO_DELETE_DAYS * 24 * 60 * 60 * 1000;
    
    return items.filter((n) => {
      // Always keep 'upcoming' items
      if (n.type === 'upcoming') return true;
      
      // Keep others if they are newer than 10 days
      const age = now - new Date(n.timestamp).getTime();
      return age < threshold;
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        const items = JSON.parse(raw);
        const cleaned = cleanupOldNotifications(items);
        setNotifications(cleaned);
        if (cleaned.length !== items.length) {
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        }
      }
    });
  }, [cleanupOldNotifications]);

  const persist = useCallback((items: InAppNotification[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
  }, []);

  const addNotification = useCallback((n: Omit<InAppNotification, 'id' | 'timestamp' | 'read'>) => {
    setNotifications((prev) => {
      // Deduplicate: If an identical notification (by title and mediaTitle) exists, don't add it again.
      // This prevents "Upcoming" checks from flooding the inbox on every tab visit.
      const exists = prev.find(existing => 
        existing.title === n.title && 
        existing.mediaTitle === n.mediaTitle &&
        existing.type === n.type
      );
      if (exists) return prev;

      const next: InAppNotification = {
        ...n,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        read: false,
      };
      // Apply cleanup even to new additions just in case
      const updated = cleanupOldNotifications([next, ...prev].slice(0, 50));
      persist(updated);
      return updated;
    });
  }, [persist, cleanupOldNotifications]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      persist(updated);
      return updated;
    });
  }, [persist]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextType {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within <NotificationProvider>');
  return ctx;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal/legalContent';

const CONSENT_KEY = '@cinescan:legal_consent';

export interface LegalConsent {
  privacyVersion: string;
  termsVersion: string;
  acceptedAt: string;
}

export const legalConsentService = {
  async getConsent(): Promise<LegalConsent | null> {
    try {
      const raw = await AsyncStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LegalConsent;
      if (
        typeof parsed?.privacyVersion === 'string' &&
        typeof parsed?.termsVersion === 'string' &&
        typeof parsed?.acceptedAt === 'string'
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  },

  isUpToDate(consent: LegalConsent | null): boolean {
    if (!consent) return false;
    return (
      consent.privacyVersion === PRIVACY_VERSION &&
      consent.termsVersion === TERMS_VERSION
    );
  },

  async saveConsent(): Promise<void> {
    const record: LegalConsent = {
      privacyVersion: PRIVACY_VERSION,
      termsVersion: TERMS_VERSION,
      acceptedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  },

  async clearConsent(): Promise<void> {
    await AsyncStorage.removeItem(CONSENT_KEY);
  },

  async hasValidConsent(): Promise<boolean> {
    const consent = await legalConsentService.getConsent();
    return legalConsentService.isUpToDate(consent);
  },
};

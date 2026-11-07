import { useState, useEffect } from 'react';
import { onSnapshot, setDoc, getUserDoc } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StationProfile } from '../types';
import { updateAppBrand, getStoredStationName } from '../utils/dynamicBrand';

const defaultProfile: StationProfile = {
  stationName: 'ZAMZAM',
  ownerName: '',
  phone: '',
  address: '',
  initialInvestment: 0
};

export function useStationProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StationProfile>(() => {
    const cached = user?.uid
      ? localStorage.getItem(`station_name_${user.uid}`)
      : getStoredStationName();
    return { ...defaultProfile, stationName: cached || 'ZAMZAM' };
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(defaultProfile);
      setLoading(false);
      return;
    }

    const userCacheKey = `station_name_${user.uid}`;

    const unsub = onSnapshot(getUserDoc('appSettings', 'profile'), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Partial<StationProfile>;
        const stationName =
          data.stationName?.trim() ||
          localStorage.getItem(userCacheKey) ||
          'ZAMZAM';
        const merged: StationProfile = {
          ...defaultProfile,
          ...data,
          stationName,
        };
        setProfile(merged);
        try {
          localStorage.setItem(userCacheKey, stationName);
        } catch {}
        updateAppBrand(stationName);
      } else {
        const fallbackName = localStorage.getItem(userCacheKey) || 'ZAMZAM';
        setProfile({ ...defaultProfile, stationName: fallbackName });
        updateAppBrand(fallbackName);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const updateProfile = async (newProfile: StationProfile) => {
    if (!user) return;
    const nameToSet = newProfile.stationName?.trim() || 'ZAMZAM';
    const updated = { ...newProfile, stationName: nameToSet };

    try {
      localStorage.setItem(`station_name_${user.uid}`, nameToSet);
    } catch {}

    // Immediate UI and dynamic branding update
    setProfile(updated);
    updateAppBrand(nameToSet);

    // Save to Supabase PostgreSQL
    await setDoc(getUserDoc('appSettings', 'profile'), updated, { merge: true });
  };

  return { profile, updateProfile, loading };
}

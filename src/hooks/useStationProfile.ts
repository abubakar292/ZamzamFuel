import { useState, useEffect } from 'react';
import { onSnapshot, setDoc } from 'firebase/firestore';
import { getUserDoc } from '../lib/firebase';
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
    const cached = getStoredStationName();
    return { ...defaultProfile, stationName: cached || 'ZAMZAM' };
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      const cached = getStoredStationName();
      setProfile({ ...defaultProfile, stationName: cached || 'ZAMZAM' });
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(getUserDoc('appSettings', 'profile'), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Partial<StationProfile>;
        const merged: StationProfile = {
          ...defaultProfile,
          ...data,
          stationName: data.stationName || getStoredStationName() || 'ZAMZAM'
        };
        setProfile(merged);
        if (merged.stationName) {
          updateAppBrand(merged.stationName);
        }
      } else {
        const cached = getStoredStationName();
        setProfile({ ...defaultProfile, stationName: cached || 'ZAMZAM' });
      }
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const updateProfile = async (newProfile: StationProfile) => {
    if (!user) return;
    const nameToSet = newProfile.stationName?.trim() || 'ZAMZAM';
    const updated = { ...newProfile, stationName: nameToSet };
    
    // Immediate UI and dynamic branding update
    setProfile(updated);
    updateAppBrand(nameToSet);

    // Save to Firestore
    await setDoc(getUserDoc('appSettings', 'profile'), updated, { merge: true });
  };

  return { profile, updateProfile, loading };
}

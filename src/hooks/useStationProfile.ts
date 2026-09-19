import { useState, useEffect } from 'react';
import { onSnapshot, setDoc } from 'firebase/firestore';
import { getUserDoc } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { StationProfile } from '../types';

const defaultProfile: StationProfile = {
  stationName: 'ZAMZAM',
  ownerName: '',
  phone: '',
  address: '',
  initialInvestment: 0
};

export function useStationProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StationProfile>(defaultProfile);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(defaultProfile);
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(getUserDoc('appSettings', 'profile'), (doc) => {
      if (doc.exists()) {
        setProfile({ ...defaultProfile, ...doc.data() });
      } else {
        setProfile(defaultProfile);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const updateProfile = async (newProfile: StationProfile) => {
    if (!user) return;
    await setDoc(getUserDoc('appSettings', 'profile'), newProfile, { merge: true });
  };

  return { profile, updateProfile, loading };
}

import { useState, useEffect } from 'react';
import { onSnapshot, setDoc, getUserDoc, supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StationProfile } from '../types';

const defaultProfile: StationProfile = {
  stationName: 'FuelFlow',
  ownerName: '',
  phone: '',
  address: '',
  initialInvestment: 0,
};

// Shared in-memory cache so all mounted components stay in sync immediately
const memoryProfileCache: Record<string, StationProfile> = {};

function loadCachedProfile(uid?: string | null): StationProfile {
  if (!uid) return defaultProfile;
  if (memoryProfileCache[uid]) {
    return memoryProfileCache[uid];
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const fullRaw = localStorage.getItem(`station_profile_${uid}`);
      if (fullRaw) {
        const parsed = JSON.parse(fullRaw);
        if (parsed && typeof parsed === 'object') {
          const stationName = (parsed.stationName || '').trim() || 'FuelFlow';
          const merged: StationProfile = {
            ...defaultProfile,
            ...parsed,
            stationName,
          };
          memoryProfileCache[uid] = merged;
          return merged;
        }
      }
      const cachedName = localStorage.getItem(`station_name_${uid}`);
      if (cachedName && cachedName.trim()) {
        const merged = { ...defaultProfile, stationName: cachedName.trim() };
        memoryProfileCache[uid] = merged;
        return merged;
      }
    } catch {
      // ignore localStorage errors
    }
  }
  return defaultProfile;
}

function saveCachedProfile(uid: string, profile: StationProfile) {
  memoryProfileCache[uid] = profile;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`station_profile_${uid}`, JSON.stringify(profile));
      localStorage.setItem(`station_name_${uid}`, profile.stationName);
    } catch {
      // ignore quota errors
    }
  }
}

export function useStationProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StationProfile>(() =>
    loadCachedProfile(user?.uid)
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(defaultProfile);
      setLoading(false);
      return;
    }

    const uid = user.uid;
    const initialCached = loadCachedProfile(uid);
    setProfile(initialCached);

    const handleProfileEvent = (e: Event) => {
      const custom = e as CustomEvent<{ uid: string; profile: StationProfile }>;
      if (custom.detail?.uid === uid && custom.detail?.profile) {
        setProfile(custom.detail.profile);
      }
    };

    window.addEventListener('station_profile_updated', handleProfileEvent);

    const unsub = onSnapshot(getUserDoc('appSettings', 'profile'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<StationProfile>;
        const currentCached = loadCachedProfile(uid);
        const rawName =
          data.stationName?.trim() ||
          currentCached.stationName ||
          user.displayName?.trim() ||
          'FuelFlow';

        const merged: StationProfile = {
          ...defaultProfile,
          ...currentCached,
          ...data,
          stationName: rawName,
        };

        saveCachedProfile(uid, merged);
        setProfile((prev) =>
          JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged
        );
      } else {
        const fallback = loadCachedProfile(uid);
        setProfile((prev) =>
          JSON.stringify(prev) === JSON.stringify(fallback) ? prev : fallback
        );
      }
      setLoading(false);
    });

    return () => {
      window.removeEventListener('station_profile_updated', handleProfileEvent);
      unsub();
    };
  }, [user]);

  const updateProfile = async (newProfile: StationProfile) => {
    if (!user) return;
    const uid = user.uid;
    const nameToSet = (newProfile.stationName || '').trim() || 'FuelFlow';
    const updated: StationProfile = {
      ...defaultProfile,
      ...newProfile,
      stationName: nameToSet,
      initialInvestment: Number(newProfile.initialInvestment) || 0,
    };

    // 1. Update local cache and broadcast immediately to Navbar, Sidebar, Reports, etc.
    saveCachedProfile(uid, updated);
    setProfile(updated);
    window.dispatchEvent(
      new CustomEvent('station_profile_updated', {
        detail: { uid, profile: updated },
      })
    );

    // 2. Persist to Supabase PostgreSQL (fuel_station_records -> appSettings/profile)
    let savedToDb = false;
    try {
      await setDoc(getUserDoc('appSettings', 'profile'), updated, {
        merge: true,
      });
      savedToDb = true;
    } catch (dbErr) {
      console.warn('Could not save profile to fuel_station_records:', dbErr);
    }

    // 3. Also persist to Supabase Auth user metadata as backup
    try {
      await supabase.auth.updateUser({
        data: {
          display_name: nameToSet,
          station_name: nameToSet,
          owner_name: updated.ownerName || '',
          phone: updated.phone || '',
          address: updated.address || '',
        },
      });
    } catch (authErr) {
      if (!savedToDb) {
        console.warn('Could not update auth metadata:', authErr);
      }
    }
  };

  return { profile, updateProfile, loading };
}

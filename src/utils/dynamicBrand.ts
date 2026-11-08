// App branding utility:
// Keeps the official FuelFlow logo and FuelFlow name for app icons, homescreen shortcuts, and loading screen.
// Station/shop name is managed separately in useStationProfile for the navbar and reports/PDFs.

export const OFFICIAL_LOGO_URL = '/assets/aistudio/Green__Pink_Simple_Vintage_Retro_Typographic_Out_of_Space_Logo_acd5c053.png';

export function getStoredStationName(): string {
  return 'FuelFlow';
}

export function getStoredStationIcon(): string {
  return OFFICIAL_LOGO_URL;
}

export function generateStationIcon(_stationName?: string, _size = 512): string {
  return OFFICIAL_LOGO_URL;
}

export function updateAppBrand(_stationName?: string): { icon192: string; icon512: string } {
  return { icon192: OFFICIAL_LOGO_URL, icon512: OFFICIAL_LOGO_URL };
}

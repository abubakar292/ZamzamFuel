// Utility to dynamically update app branding across:
// 1. Loading screen splash title
// 2. Homescreen icon (Official FuelFlow logo or dynamic Canvas-generated FuelFlow-styled icon)
// 3. Apple Touch Icon & Favicon
// 4. Web App Manifest (PWA home screen shortcut name & icons)
// 5. Document title and OpenGraph / Apple mobile meta tags

export const OFFICIAL_LOGO_URL = '/assets/aistudio/Green__Pink_Simple_Vintage_Retro_Typographic_Out_of_Space_Logo_acd5c053.png';

export function getStoredStationName(): string {
  if (typeof window === 'undefined') return 'FuelFlow';
  const stored = localStorage.getItem('station_name');
  if (!stored || stored.toUpperCase() === 'ZAMZAM' || stored.toUpperCase() === 'ZAMZAM FUEL STATION') {
    return 'FuelFlow';
  }
  return stored;
}

export function getStoredStationIcon(): string | null {
  if (typeof window === 'undefined') return OFFICIAL_LOGO_URL;
  const name = getStoredStationName();
  if (name.toUpperCase() === 'FUELFLOW') {
    return OFFICIAL_LOGO_URL;
  }
  return localStorage.getItem('station_icon_url') || OFFICIAL_LOGO_URL;
}

/**
 * Draws a high-definition 512x512 or 192x192 app icon matching the official FuelFlow logo:
 * - Solid #E00000 FuelFlow red background
 * - Crisp white circular ring in the upper-center
 * - White fuel pump dispenser with nozzle & hose inside the circle
 * - Bold condensed white wordmark below (defaults to "FuelFlow" or custom Station Name)
 */
export function generateStationIcon(stationName: string, size = 512): string {
  if (typeof document === 'undefined') return OFFICIAL_LOGO_URL;

  const rawName = (stationName || '').trim();
  const displayName =
    !rawName || rawName.toUpperCase() === 'ZAMZAM' || rawName.toUpperCase() === 'FUELFLOW'
      ? 'FuelFlow'
      : rawName;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return OFFICIAL_LOGO_URL;

  const scale = size / 512;

  // 1. Solid #1B2A4A Deep Midnight Navy background
  ctx.fillStyle = '#1B2A4A';
  ctx.fillRect(0, 0, size, size);

  // 2. White Circle Ring (centered at X=256, Y=200, radius=92)
  const cx = 256 * scale;
  const cy = 198 * scale;
  const circleRadius = 92 * scale;

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 7.5 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 3. White Fuel Pump Dispenser & Nozzle inside the circle
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#FFFFFF';

  // Pump main body (rounded top rectangle)
  const bodyX = 222 * scale;
  const bodyY = 152 * scale;
  const bodyW = 46 * scale;
  const bodyH = 84 * scale;
  ctx.beginPath();
  ctx.roundRect(bodyX, bodyY, bodyW, bodyH, [12 * scale, 12 * scale, 0, 0]);
  ctx.fill();

  // Pump screen cutout (#1B2A4A)
  ctx.fillStyle = '#1B2A4A';
  ctx.beginPath();
  ctx.roundRect(231 * scale, 163 * scale, 28 * scale, 25 * scale, 2 * scale);
  ctx.fill();

  // Pump base platform (white pill)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(213 * scale, 232 * scale, 64 * scale, 11 * scale, 5.5 * scale);
  ctx.fill();

  // Hose & Nozzle on the right side of the pump
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 6.5 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Hose loop from side of pump down and up to nozzle
  ctx.beginPath();
  ctx.moveTo(268 * scale, 184 * scale);
  ctx.lineTo(278 * scale, 188 * scale);
  ctx.lineTo(278 * scale, 228 * scale);
  ctx.arc(284.5 * scale, 228 * scale, 6.5 * scale, Math.PI, 0, true);
  ctx.lineTo(291 * scale, 158 * scale);
  ctx.lineTo(273 * scale, 140 * scale);
  ctx.stroke();

  // Nozzle trigger guard detail
  ctx.lineWidth = 4.5 * scale;
  ctx.beginPath();
  ctx.moveTo(281 * scale, 148 * scale);
  ctx.lineTo(281 * scale, 162 * scale);
  ctx.lineTo(291 * scale, 168 * scale);
  ctx.stroke();

  // 4. Bold Condensed White Title ("FuelFlow" or custom Station Name)
  let fontSize = 86 * scale;
  if (displayName.length > 20) {
    fontSize = 42 * scale;
  } else if (displayName.length > 14) {
    fontSize = 54 * scale;
  } else if (displayName.length > 10) {
    fontSize = 68 * scale;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 ${fontSize}px Impact, "Arial Black", "Inter", system-ui, sans-serif`;

  ctx.fillText(displayName, size / 2, 355 * scale, size - 48 * scale);

  return canvas.toDataURL('image/png');
}

let activeManifestUrl: string | null = null;

/**
 * Updates application branding across the DOM, title, meta tags,
 * apple-touch-icon, favicon, web app manifest, and local storage.
 */
export function updateAppBrand(stationName: string): { icon192: string; icon512: string } {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { icon192: OFFICIAL_LOGO_URL, icon512: OFFICIAL_LOGO_URL };
  }

  const rawName = (stationName || '').trim();
  const cleanName =
    !rawName || rawName.toUpperCase() === 'ZAMZAM' || rawName.toUpperCase() === 'ZAMZAM FUEL STATION'
      ? 'FuelFlow'
      : rawName;

  const isDefaultFuelFlow = cleanName.toUpperCase() === 'FUELFLOW';

  // 1. Save to local storage for immediate access on boot
  try {
    localStorage.setItem('station_name', cleanName);
  } catch (err) {
    console.error('Failed to store station name in localStorage', err);
  }

  // 2. Update Document Title
  document.title = isDefaultFuelFlow ? 'FuelFlow Management' : `${cleanName} — FuelFlow`;

  // 3. Update Meta Tags
  const updateMeta = (selector: string, attr: string, value: string) => {
    let el = document.querySelector(selector) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement('meta');
      const parts = selector.replace(/[\[\]"]/g, '').split('=');
      if (parts[0] && parts[1]) {
        el.setAttribute(parts[0], parts[1]);
      }
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  };

  updateMeta('meta[name="theme-color"]', 'content', '#1B2A4A');
  updateMeta('meta[name="apple-mobile-web-app-title"]', 'content', cleanName);
  updateMeta('meta[property="og:title"]', 'content', `${cleanName} Fuel Management`);
  updateMeta('meta[name="description"]', 'content', `${cleanName} fuel station management powered by FuelFlow.`);
  updateMeta('meta[property="og:description"]', 'content', `${cleanName} fuel station management powered by FuelFlow.`);

  // 4. Use official FuelFlow PNG asset when default, or custom FuelFlow-styled icon when station name is customized
  const icon512 = isDefaultFuelFlow ? OFFICIAL_LOGO_URL : generateStationIcon(cleanName, 512);
  const icon192 = isDefaultFuelFlow ? OFFICIAL_LOGO_URL : generateStationIcon(cleanName, 192);

  if (icon192) {
    try {
      localStorage.setItem('station_icon_url', icon192);
      localStorage.setItem('station_icon_512_url', icon512);
    } catch (e) {
      // ignore storage quota errors
    }

    // 5. Update Apple Touch Icon
    let appleTouchLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (!appleTouchLink) {
      appleTouchLink = document.createElement('link');
      appleTouchLink.rel = 'apple-touch-icon';
      document.head.appendChild(appleTouchLink);
    }
    appleTouchLink.href = icon512;

    // 6. Update Favicons
    const faviconLinks = document.querySelectorAll('link[rel*="icon"]');
    faviconLinks.forEach((link) => {
      (link as HTMLLinkElement).href = icon192;
    });

    // 7. Update Web App Manifest dynamically for home screen shortcuts
    try {
      const origin = window.location.origin;
      const resolveUrl = (u: string) => (u.startsWith('data:') || u.startsWith('http') ? u : `${origin}${u}`);

      const dynamicManifest = {
        id: '/',
        name: isDefaultFuelFlow ? 'FuelFlow Management' : `${cleanName} Fuel Management`,
        short_name: cleanName.slice(0, 12),
        description: `Official FuelFlow management application for ${cleanName}.`,
        theme_color: '#1B2A4A',
        background_color: '#1B2A4A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: `${origin}/`,
        scope: `${origin}/`,
        icons: [
          {
            src: resolveUrl(icon192),
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: resolveUrl(icon512),
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: resolveUrl(icon512),
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      };

      if (activeManifestUrl) {
        URL.revokeObjectURL(activeManifestUrl);
      }

      const blob = new Blob([JSON.stringify(dynamicManifest)], { type: 'application/manifest+json' });
      activeManifestUrl = URL.createObjectURL(blob);

      let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (!manifestLink) {
        manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        document.head.appendChild(manifestLink);
      }
      manifestLink.href = activeManifestUrl;
    } catch (err) {
      console.error('Error creating dynamic manifest Blob:', err);
    }

    // 8. Dispatch event so any reactive component can update immediately
    window.dispatchEvent(
      new CustomEvent('station_brand_changed', {
        detail: { stationName: cleanName, iconUrl: icon192, icon512Url: icon512 }
      })
    );
  }

  return { icon192, icon512 };
}

// Auto-initialize on import if window is present
if (typeof window !== 'undefined') {
  const initialName = getStoredStationName();
  setTimeout(() => {
    updateAppBrand(initialName);
  }, 50);
}

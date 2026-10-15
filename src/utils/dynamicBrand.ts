// Utility to dynamically update app branding across:
// 1. Loading screen splash title
// 2. Homescreen icon (dynamic Canvas-generated high-res icon)
// 3. Apple Touch Icon & Favicon
// 4. Web App Manifest (PWA home screen shortcut name & icons)
// 5. Document title and OpenGraph / Apple mobile meta tags

export function getStoredStationName(): string {
  if (typeof window === 'undefined') return 'ZAMZAM';
  return localStorage.getItem('station_name') || 'ZAMZAM';
}

export function getStoredStationIcon(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('station_icon_url');
}

/**
 * Draws a high-definition 512x512 or 192x192 app icon with:
 * - Rich navy/sapphire gradient background with subtle gold framing
 * - Vibrant amber fuel flame badge
 * - The Station Name rendered in crisp, bold, uppercase typography
 * - Clean "FUEL MANAGEMENT" tracking sub-label
 */
export function generateStationIcon(stationName: string, size = 512): string {
  if (typeof document === 'undefined') return '';
  
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const scale = size / 512;
  const cleanName = (stationName.trim() || 'ZAMZAM').toUpperCase();

  // 1. Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  bgGrad.addColorStop(0, '#1A3C6E');
  bgGrad.addColorStop(0.5, '#132F57');
  bgGrad.addColorStop(1, '#0B1A32');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle corner radius clipping (for preview or maskable view)
  // Outer subtle golden border
  ctx.strokeStyle = 'rgba(232, 160, 32, 0.45)';
  ctx.lineWidth = 8 * scale;
  ctx.strokeRect(10 * scale, 10 * scale, size - 20 * scale, size - 20 * scale);

  // Center radial glow
  const glow = ctx.createRadialGradient(
    size / 2, 175 * scale, 15 * scale,
    size / 2, 175 * scale, 150 * scale
  );
  glow.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
  glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, 340 * scale);

  // 2. Emblem Badge (Golden Flame Container)
  const badgeSize = 136 * scale;
  const badgeX = (size - badgeSize) / 2;
  const badgeY = 80 * scale;
  const radius = 34 * scale;

  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeSize, badgeY + badgeSize);
  badgeGrad.addColorStop(0, '#F59E0B');
  badgeGrad.addColorStop(1, '#D97706');
  ctx.fillStyle = badgeGrad;

  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 3.5 * scale;
  ctx.stroke();

  // Flame Icon inside badge
  ctx.save();
  ctx.translate(size / 2, badgeY + badgeSize / 2);
  const flameScale = scale * 1.7;
  ctx.scale(flameScale, flameScale);
  ctx.fillStyle = '#FFFFFF';

  // Flame outline path
  const flamePath = new Path2D(
    'M0 -22 C-6 -10 -18 -2 -18 10 C-18 20 -10 26 0 26 C10 26 18 20 18 10 C18 3 12 -4 8 -8 C7 2 3 6 0 7 C-2 3 -1 -4 0 -7 C2 -11 0 -18 0 -22 Z'
  );
  ctx.fill(flamePath);

  // Inner flame highlight
  const innerFlameGrad = ctx.createLinearGradient(0, -2, 0, 22);
  innerFlameGrad.addColorStop(0, '#FEF08A');
  innerFlameGrad.addColorStop(1, '#F59E0B');
  ctx.fillStyle = innerFlameGrad;
  const innerFlame = new Path2D(
    'M0 6 C-3 10 -6 14 -6 18 C-6 22 -3 24 0 24 C3 24 6 22 6 18 C6 14 3 10 0 6 Z'
  );
  ctx.fill(innerFlame);
  ctx.restore();

  // 3. Station Name
  // Calculate dynamic font size to fit cleanly on the icon
  let fontSize = 38 * scale;
  if (cleanName.length > 22) {
    fontSize = 22 * scale;
  } else if (cleanName.length > 16) {
    fontSize = 26 * scale;
  } else if (cleanName.length > 11) {
    fontSize = 31 * scale;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fontSize}px "Inter", system-ui, -apple-system, sans-serif`;

  // Draw soft drop shadow for crisp readability
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 10 * scale;
  ctx.shadowOffsetY = 3 * scale;
  ctx.fillStyle = '#FFFFFF';

  const nameY = 282 * scale;
  ctx.fillText(cleanName, size / 2, nameY, size - 44 * scale);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // 4. Subtitle: "FUEL MANAGEMENT"
  ctx.font = `700 ${14.5 * scale}px "Inter", system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#FBBF24'; // amber-400
  ctx.fillText('FUEL MANAGEMENT', size / 2, 332 * scale);

  // 5. Bottom badge pill
  const pillW = 200 * scale;
  const pillH = 30 * scale;
  const pillX = (size - pillW) / 2;
  const pillY = 380 * scale;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 15 * scale);
  ctx.fill();

  ctx.strokeStyle = 'rgba(232, 160, 32, 0.35)';
  ctx.lineWidth = 1.5 * scale;
  ctx.stroke();

  ctx.font = `700 ${11 * scale}px "Inter", system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('1-TAP SHORTCUT', size / 2, pillY + pillH / 2);

  return canvas.toDataURL('image/png');
}

let activeManifestUrl: string | null = null;

/**
 * Updates application branding across the DOM, title, meta tags,
 * apple-touch-icon, favicon, web app manifest, and local storage.
 */
export function updateAppBrand(stationName: string): { icon192: string; icon512: string } {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { icon192: '', icon512: '' };
  }

  const cleanName = (stationName || '').trim() || 'ZAMZAM';

  // 1. Save to local storage for immediate access on boot
  try {
    localStorage.setItem('station_name', cleanName);
  } catch (err) {
    console.error('Failed to store station name in localStorage', err);
  }

  // 2. Update Document Title
  document.title = `${cleanName} Fuel Management`;

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

  updateMeta('meta[name="apple-mobile-web-app-title"]', 'content', cleanName);
  updateMeta('meta[property="og:title"]', 'content', `${cleanName} Fuel Management`);
  updateMeta('meta[name="description"]', 'content', `Web version of the ${cleanName} Fuel Management system with real-time sync.`);
  updateMeta('meta[property="og:description"]', 'content', `Web version of the ${cleanName} Fuel Management system with real-time sync.`);

  // 4. Generate dynamic brand icons
  const icon512 = generateStationIcon(cleanName, 512);
  const icon192 = generateStationIcon(cleanName, 192);

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
      const dynamicManifest = {
        id: '/',
        name: `${cleanName} Fuel Management`,
        short_name: cleanName,
        description: `Official management application for ${cleanName}.`,
        theme_color: '#1A3C6E',
        background_color: '#0F2548',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: icon192,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: icon512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: icon512,
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
  const initialName = localStorage.getItem('station_name');
  if (initialName) {
    // Run after DOM loaded or microtask
    setTimeout(() => {
      updateAppBrand(initialName);
    }, 50);
  }
}

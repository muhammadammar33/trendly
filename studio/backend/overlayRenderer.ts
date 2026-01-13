/**
 * Overlay Renderer
 * 
 * Generates FFmpeg filter expressions for:
 * - Bottom banner (drawbox + drawtext)
 * - QR code overlay
 * - End screen
 */

import { BottomBanner, QRCode, EndScreen } from '../types';
import * as path from 'path';

/**
 * Generate FFmpeg filter for bottom banner
 */
export function generateBannerFilter(
  banner: BottomBanner,
  videoWidth: number = 1920,
  videoHeight: number = 1080
): string | null {
  if (!banner.enabled || !banner.text) return null;

  const bannerHeight = 100;
  const y = banner.position === 'bottom' ? videoHeight - bannerHeight : 0;

  // Escape special characters in text
  const escapedText = banner.text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');

  // Draw background box
  const boxFilter = `drawbox=x=0:y=${y}:w=${videoWidth}:h=${bannerHeight}:color=${banner.backgroundColor}:t=fill`;

  // Draw text centered
  const textY = y + (bannerHeight - banner.fontSize) / 2;
  const textFilter = `drawtext=text='${escapedText}':fontsize=${banner.fontSize}:fontcolor=${banner.textColor}:x=(w-text_w)/2:y=${textY}`;

  return `${boxFilter},${textFilter}`;
}

/**
 * Generate FFmpeg filter for QR code overlay
 */
export function generateQRFilter(
  qr: QRCode,
  qrImagePath: string,
  videoWidth: number = 1920,
  videoHeight: number = 1080
): string | null {
  if (!qr.enabled || !qr.url) return null;

  // Calculate position
  let x = 0;
  let y = 0;
  const padding = 20;

  switch (qr.position) {
    case 'top-left':
      x = padding;
      y = padding;
      break;
    case 'top-right':
      x = videoWidth - qr.size - padding;
      y = padding;
      break;
    case 'bottom-left':
      x = padding;
      y = videoHeight - qr.size - padding;
      break;
    case 'bottom-right':
      x = videoWidth - qr.size - padding;
      y = videoHeight - qr.size - padding;
      break;
  }

  // Overlay filter
  return `movie=${qrImagePath}:loop=0,setpts=N/(FRAME_RATE*TB)[qr];[in][qr]overlay=${x}:${y}[out]`;
}

/**
 * Generate FFmpeg filter for end screen
 */
export function generateEndScreenFilter(
  endScreen: EndScreen,
  videoWidth: number = 1920,
  videoHeight: number = 1080
): string | null {
  if (!endScreen.enabled) return null;

  if (endScreen.type === 'text') {
    const filters: string[] = [];
    
    // White background (always white for this design)
    filters.push(`drawbox=x=0:y=0:w=${videoWidth}:h=${videoHeight}:color=#FFFFFF:t=fill`);
    
    // Company name at top center (e.g., "SAPPHIRE")
    if (endScreen.companyName && endScreen.companyName.trim()) {
      const companyNameEscaped = endScreen.companyName
        .replace(/\\/g, '\\\\\\\\')
        .replace(/'/g, "\\\\'")
        .replace(/:/g, '\\\\:');
      
      filters.push(
        `drawtext=text='${companyNameEscaped}':fontsize=72:fontcolor=${endScreen.textColor}:` +
        `x=(w-text_w)/2:y=120:font=Arial:fontfile=/Windows/Fonts/arial.ttf`
      );
    }
    
    // Phone number in large orange text (center of screen)
    if (endScreen.phoneNumber && endScreen.phoneNumber.trim()) {
      const phoneEscaped = endScreen.phoneNumber
        .replace(/\\/g, '\\\\\\\\')
        .replace(/'/g, "\\\\'")
        .replace(/:/g, '\\\\:');
      
      filters.push(
        `drawtext=text='${phoneEscaped}':fontsize=140:fontcolor=${endScreen.phoneNumberColor}:` +
        `x=(w-text_w)/2:y=(h-text_h)/2:font=Arial Bold:fontfile=/Windows/Fonts/arialbd.ttf`
      );
    }
    
    // Website link at bottom center with chain icon
    if (endScreen.websiteLink && endScreen.websiteLink.trim()) {
      const linkEscaped = endScreen.websiteLink
        .replace(/\\/g, '\\\\\\\\')
        .replace(/'/g, "\\\\'")
        .replace(/:/g, '\\\\:');
      
      // Chain icon (🔗) + website link
      const linkText = `🔗 ${linkEscaped}`;
      const linkTextEscaped = linkText
        .replace(/\\/g, '\\\\\\\\')
        .replace(/'/g, "\\\\'")
        .replace(/:/g, '\\\\:');
      
      filters.push(
        `drawtext=text='${linkTextEscaped}':fontsize=48:fontcolor=${endScreen.textColor}:` +
        `x=(w-text_w)/2:y=h-180:font=Arial:fontfile=/Windows/Fonts/arial.ttf`
      );
    }

    return filters.join(',');
  } else if (endScreen.type === 'image') {
    // Will be handled as a separate input
    return null;
  }

  return null;
}

/**
 * Build complete filter complex for video rendering
 */
export function buildFilterComplex(
  slides: Array<{ inputIndex: number }>,
  banner: BottomBanner | null,
  qrImagePath: string | null,
  qr: QRCode | null,
  videoWidth: number = 1920,
  videoHeight: number = 1080
): string {
  const filters: string[] = [];

  // Scale and pad all slide images to video size
  slides.forEach((slide, i) => {
    filters.push(
      `[${slide.inputIndex}:v]scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=decrease,` +
      `pad=${videoWidth}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:black[v${i}]`
    );
  });

  // Crossfade transitions between slides
  if (slides.length > 1) {
    let current = '[v0]';
    
    for (let i = 0; i < slides.length - 1; i++) {
      const next = `[v${i + 1}]`;
      const output = i === slides.length - 2 ? '[vout]' : `[vt${i}]`;
      
      // Crossfade for 0.5 seconds
      filters.push(`${current}${next}xfade=transition=fade:duration=0.5:offset=${(i + 1) * 3 - 0.5}${output}`);
      
      current = i === slides.length - 2 ? '[vout]' : `[vt${i}]`;
    }
  } else if (slides.length === 1) {
    filters.push('[v0]copy[vout]');
  }

  // Add banner overlay
  if (banner) {
    const bannerFilter = generateBannerFilter(banner, videoWidth, videoHeight);
    if (bannerFilter) {
      filters.push(`[vout]${bannerFilter}[vout]`);
    }
  }

  // Add QR code overlay
  if (qr && qrImagePath) {
    const qrFilter = generateQRFilter(qr, qrImagePath, videoWidth, videoHeight);
    if (qrFilter) {
      // This needs special handling in the main renderer
      filters.push(`[vout]overlay=${qrFilter}[vout]`);
    }
  }

  return filters.join(';');
}

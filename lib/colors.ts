/**
 * Color extraction utilities
 */

import * as cheerio from 'cheerio';

export interface BrandColor {
  hex: string;
  source: 'cssVar' | 'inline' | 'stylesheet' | 'fallback';
}

/**
 * Extract prominent colors from HTML
 */
export function extractColors(html: string, $?: cheerio.CheerioAPI): BrandColor[] {
  const colors = new Set<string>();
  const colorResults: BrandColor[] = [];
  
  if (!$) {
    $ = cheerio.load(html);
  }

  // 1. Extract CSS custom properties (variables)
  const styleText = $('style').text();
  const cssVarRegex = /--([\w-]*(?:color|primary|secondary|accent|brand)[\w-]*):\s*(#[0-9a-f]{3,6}|rgb[a]?\([^)]+\))/gi;
  let match;
  
  while ((match = cssVarRegex.exec(styleText)) !== null) {
    const color = normalizeColor(match[2]);
    if (color && !colors.has(color)) {
      colors.add(color);
      colorResults.push({ hex: color, source: 'cssVar' });
    }
  }

  // 2. Extract inline styles
  $('[style]').each((_, elem) => {
    const style = $(elem).attr('style') || '';
    const colorMatches = style.match(/(?:background-color|color|border-color):\s*(#[0-9a-f]{3,6}|rgb[a]?\([^)]+\))/gi);
    
    if (colorMatches) {
      colorMatches.forEach((m) => {
        const color = normalizeColor(m.split(':')[1]);
        if (color && !colors.has(color) && !isCommonColor(color)) {
          colors.add(color);
          colorResults.push({ hex: color, source: 'inline' });
        }
      });
    }
  });

  // 3. Look for common color patterns in stylesheets
  const colorRegex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  const styleColors = styleText.match(colorRegex);
  
  if (styleColors) {
    styleColors.slice(0, 10).forEach((color) => {
      const normalized = normalizeColor(color);
      if (normalized && !colors.has(normalized) && !isCommonColor(normalized)) {
        colors.add(normalized);
        colorResults.push({ hex: normalized, source: 'stylesheet' });
      }
    });
  }

  // 4. Fallback: common brand colors if we didn't find enough
  if (colorResults.length === 0) {
    colorResults.push({ hex: '#0066cc', source: 'fallback' });
  }

  // Return top 5 unique colors
  return colorResults.slice(0, 5);
}

/**
 * Normalize color to hex format
 */
function normalizeColor(color: string): string | null {
  if (!color) return null;
  
  const trimmed = color.trim().toLowerCase();
  
  // Already hex
  if (trimmed.match(/^#[0-9a-f]{6}$/)) {
    return trimmed.toUpperCase();
  }
  
  // Short hex
  if (trimmed.match(/^#[0-9a-f]{3}$/)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  
  // RGB/RGBA
  const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toUpperCase();
  }
  
  return null;
}

/**
 * Check if color is too common (white, black, grey)
 */
function isCommonColor(hex: string): boolean {
  const common = [
    '#FFFFFF', '#000000', // Pure white/black
    '#FFF', '#000',
    '#F0F0F0', '#EEEEEE', '#E0E0E0', '#DDDDDD', // Light greys
    '#CCCCCC', '#C0C0C0', '#AAAAAA', '#999999', // Mid greys
    '#888888', '#777777', '#666666', '#555555', // Dark greys
    '#444444', '#333333', '#222222', '#111111',
  ];
  
  return common.includes(hex.toUpperCase());
}

/**
 * Calculate brightness (0-255)
 */
export function getBrightness(hex: string): number {
  const rgb = hex.match(/[0-9a-f]{2}/gi);
  if (!rgb) return 0;
  
  const r = parseInt(rgb[0], 16);
  const g = parseInt(rgb[1], 16);
  const b = parseInt(rgb[2], 16);
  
  return (r * 299 + g * 587 + b * 114) / 1000;
}

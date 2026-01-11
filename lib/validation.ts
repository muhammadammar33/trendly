/**
 * URL validation and SSRF protection utilities
 */

const BLOCKED_PATTERNS = [
  // Localhost variations
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i,
  // Private IP ranges
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}/,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}/,
  // Link-local
  /^https?:\/\/169\.254\.\d{1,3}\.\d{1,3}/,
  // Loopback IPv6
  /^https?:\/\/\[::1\]/i,
  /^https?:\/\/\[::ffff:127\.0\.0\.1\]/i,
  // Non-HTTP protocols
  /^(file|ftp|data|javascript|about):/i,
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  'metadata.google.internal', // GCP metadata
  '169.254.169.254', // AWS/Azure metadata
]);

export interface ValidationResult {
  valid: boolean;
  error?: string;
  normalizedUrl?: string;
}

/**
 * Validate and sanitize a URL with SSRF protection
 */
export function validateUrl(input: string): ValidationResult {
  // Basic validation
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  // Parse URL
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Protocol validation
  if (!['http:', 'https:'].includes(url.protocol)) {
    return {
      valid: false,
      error: 'Only HTTP and HTTPS protocols are allowed',
    };
  }

  // Check against blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        error: 'URL is blocked for security reasons (SSRF protection)',
      };
    }
  }

  // Check hostname
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      error: 'Hostname is blocked for security reasons',
    };
  }

  // Additional IP-based checks
  if (isPrivateIP(hostname)) {
    return {
      valid: false,
      error: 'Private IP addresses are not allowed',
    };
  }

  return {
    valid: true,
    normalizedUrl: url.href,
  };
}

/**
 * Check if a hostname is a private IP address
 */
function isPrivateIP(hostname: string): boolean {
  // IPv4 regex
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);
  
  if (!match) {
    return false;
  }

  const octets = [
    parseInt(match[1]),
    parseInt(match[2]),
    parseInt(match[3]),
    parseInt(match[4]),
  ];

  // Validate octets
  if (octets.some((o) => o < 0 || o > 255)) {
    return false;
  }

  // Check private ranges
  // 10.0.0.0/8
  if (octets[0] === 10) return true;
  
  // 172.16.0.0/12
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  
  // 192.168.0.0/16
  if (octets[0] === 192 && octets[1] === 168) return true;
  
  // 127.0.0.0/8 (loopback)
  if (octets[0] === 127) return true;
  
  // 169.254.0.0/16 (link-local)
  if (octets[0] === 169 && octets[1] === 254) return true;

  return false;
}

/**
 * Normalize a relative URL to absolute
 */
export function normalizeUrl(url: string, baseUrl: string): string {
  if (!url) return '';
  
  // Trim and clean URL
  url = url.trim();
  
  // Remove URL fragments and excessive whitespace
  url = url.split('#')[0].trim();
  
  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      // Validate and clean the URL
      const parsed = new URL(url);
      return parsed.href;
    } catch (e) {
      return '';
    }
  }
  
  // Protocol-relative
  if (url.startsWith('//')) {
    try {
      const base = new URL(baseUrl);
      const fullUrl = `${base.protocol}${url}`;
      // Validate the constructed URL
      new URL(fullUrl);
      return fullUrl;
    } catch (e) {
      return '';
    }
  }
  
  // Data URIs - validate and return as-is
  if (url.startsWith('data:')) {
    return url;
  }
  
  // Absolute path or relative
  try {
    const resolved = new URL(url, baseUrl);
    return resolved.href;
  } catch (e) {
    console.warn(`[normalizeUrl] Failed to normalize: ${url} with base ${baseUrl}`);
    return '';
  }
}

# Vercel Deployment Guide

## Quick Setup

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy
```bash
vercel
```

## Environment Variables

Add these to your Vercel project settings (Settings → Environment Variables):

### Required:
- `GROQ_API_KEY` - Your Groq API key for AI script generation
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage token (for file uploads)

### Optional:
- `BROWSERBASE_API_KEY` - For Playwright browser automation
- `BROWSERBASE_PROJECT_ID` - Your BrowserBase project

## Important Limitations on Vercel

### ⚠️ Video Rendering
- **Problem**: FFmpeg video rendering may timeout on Vercel (60s max on Pro plan)
- **Solutions**:
  1. **Recommended**: Disable video download, keep preview only
  2. Use external service (Railway, Render) for video rendering
  3. Upgrade to Vercel Pro for 60s timeout

### ⚠️ File Storage
- **Problem**: Local file storage doesn't persist on Vercel
- **Solution**: Files are now configured to use Vercel Blob Storage
- Install: `npm install @vercel/blob`

### ⚠️ Playwright Browser
- **Problem**: Chromium browser is too large for Vercel
- **Solutions**:
  1. Falls back to Cheerio static scraping (already implemented)
  2. Use BrowserBase for JavaScript-heavy sites (optional)

## Post-Deployment Steps

### 1. Set up Vercel Blob Storage
```bash
npm install @vercel/blob
```

Then add `BLOB_READ_WRITE_TOKEN` to your Vercel environment variables.

### 2. Disable Video Download (Recommended)
Since video rendering may timeout, consider:
- Keeping only the preview functionality
- Or setting up a separate service for video rendering

### 3. Test Scraping
- Most sites work with Cheerio (static scraping)
- JavaScript-heavy sites may need BrowserBase integration

## File Structure on Vercel

```
Vercel Serverless Functions:
├── app/api/scrape/route.ts (30s timeout)
├── app/api/studio/*/route.ts (60s timeout)
└── app/api/groq/route.ts (30s timeout)

Vercel Blob Storage:
├── /uploads/ (user uploaded images)
├── /audio/ (generated voiceovers)
└── /videos/ (rendered videos - if enabled)
```

## Deployment Commands

```bash
# Development preview
vercel

# Production deployment
vercel --prod

# Check deployment status
vercel ls

# View logs
vercel logs [deployment-url]
```

## Troubleshooting

### Build fails
- Check Node.js version (should be 18+)
- Verify all dependencies are in package.json

### API timeouts
- Reduce slide count or video duration
- Use external service for heavy operations

### Images not loading
- Verify BLOB_READ_WRITE_TOKEN is set
- Check CORS settings for external images

## Alternative: Deploy to Railway/Render

For full video rendering support, consider:
- **Railway**: No timeout limits, supports FFmpeg
- **Render**: Generous timeouts, supports Docker

Both support Docker and can handle video rendering better than Vercel.

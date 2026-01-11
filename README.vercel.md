# Quick Vercel Deployment

## 🚀 Deploy Now

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
vercel
```

## ⚙️ Required Setup

### Add Environment Variables in Vercel Dashboard:

1. Go to your project on Vercel
2. Settings → Environment Variables
3. Add:
   - `GROQ_API_KEY` = `your_groq_api_key`

### Optional (for file uploads):
   - `BLOB_READ_WRITE_TOKEN` = Get from Vercel Blob Storage

## ⚠️ Known Limitations

- **Video rendering may timeout** (Consider disabling download feature)
- **Playwright disabled** (Falls back to static scraping - works fine for most sites)
- **Files stored in Vercel Blob** (Not local filesystem)

## 📝 What Works

✅ Website scraping (Cheerio)
✅ AI script generation (Groq)
✅ Image extraction
✅ Project creation
✅ Studio editor UI
✅ Preview generation

## ❌ What May Not Work

⚠️ Video download (timeout after 60s)
⚠️ Heavy JS sites (no Playwright browser)

## 🔧 For Full Features

Deploy to Railway or Render instead for:
- No timeout limits
- Full FFmpeg support
- Playwright browsers

See `DEPLOYMENT.md` for detailed instructions.

# Trendly - Railway Deployment Guide

## 🎉 Successfully Deployed to Railway!

**Production URL:** https://trendly-production.up.railway.app

---

## ✅ What's Working

### Full Features (Unlike Vercel):
- ✅ **Video Rendering** - FFmpeg installed via nixpacks
- ✅ **Image/Music Uploads** - Persistent storage
- ✅ **Web Scraping** - Static HTML parsing (Playwright disabled for serverless compatibility)
- ✅ **Voice Synthesis** - Piper TTS ready (needs binary installation - see below)
- ✅ **Project Management** - All CRUD operations
- ✅ **No timeout limits** - Long-running video renders supported

---

## 📋 Railway vs Vercel Comparison

| Feature | Vercel | Railway |
|---------|--------|---------|
| FFmpeg Support | ❌ | ✅ |
| Persistent Storage | ❌ | ✅ |
| Execution Time Limit | 60s (300s Pro) | ∞ No limit |
| System Binaries | ❌ | ✅ |
| Monthly Cost | Free/$20 | $5 credit free |
| Video Rendering | ❌ | ✅ |

---

## 🚀 Deployment Commands

### Initial Setup (Already Done)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Redeploy After Changes
```bash
railway up
```

### View Logs
```bash
railway logs
```

### Open Dashboard
```bash
railway open
```

### Environment Variables
```bash
railway variables
```

---

## 📦 What's Installed

Railway automatically installs via [nixpacks.toml](nixpacks.toml):
- ✅ Node.js 22
- ✅ FFmpeg (for video rendering)
- ✅ All npm dependencies

---

## ⚙️ Optional: Add Piper TTS (High-Quality Voice)

Railway doesn't have Piper pre-installed. To add it:

1. Create a startup script or use Railway's build phase
2. Or use alternative TTS (ElevenLabs API, Google Cloud TTS, etc.)
3. Current fallback: Uses espeak-ng (basic quality)

---

## 🔧 Environment Variables

Set these in Railway dashboard if needed:
```env
GROQ_API_KEY=your_key_here
CACHE_TTL_MS=600000
MAX_RESPONSE_SIZE=10485760
REQUEST_TIMEOUT_MS=30000
```

Add via CLI:
```bash
railway variables set GROQ_API_KEY=your_key_here
```

---

## 💰 Free Tier Limits

Railway gives **$5 free credit/month**:
- Renews monthly
- Should cover moderate usage
- Monitor at: https://railway.com/account/usage

---

## 🔄 Custom Domain (Optional)

```bash
railway domain
# Then add your custom domain in the dashboard
```

---

## 📊 Monitoring

View real-time logs and metrics:
```bash
railway logs -f
```

Or visit: https://railway.com/project/1c31c651-433d-492c-94b8-4309de9e49be

---

## 🐛 Troubleshooting

### Video rendering fails
- Check FFmpeg is installed: `railway run ffmpeg -version`
- View logs: `railway logs`

### Out of memory
- Increase memory in Railway settings (default: 512MB)
- Optimize video settings

### Hit credit limit
- Check usage: https://railway.com/account/usage
- Upgrade plan or optimize resource usage

---

## 📁 File Structure Changes for Railway

Updated paths to support both Railway and local development:
- Working directory: `/tmp/` (serverless) or `process.cwd()` (local)
- Auto-detects environment via `process.env.VERCEL` check
- Removed serverless restrictions for video rendering

---

## 🎯 Next Steps

1. Test video rendering: Create a project and click "Render Preview"
2. Monitor credit usage in Railway dashboard
3. Set up custom domain if needed
4. Configure environment variables for API keys

---

## 📞 Support

- Railway Docs: https://docs.railway.com
- Railway Discord: https://discord.gg/railway
- Project Dashboard: https://railway.com/project/1c31c651-433d-492c-94b8-4309de9e49be

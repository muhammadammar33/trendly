# Database Setup Guide

This project uses **PostgreSQL with Prisma ORM** for persistent project storage.

## Quick Setup

### 1. Local Development

**Option A: Use Railway PostgreSQL (Recommended)**

1. Go to [Railway.app](https://railway.app/) and create a new project
2. Add a PostgreSQL service
3. Copy the DATABASE_URL from Railway dashboard (Connection String format)
4. Update your `.env` file:
   ```env
   DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"
   ```

**Option B: Local PostgreSQL**

1. Install PostgreSQL on your machine
2. Create a database: `createdb trendly`
3. Update `.env`:
   ```env
   DATABASE_URL="postgresql://localhost:5432/trendly"
   ```

### 2. Run Migrations

```powershell
# Generate Prisma client (creates TypeScript types)
npm run db:generate

# Create database tables
npm run db:migrate

# Optional: Open Prisma Studio to view data
npm run db:studio
```

### 3. Verify Setup

Start the development server:
```powershell
npm run dev
```

Create a test project via the UI - it should persist after server restart!

---

## Production Deployment

### Railway

Railway auto-detects Prisma and runs migrations:

1. Connect GitHub repository to Railway
2. Add PostgreSQL service to your project
3. Railway automatically sets `DATABASE_URL` environment variable
4. Migrations run automatically during build via `postinstall` script

### Vercel

1. Add PostgreSQL database (e.g., Vercel Postgres, Neon, Supabase)
2. Set `DATABASE_URL` environment variable in Vercel dashboard
3. Deploy - Prisma client generates automatically via `postinstall`

---

## Database Schema

### Project Model

Stores all video project data with JSON fields for complex objects:

```prisma
model Project {
  id        String   @id @default(uuid())
  
  // Scraped data
  business      Json  // Business info (name, phones, emails, etc.)
  brand         Json  // Brand info (logo, colors, fonts)
  sourceImages  Json  // All scraped images
  
  // Video composition
  slides        Json  // Slide[] timeline with images & transitions
  bottomBanner  Json  // Bottom banner config
  qrCode        Json  // QR code config
  music         Json  // Background music config
  voice         Json  // Voiceover config
  endScreen     Json  // End screen config
  
  // Rendering state
  status                String    // 'draft' | 'rendering-preview' | 'preview-ready' | ...
  previewVideoUrl       String?   // /studio/videos/preview-{uuid}.mp4
  finalVideoUrl         String?   // /studio/videos/final-{uuid}.mp4
  lastPreviewConfigHash String?   // SHA-256 hash for auto-preview detection
  lastPreviewRenderedAt DateTime? // Last preview render timestamp
  
  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Indexes for query performance
  @@index([createdAt])
  @@index([status])
}
```

---

## Prisma Commands

```powershell
# Generate TypeScript client (after schema changes)
npm run db:generate

# Create & apply new migration (development)
npm run db:migrate

# Push schema to database (no migration files)
npm run db:push

# Open Prisma Studio (database GUI)
npm run db:studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

---

## Migration from File Storage

**Old system:** `tmp/store/projects.json` (ephemeral, cleared on restart)  
**New system:** PostgreSQL database (persistent, multi-instance safe)

All CRUD operations now use Prisma:
- `createProject()` → `prisma.project.create()`
- `getProject()` → `prisma.project.findUnique()`
- `updateProject()` → `prisma.project.update()`
- `deleteProject()` → `prisma.project.delete()`
- `listProjects()` → `prisma.project.findMany()`

No code changes needed in components - same API interface!

---

## Troubleshooting

### "Error: P1001 - Can't reach database"
- Check `DATABASE_URL` is correct in `.env`
- Verify PostgreSQL is running (local) or accessible (cloud)
- Try: `npx prisma db push --force-reset` (WARNING: deletes data)

### "Type error: PrismaClient not found"
- Run: `npm run db:generate`
- Restart TypeScript server in VS Code

### "Migration failed"
- Check database permissions
- Reset: `npx prisma migrate reset` (deletes all data)
- Or: `npm run db:push` (skip migrations, force schema sync)

---

## Benefits of Database Storage

✅ **Persistent**: Projects survive server restarts & redeploys  
✅ **Scalable**: Multiple server instances share same data  
✅ **Fast**: Indexed queries, connection pooling  
✅ **Safe**: ACID transactions, automatic backups (Railway/Vercel)  
✅ **Developer-friendly**: Prisma Studio GUI, TypeScript types

No more "project store not found in production" errors!

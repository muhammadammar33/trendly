/**
 * Render Job Store
 * 
 * Tracks video rendering jobs
 */

import { RenderJob } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Global singleton store for render jobs (fixes Next.js module isolation)
 */
const globalForJobs = globalThis as unknown as {
  renderJobsStore: Map<string, RenderJob> | undefined;
};

const jobs = globalForJobs.renderJobsStore ?? new Map<string, RenderJob>();

if (process.env.NODE_ENV !== 'production') {
  globalForJobs.renderJobsStore = jobs;
}

/**
 * Auto-cleanup: Remove completed jobs older than 1 hour
 */
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  for (const [id, job] of jobs.entries()) {
    if (
      (job.status === 'done' || job.status === 'error') &&
      now - job.updatedAt.getTime() > maxAge
    ) {
      jobs.delete(id);
      console.log(`[RenderJobStore] Cleaned up old job: ${id}`);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

/**
 * Create a new render job
 */
export function createRenderJob(
  projectId: string,
  type: 'preview' | 'final'
): RenderJob {
  const jobId = uuidv4();

  const job: RenderJob = {
    jobId,
    projectId,
    type,
    status: 'queued',
    progress: 0,
    stage: 'Queued',
    videoUrl: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  jobs.set(jobId, job);

  console.log(`[RenderJobStore] Created ${type} render job ${jobId} for project ${projectId}`);

  return job;
}

/**
 * Get job by ID
 */
export function getRenderJob(jobId: string): RenderJob | null {
  return jobs.get(jobId) || null;
}

/**
 * Update job
 */
export function updateRenderJob(
  jobId: string,
  updates: Partial<RenderJob>
): RenderJob | null {
  const job = jobs.get(jobId);
  if (!job) return null;

  const updated: RenderJob = {
    ...job,
    ...updates,
    updatedAt: new Date(),
  };

  jobs.set(jobId, updated);

  return updated;
}

/**
 * Delete job
 */
export function deleteRenderJob(jobId: string): boolean {
  return jobs.delete(jobId);
}

/**
 * Get all jobs for a project
 */
export function getProjectJobs(projectId: string): RenderJob[] {
  return Array.from(jobs.values()).filter((job) => job.projectId === projectId);
}

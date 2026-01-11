/**
 * In-memory job store for slideshow generation tracking
 */

export type JobStatus = 'queued' | 'picking' | 'downloading' | 'rendering' | 'done' | 'error';

export interface SlideshowJob {
  jobId: string;
  status: JobStatus;
  progress: number; // 0-100
  stage: string;
  videoUrl?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory store
const jobs = new Map<string, SlideshowJob>();

/**
 * Create a new job
 */
export function createJob(jobId: string): SlideshowJob {
  const job: SlideshowJob = {
    jobId,
    status: 'queued',
    progress: 0,
    stage: 'Queued',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  jobs.set(jobId, job);
  return job;
}

/**
 * Update job status
 */
export function updateJob(
  jobId: string,
  updates: Partial<Omit<SlideshowJob, 'jobId' | 'createdAt'>>
): SlideshowJob | null {
  const job = jobs.get(jobId);
  
  if (!job) {
    return null;
  }

  Object.assign(job, {
    ...updates,
    updatedAt: new Date(),
  });

  jobs.set(jobId, job);
  return job;
}

/**
 * Get job by ID
 */
export function getJob(jobId: string): SlideshowJob | null {
  return jobs.get(jobId) || null;
}

/**
 * Delete job (cleanup)
 */
export function deleteJob(jobId: string): void {
  jobs.delete(jobId);
}

/**
 * Clean up old jobs (older than 1 hour)
 */
export function cleanupOldJobs(): void {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  for (const [jobId, job] of jobs.entries()) {
    if (job.updatedAt < oneHourAgo) {
      jobs.delete(jobId);
    }
  }
}

// Auto cleanup every 30 minutes
setInterval(cleanupOldJobs, 30 * 60 * 1000);

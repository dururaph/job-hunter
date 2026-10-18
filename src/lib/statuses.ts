// Kept free of imports so client components can use it without bundling the DB layer.
export const JOB_STATUSES = ["new", "saved", "applied", "interviewing", "rejected", "hidden"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

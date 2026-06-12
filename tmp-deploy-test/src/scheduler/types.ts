export type ScheduledJobKind = 'reminder' | 'automation';

export type ScheduleJobInput = {
  kind: ScheduledJobKind;
  entityId: string;
  fireAt: Date;
};

export type ScheduleCronJobInput = {
  kind: ScheduledJobKind;
  entityId: string;
  cron: string;
  timezone?: string;
};

export type ScheduledJobPayload = {
  kind: ScheduledJobKind;
  entityId: string;
  missed?: boolean;
};

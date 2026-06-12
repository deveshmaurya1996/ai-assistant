import { startScheduler, closeScheduler } from '../scheduler';
import { startWorkflowWorker, closeWorkflowWorker } from './workflow.worker';
import { startIngestionWorker, closeIngestionWorker } from './ingestion.worker';
import { startMemoryWorker, closeMemoryWorker } from './memory.worker';
import { startEventFanout } from '../socket/event-fanout';

export function startAllWorkers() {
  startScheduler();
  startWorkflowWorker();
  startIngestionWorker();
  startMemoryWorker();
  startEventFanout();
}

export async function closeAllWorkers(): Promise<void> {
  await closeIngestionWorker();
  await closeMemoryWorker();
  await closeWorkflowWorker();
  await closeScheduler();
}

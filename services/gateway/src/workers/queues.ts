import { startScheduler } from '../scheduler';
import { startWorkflowWorker } from './workflow.worker';
import { startEventFanout } from '../socket/event-fanout';

export function startAllWorkers() {
  startScheduler();
  startWorkflowWorker();
  startEventFanout();
}

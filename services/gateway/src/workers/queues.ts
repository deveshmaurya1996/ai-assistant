import { startAutomationWorker } from './automation.worker';
import { startReminderWorker } from './reminder.worker';
import { startWorkflowWorker } from './workflow.worker';
import { startEventFanout } from '../socket/event-fanout';

export function startAllWorkers() {
  startAutomationWorker();
  startReminderWorker();
  startWorkflowWorker();
  startEventFanout();
}

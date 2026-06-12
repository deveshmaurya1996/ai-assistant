export function normalizeAutomationScheduleInput(input: {
  schedule?: string;
  cronExpression?: string;
}): string | undefined {
  const schedule = input.schedule?.trim();
  const cronExpression = input.cronExpression?.trim();
  return schedule || cronExpression || undefined;
}

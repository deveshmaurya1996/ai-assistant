import { Redirect } from 'expo-router';
import { Routes } from '@/lib/routes';

export default function RemindersRedirect() {
  return <Redirect href={Routes.automationsReminders} />;
}

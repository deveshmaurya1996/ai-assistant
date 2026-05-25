import { AssistantClient } from '@ai-assistant/sdk';
import { API_URL } from './config';

export const apiClient = new AssistantClient(API_URL, API_URL);

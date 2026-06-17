import { AutoSubscribe, defineAgent, type JobContext } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import { runRoomVoiceLoop } from './room-listener.js';
import { setAgentState } from './agent-state.js';

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    await setAgentState(ctx.agent, 'initializing');
    console.info('[voice-agent] joined room', ctx.room.name);
    await runRoomVoiceLoop(ctx.room as unknown as Room);
    await setAgentState(ctx.agent, 'idle');
  },
});

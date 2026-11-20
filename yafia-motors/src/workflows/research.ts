import type { ResearchState } from '@/lib/research';
export async function runResearch(taskId: string) {
  'use workflow';
  let state: ResearchState | undefined;
  for (let iteration = 0; iteration < 8; iteration++) {
    const result = await researchStep(taskId, state);
    if (result.done) return;
    state = result.state;
  }
}
async function researchStep(taskId: string, state?: ResearchState) {
  'use step';
  const { executeResearch } = await import('@/lib/research');
  return executeResearch(taskId, state);
}
researchStep.maxRetries = 0;

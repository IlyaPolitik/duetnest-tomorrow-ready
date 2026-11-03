import { parseInput } from './analysis-contract.ts';
import type { AnalysisInput, AnalysisResult, ProviderStatus } from './analysis-contract.ts';
export async function providerStatus(): Promise<ProviderStatus> {
  const response = await fetch('/api/meta/status', { cache:'no-store', signal:AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('The analysis server is unavailable.');
  return response.json();
}
export const metaAnalyzer = {
  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    try {
      const status = await providerStatus();
      if (input.provider !== status.provider) return {status:'error',code:'provider_changed',reason:'The provider changed. Refresh the status and check who will receive the text.'};
      const response = await fetch('/api/meta/analyze', { method:'POST', headers:{'Content-Type':'application/json','X-Duetnest-Csrf':status.csrf}, body:JSON.stringify(parseInput(input)), signal:AbortSignal.timeout(85000) });
      return await response.json();
    } catch { return {status:'error',code:'outcome_unknown',reason:'Connection to the local server was lost. The provider may have received the request; it will not be retried automatically.'}; }
  },
};

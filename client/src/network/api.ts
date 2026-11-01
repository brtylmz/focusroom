import type { EnvironmentSummary } from '@focusroom/shared';

export async function fetchEnvironments(signal?: AbortSignal): Promise<EnvironmentSummary[]> {
  const response = await fetch('/api/environments', { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as EnvironmentSummary[];
}

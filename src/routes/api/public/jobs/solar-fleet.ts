import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
import { z } from 'zod';
export const Route = createFileRoute('/api/public/jobs/solar-fleet')({ server:{ handlers:{ POST:async ({ request }) => {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;
  const body = z.object({ kind:z.enum(['sync','reports']) }).safeParse(await request.json().catch(()=>null));
  if (!body.success) return new Response('Invalid request',{ status:400 });
  const jobs = await import('@/lib/solar-fleet-jobs.server');
  return Response.json(body.data.kind === 'sync' ? await jobs.syncFleetJob() : await jobs.sendTeamReportsJob());
} } } });

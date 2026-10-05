import { groupInvite, inviteImage } from '@/lib/invite-card';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  return inviteImage(await groupInvite(params.code));
}

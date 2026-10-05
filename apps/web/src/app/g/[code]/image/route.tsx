import { groupInvite, inviteImage } from '@/lib/invite-card';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return inviteImage(await groupInvite(code));
}

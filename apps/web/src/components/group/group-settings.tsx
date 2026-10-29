'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { GroupEditSheet, type GroupEditData } from '@/components/group/group-edit-sheet';
import { deleteGroup, updateGroup, type IGroupWithMembers } from '@/lib/api';
import { DEFAULT_GAME_MINUTES, PaymentType } from '@pitchaside/shared';

/**
 * A group's settings, opened from the group switch on any screen: its details (name, pitch, day,
 * kick-off, places, fee, how players reply and see money), and deleting it, which asks first.
 */
export function GroupSettingsSheet({
  group,
  onClose,
  onSaved,
  onDeleted,
}: {
  group: IGroupWithMembers;
  onClose: () => void;
  /** The details changed: reload the group wherever it's shown. */
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const initial: GroupEditData = {
    name: group.name,
    description: group.description || '',
    location: group.location || '',
    schedule: group.schedule || '',
    kickoffTime: group.kickoffTime || '',
    targetPlayers: group.targetPlayers,
    feePerPlayer: group.feePerPlayer,
    paymentType: group.paymentType,
    requireRsvp: !!group.requireRsvp,
    contributionsVisibility: group.contributionsVisibility ?? 'private',
    gameMinutes: group.gameMinutes ?? DEFAULT_GAME_MINUTES,
    timerOn: group.timerOn !== false,

    bibs: group.bibs ?? null,
    // So the sheet shows the group's own currency ($ and $5 steps for international groups)
    scope: group.scope,
    currency: group.currency,
  };

  async function save(d: GroupEditData) {
    setSaving(true);
    try {
      await updateGroup(group.id, {
        name: d.name,
        description: d.description || undefined,
        location: d.location || undefined,
        schedule: d.schedule || undefined,
        kickoffTime: d.kickoffTime || undefined,
        targetPlayers: d.targetPlayers,
        feePerPlayer: d.feePerPlayer,
        paymentType: d.paymentType as PaymentType,
        requireRsvp: d.requireRsvp,
        contributionsVisibility: d.contributionsVisibility,
        gameMinutes: d.gameMinutes,
        timerOn: d.timerOn,

        bibs: d.bibs,
      });
      toast.success('Changes saved');
      onSaved();
      onClose();
    } catch {
      toast.error('The changes didn’t save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setConfirmDelete(false);
    try {
      await deleteGroup(group.id);
      toast.success(`${group.name} deleted`);
      onDeleted();
      onClose();
    } catch (err) {
      // The server refuses while the group's account still holds money, and says how much.
      toast.error(err instanceof Error ? err.message : 'The group wasn’t deleted. Try again.');
    }
  }

  return (
    <>
      <GroupEditSheet initial={initial} saving={saving} onSave={save} onClose={onClose} onDelete={() => setConfirmDelete(true)} />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${group.name}?`}
        message="Its games and their payment records go with it, and this can't be undone. Its players stay in All players. You can't delete a group while its account holds money."
        confirmLabel="Delete group"
        cancelLabel="Keep it"
        variant="danger"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

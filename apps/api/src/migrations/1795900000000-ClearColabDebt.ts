import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mark all pending payments for the "Colab" group as paid, update session totals,
 * and zero out every member's credit, extra and waiting money so no player shows
 * money sitting with the organiser.
 */
export class ClearColabDebt1795900000000 implements MigrationInterface {
  name = 'ClearColabDebt1795900000000';

  public async up(q: QueryRunner): Promise<void> {
    // Mark all pending payments for sessions in the Colab group as paid.
    await q.query(`
      UPDATE payments
      SET status     = 'paid',
          "paidAt"   = NOW(),
          source     = 'manual',
          "markedBy" = 'migration'
      WHERE status = 'pending'
        AND session_id IN (
          SELECT s.id FROM sessions s
          JOIN groups g ON g.id = s.group_id
          WHERE g.name ILIKE 'Colab'
        )
    `);

    // Recalculate each session's collectedAmount to match.
    await q.query(`
      UPDATE sessions s
      SET "collectedAmount" = (
        SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        WHERE p.session_id = s.id
          AND p.status = 'paid'
      )
      WHERE s.group_id IN (
        SELECT id FROM groups WHERE name ILIKE 'Colab'
      )
    `);

    // Zero out credit, extra and waiting on every membership so no player
    // appears to have money sitting with the organiser.
    await q.query(`
      UPDATE group_memberships
      SET credit  = 0,
          extra   = 0,
          waiting = 0,
          waiting_note = NULL
      WHERE group_id IN (
        SELECT id FROM groups WHERE name ILIKE 'Colab'
      )
    `);
  }

  public async down(_q: QueryRunner): Promise<void> {
    // One-way data fix — cannot reliably undo.
  }
}

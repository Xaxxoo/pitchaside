import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mark all pending payments for the "Colab" group as paid and update session totals.
 */
export class ClearColabDebt1795900000000 implements MigrationInterface {
  name = 'ClearColabDebt1795900000000';

  public async up(q: QueryRunner): Promise<void> {
    // Mark all pending payments for sessions in the Colab group as paid.
    await q.query(`
      UPDATE payments
      SET status   = 'paid',
          paid_at  = NOW(),
          source   = 'manual'
      WHERE status = 'pending'
        AND session_id IN (
          SELECT s.id FROM sessions s
          JOIN groups g ON g.id = s.group_id
          WHERE g.name ILIKE 'Colab'
        )
    `);

    // Recalculate each session's collected_amount to match.
    await q.query(`
      UPDATE sessions s
      SET collected_amount = (
        SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        WHERE p.session_id = s.id
          AND p.status = 'paid'
      )
      WHERE s.group_id IN (
        SELECT id FROM groups WHERE name ILIKE 'Colab'
      )
    `);
  }

  public async down(_q: QueryRunner): Promise<void> {
    // One-way data fix — cannot reliably undo.
  }
}

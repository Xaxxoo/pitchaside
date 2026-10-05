import { join } from 'path';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

// Run from src/ with ts-node (the typeorm CLI scripts) or from dist/ as compiled JS (the
// production start-up in main.ts): load whichever kind of file sits next to this one, so
// dist's .d.ts files are never picked up as migrations.
const ext = __filename.endsWith('.ts') ? 'ts' : 'js';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'pitchaside',
  entities: [join(__dirname, `**/*.entity.${ext}`)],
  migrations: [join(__dirname, `migrations/*.${ext}`)],
});

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import dataSource from './data-source';
import { runMigrations } from './database/migrate';

/** The fallback in auth.module / jwt.strategy: fine locally, never acceptable in production. */
const DEV_JWT_SECRET = 'pitchaside-dev-secret';

/**
 * Production start-up checks, before anything else: refuse to run with the development JWT
 * secret (anyone could sign tokens with it), and bring the database schema up to date —
 * in production `synchronize` is off, so migrations are how the schema changes.
 */
async function prepareProduction() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === DEV_JWT_SECRET) {
    throw new Error('JWT_SECRET must be set to a private random value in production (e.g. `openssl rand -hex 32`).');
  }
  if (secret.length < 32) console.warn('JWT_SECRET is shorter than 32 characters; use a longer random value.');
  await runMigrations(dataSource, (m) => console.log(`[migrations] ${m}`));
}

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') await prepareProduction();

  // rawBody lets the PulseMFB webhook verify its signature over the exact bytes sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`PitchAside API running on http://localhost:${port}`);
}
bootstrap();

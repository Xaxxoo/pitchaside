import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';
import { OrganizationsService } from './organizations/organizations.service';
import { User, UserRole } from './users/entities/user.entity';
import * as bcrypt from 'bcrypt';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const usersService = app.get(UsersService);
  const orgsService = app.get(OrganizationsService);
  const usersRepo = app.get<Repository<User>>(getRepositoryToken(User));

  // Create super-admin org + user if not exists
  let org: { id: string; name: string };
  const existingAdmin = await usersService.findByEmail('admin@pitchaside.com');
  if (existingAdmin) {
    console.log('Super admin already exists, skipping.');
    org = { id: existingAdmin.organizationId, name: 'PitchAside HQ' };
  } else {
    org = await orgsService.create('PitchAside HQ');
    console.log(`Created organization: ${org.name} (${org.id})`);

    const passwordHash = await bcrypt.hash('admin123', 10);
    const admin = await usersService.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@pitchaside.com',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      organizationId: org.id,
    });
    console.log(`Created super admin: ${admin.email}`);
  }

  // Create additional admin: bnahmad83@gmail.com
  const existingBn = await usersService.findByEmail('bnahmad83@gmail.com');
  if (existingBn) {
    if (existingBn.role !== UserRole.SUPER_ADMIN) {
      await usersRepo.update(existingBn.id, { role: UserRole.SUPER_ADMIN });
      console.log('bnahmad83@gmail.com promoted to SUPER_ADMIN.');
    } else {
      console.log('bnahmad83@gmail.com already SUPER_ADMIN, skipping.');
    }
  } else {
    const bnHash = await bcrypt.hash('@NabNoo0317', 10);
    const bnAdmin = await usersService.create({
      firstName: 'BN',
      lastName: 'Ahmad',
      email: 'bnahmad83@gmail.com',
      passwordHash: bnHash,
      role: UserRole.SUPER_ADMIN,
      organizationId: org.id,
    });
    console.log(`Created admin: ${bnAdmin.email}`);
  }

  await app.close();
  console.log('Seed completed.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

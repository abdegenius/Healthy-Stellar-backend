import { Injectable, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as DataLoader from 'dataloader';
import { Patient as PatientEntity } from '../patients/entities/patient.entity';
import { User } from '../users/entities/user.entity';
import { Patient } from './types/patient.type';
import { Provider } from './types/provider.type';

@Injectable({ scope: Scope.REQUEST })
export class DataloaderService {
  constructor(
    @InjectRepository(PatientEntity)
    private readonly patientRepo: Repository<PatientEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  createPatientLoader(): DataLoader<string, Patient | null> {
    return new DataLoader<string, Patient | null>(
      async (ids: readonly string[]) => {
        const rows = await this.patientRepo.find({
          where: { id: In([...ids]) },
        });
        const map = new Map<string, PatientEntity>(rows.map((p) => [p.id, p]));
        return ids.map((id) => {
          const p = map.get(id);
          if (!p) return null;
          return {
            id: p.id,
            address: p.address ?? '',
            name: `${p.firstName} ${p.lastName}`.trim(),
            email: p.email,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          } as Patient;
        });
      },
      { cache: true },
    );
  }

  createProviderLoader(): DataLoader<string, Provider | null> {
    return new DataLoader<string, Provider | null>(
      async (ids: readonly string[]) => {
        const rows = await this.userRepo.find({
          where: { id: In([...ids]) },
        });
        const map = new Map<string, User>(rows.map((u) => [u.id, u]));
        return ids.map((id) => {
          const u = map.get(id);
          if (!u) return null;
          return {
            id: u.id,
            address: u.email,
            name: `${u.firstName} ${u.lastName}`.trim(),
            specialty: undefined,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
          } as Provider;
        });
      },
      { cache: true },
    );
  }
}

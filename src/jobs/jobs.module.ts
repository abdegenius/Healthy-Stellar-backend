import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessGrant } from '../access-control/entities/access-grant.entity';
import { AggregateSnapshotEntity } from '../event-store/aggregate-snapshot.entity';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccessGrantCleanupTask } from './access-grant-cleanup.task';
import { SnapshotCleanupTask } from './snapshot-cleanup.task';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessGrant, AggregateSnapshotEntity]),
    NotificationsModule,
    CommonModule,
  ],
  providers: [AccessGrantCleanupTask, SnapshotCleanupTask],
})
export class JobsModule {}

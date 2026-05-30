import { Module, DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { createRedisRetryStrategy } from '../common/utils/connection-retry.util';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queue.constants';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { EhrImportDlqController } from './controllers/ehr-import-dlq.controller';
import { StellarTransactionProcessor } from './processors/stellar-transaction.processor';
import { ContractWritesProcessor } from './processors/contract-writes.processor';
import { EventIndexingProcessor } from './processors/event-indexing.processor';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { QueueEventsListener } from './queue-events.listener';
import { RecordsModule } from '../records/records.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    BlockchainModule,
    // Needed by EventIndexingProcessor to emit internal domain events in worker mode
    EventEmitterModule.forRoot(),
    // Needed by EventIndexingProcessor to persist per-record event streams
    RecordsModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get('REDIS_DB', 0),
          maxRetriesPerRequest: null,
          retryStrategy: createRedisRetryStrategy(),
          reconnectOnError: (err: Error) => {
            // Reconnect on READONLY errors (e.g. Redis failover)
            return err.message.includes('READONLY');
          },
        },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.STELLAR_TRANSACTIONS },
      { name: QUEUE_NAMES.CONTRACT_WRITES },
      { name: QUEUE_NAMES.IPFS_UPLOADS },
      { name: QUEUE_NAMES.EVENT_INDEXING },
      { name: QUEUE_NAMES.EMAIL_NOTIFICATIONS },
      { name: QUEUE_NAMES.REPORTS },
      { name: QUEUE_NAMES.EHR_IMPORT },
    ),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.STELLAR_TRANSACTIONS,
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.CONTRACT_WRITES,
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.IPFS_UPLOADS,
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.EVENT_INDEXING,
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.EMAIL_NOTIFICATIONS,
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.REPORTS,
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.EHR_IMPORT,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [QueueController, EhrImportDlqController],
  providers: [
    QueueService,
    StellarTransactionProcessor,
    ContractWritesProcessor,
    EventIndexingProcessor,
    QueueEventsListener,
  ],
  exports: [QueueService, BullModule],
})
export class QueueModule {}

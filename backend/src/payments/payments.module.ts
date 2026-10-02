import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DataModule } from '../data/data.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

// Payments layer sits on top of DataService (DB access + plan/coupon logic).
// JwtModule is imported so the method-level AdminDataGuard on the refund route
// can resolve JwtService within this module's injector.
@Module({
  imports: [DataModule, JwtModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}

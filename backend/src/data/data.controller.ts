import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataService } from './data.service';
import { AdminDataGuard } from './admin-data.guard';

@Controller()
@UseGuards(AdminDataGuard)
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @Get('data/speakers/:id/profile')
  @Header('Cache-Control', 'no-store')
  speakerProfile(@Param('id') id: string) {
    return this.dataService.getPublicSpeakerProfile(id);
  }

  @Get('data/:table')
  list(
    @Param('table') table: string,
    @Query('filters') filters?: string,
    @Query('order') order?: string,
    @Req() request?: Request & { isAdmin?: boolean },
  ) {
    const parsedFilters = this.parse<Record<string, unknown>>(filters, {});

    if (!request?.isAdmin) {
      if (table === 'site_data') parsedFilters.is_public = true;
      if (['speakers', 'media_partners', 'information_blocks'].includes(table)) parsedFilters.is_visible = true;
      if (table === 'accommodation_options') parsedFilters.is_active = true;
    }

    return this.dataService.list(table, parsedFilters, this.parse(order, []));
  }

  @Post('data/:table')
  insert(
    @Param('table') table: string,
    @Body() payload: Record<string, unknown> | Record<string, unknown>[],
    @Query('upsert') upsert?: string,
    @Query('onConflict') onConflict?: string,
  ) {
    if (table === 'registration_intents') return this.dataService.createPublicRegistration(payload as Record<string, unknown>);
    if (table === 'contact_messages') return this.dataService.createPublicContactMessage(payload as Record<string, unknown>);
    if (table === 'abstract_submissions') return this.dataService.createPublicAbstractSubmission(payload as Record<string, unknown>);
    if (upsert === '1') return this.dataService.upsert(table, payload, onConflict);
    return this.dataService.insert(table, payload);
  }

  @Patch('data/:table/:id')
  update(@Param('table') table: string, @Param('id') id: string, @Body() payload: Record<string, unknown>) {
    return this.dataService.update(table, id, payload);
  }

  @Delete('data/:table/:id')
  delete(@Param('table') table: string, @Param('id') id: string) {
    return this.dataService.delete(table, id);
  }

  @Post('rpc/validate_registration_coupon')
  validateCoupon(@Body() body: Record<string, unknown>) {
    return this.dataService.validateCoupon(
      String(body.p_code ?? body.code ?? ''),
      Number(body.p_amount_usd ?? body.amount_usd ?? body.p_amount ?? 0),
    );
  }

  @Post('rpc/update_registration_payment')
  updateRegistrationPayment(@Body() body: Record<string, unknown>) {
    return this.dataService.updateRegistrationPayment(body);
  }

  @Get('functions/payment-provider-status')
  getPaymentProviderStatus() {
    return this.dataService.getPaymentProviderStatus();
  }

  @Get('functions/receipt/:registrationId')
  @Header('Cache-Control', 'no-store, private')
  @Header('Referrer-Policy', 'no-referrer')
  async getReceipt(@Param('registrationId') registrationId: string, @Query('orderId') orderId?: string) {
    return this.dataService.getReceipt(registrationId, orderId);
  }

  @Post('functions/generate-receipt')
  @Header('Cache-Control', 'no-store, private')
  @Header('Referrer-Policy', 'no-referrer')
  async generateReceipt(@Body() body: Record<string, unknown>) {
    return this.dataService.generateReceipt(body);
  }

  private parse<T>(value: string | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}

import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { AdminDataGuard } from '../data/admin-data.guard';

// Public, anonymous checkout endpoints. Ownership is proven by the unguessable
// access token minted per order, so no login/JWT is required. (#31)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('quote')
  @HttpCode(200)
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  quote(@Body() body: Record<string, unknown>) {
    return this.payments.quoteRegistration(body);
  }

  // Start a payment: create the internal order, then the gateway order/session.
  // Tightly throttled to blunt order-spam and gateway abuse. (#28)
  @Post('create-order')
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  createOrder(@Body() body: Record<string, unknown>) {
    return this.payments.createOrder(body);
  }

  // Razorpay client-side handler callback: verify the signature server-side. (#11)
  @Post('verify')
  @Throttle({ short: { limit: 20, ttl: 60_000 } })
  verify(@Body() body: Record<string, unknown>) {
    return this.payments.verifyRazorpayPayment(body);
  }

  @Post('capture/paypal/:accessToken')
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  capturePayPal(@Param('accessToken') accessToken: string, @Body() body: Record<string, unknown>) {
    return this.payments.capturePayPalOrder(accessToken, String(body.providerOrderId ?? ''));
  }

  // DB-truth status lookup used by the success/cancel pages instead of trusting
  // the redirect. (#21, #35)
  @Get('status/:accessToken')
  @Header('Cache-Control', 'no-store, private')
  @Throttle({ short: { limit: 60, ttl: 60_000 } })
  status(@Param('accessToken') accessToken: string) {
    return this.payments.getStatus(accessToken);
  }

  // Anonymous receipt/invoice download for the buyer, gated by the access token
  // and only served once the order is PAID.
  @Get('receipt/:accessToken')
  @Header('Cache-Control', 'no-store, private')
  @Header('Referrer-Policy', 'no-referrer')
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  receipt(@Param('accessToken') accessToken: string) {
    return this.payments.getReceiptByToken(accessToken);
  }

  // Buyer-initiated cancel, gated by the access token. Marks an unpaid order
  // CANCELLED and releases its reserved coupon use immediately.
  @Post('cancel/:accessToken')
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  cancel(@Param('accessToken') accessToken: string) {
    return this.payments.cancelOrder(accessToken);
  }

  // Admin-initiated refund for a paid order. Guarded (admin JWT required): the
  // access token is NOT accepted here — only an administrator can move money.
  @Post('admin/refund/:orderId')
  @UseGuards(AdminDataGuard)
  @Throttle({ short: { limit: 20, ttl: 60_000 } })
  refund(@Param('orderId') orderId: string, @Req() request: Request & { adminUserId?: string }) {
    return this.payments.initiateRefund(orderId, request.adminUserId);
  }

  @Post('admin/reconcile/:orderId')
  @UseGuards(AdminDataGuard)
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  reconcile(@Param('orderId') orderId: string, @Req() request: Request & { adminUserId?: string }) {
    return this.payments.reconcileOrder(orderId, request.adminUserId);
  }

  @Get('admin/audit/:orderId')
  @UseGuards(AdminDataGuard)
  @Throttle({ short: { limit: 60, ttl: 60_000 } })
  audit(@Param('orderId') orderId: string) {
    return this.payments.getPaymentAudit(orderId);
  }

  // Provider webhooks. Uses the raw body preserved by `rawBody: true` in main.ts
  // for signature verification, and always answers 200 once accepted. (#22, #23)
  @Post('webhook/:provider')
  @HttpCode(200)
  @Throttle({ long: { limit: 1000, ttl: 60_000 } })
  webhook(
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.payments.handleWebhook(provider, request.rawBody, headers, body);
  }
}

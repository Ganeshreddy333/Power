import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { DataService } from '../data/data.service';
import { logPaymentEvent } from './payment-log';

export const SUPPORTED_PROVIDERS = ['stripe', 'paypal', 'razorpay'] as const;
export type PaymentProvider = (typeof SUPPORTED_PROVIDERS)[number];

// How long an order may sit in CREATED/PENDING before the sweeper treats it as
// abandoned, cancels it, and reclaims any coupon use it reserved.
const STALE_ORDER_MINUTES = Number(process.env.ORDER_STALE_MINUTES || 30);
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const configuredProviderTimeout = Number(process.env.PAYMENT_PROVIDER_TIMEOUT_MS || 15000);
const PROVIDER_REQUEST_TIMEOUT_MS = Number.isFinite(configuredProviderTimeout)
  ? Math.min(Math.max(configuredProviderTimeout, 1000), 60000)
  : 15000;

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Payments');
  private sweepTimer?: ReturnType<typeof setInterval>;
  private notificationTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly data: DataService) {}

  onModuleInit() {
    // Periodically reclaim coupon uses held by abandoned checkouts. Runs in-
    // process (no external scheduler dependency); unref'd so it never keeps the
    // process alive on its own.
    this.sweepTimer = setInterval(() => {
      this.cleanupStaleOrders().catch((error) =>
        this.logger.warn(`stale-order sweep failed: ${this.errorMessage(error)}`),
      );
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
    this.notificationTimer = setInterval(() => {
      this.data.retryFailedPaymentNotifications().catch((error) =>
        this.logger.warn(`payment notification retry failed: ${this.errorMessage(error)}`),
      );
    }, SWEEP_INTERVAL_MS);
    this.notificationTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.notificationTimer) clearInterval(this.notificationTimer);
  }

  // Cancel orders left open past the stale window and release the coupon use
  // each one reserved, so a capped coupon is not permanently drained by buyers
  // who opened checkout and never paid.
  async cleanupStaleOrders() {
    const stale = await this.data.findStaleOpenOrders(STALE_ORDER_MINUTES);
    let cancelled = 0;
    for (const order of stale) {
      const transitioned = await this.data.transitionOrderStatus(order.id, ['CREATED', 'PENDING'], 'CANCELLED');
      if (!transitioned) continue;
      if (order.coupon_code) await this.data.releaseCoupon(order.coupon_code);
      await this.data.releaseRegistrationCheckoutClaim(order.registration_id);
      cancelled += 1;
    }
    if (cancelled) this.log('ORDERS_SWEPT', { count: cancelled });
    return { cancelled };
  }

  private log(event: Parameters<typeof logPaymentEvent>[1], meta?: Record<string, unknown>) {
    logPaymentEvent(this.logger, event, meta);
  }

  private isProvider(value: string): value is PaymentProvider {
    return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
  }

  async quoteRegistration(body: Record<string, unknown>) {
    const planKey = String(body.planKey ?? body.plan_key ?? '').trim().toLowerCase();
    const quantity = Number(body.quantity ?? 1);
    const couponCode = String(body.couponCode ?? body.coupon_code ?? '').trim();
    const pricing = await this.data.computeRegistrationAmount(planKey, couponCode, quantity);
    const optionId = String(body.accommodationOptionId ?? body.accommodation_option_id ?? '').trim();
    const checkIn = body.accommodationCheckIn ?? body.accommodation_check_in;
    const checkOut = body.accommodationCheckOut ?? body.accommodation_check_out;
    let accommodation: Record<string, unknown> | null = null;

    if (optionId) {
      accommodation = await this.data.quoteAccommodation(optionId, checkIn, checkOut);
    } else if (checkIn || checkOut) {
      throw new BadRequestException('Select an accommodation option before providing stay dates');
    }

    const accommodationTotal = Number(accommodation?.total ?? 0);
    return {
      accommodation,
      amount: {
        base: Math.round((pricing.baseAmount + accommodationTotal) * 100) / 100,
        discount: pricing.discountAmount,
        tax: pricing.taxAmount,
        final: Math.round((pricing.finalAmount + accommodationTotal) * 100) / 100,
        currency: pricing.currency,
      },
    };
  }

  private assertProviderConfigured(provider: PaymentProvider) {
    const production = String(process.env.NODE_ENV).toLowerCase() === 'production';
    const paymentMode = String(process.env.PAYMENT_MODE || 'sandbox').toLowerCase();
    const ready = {
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
      razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    }[provider];
    if (!ready) throw new ServiceUnavailableException(`${provider} payments are not configured`);

    if (provider === 'razorpay') {
      const keyId = String(process.env.RAZORPAY_KEY_ID || '');
      const liveKey = keyId.startsWith('rzp_live_');
      const testKey = keyId.startsWith('rzp_test_');
      if (!['sandbox', 'production'].includes(paymentMode)) {
        throw new ServiceUnavailableException('Razorpay payment mode must be sandbox or production');
      }
      if ((liveKey && (!production || paymentMode !== 'production')) ||
          (testKey && paymentMode !== 'sandbox') ||
          (paymentMode === 'production' && (!production || !liveKey))) {
        throw new ServiceUnavailableException('Razorpay key mode does not match the configured payment mode');
      }
    }

    if (production && provider === 'razorpay') {
      if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
        throw new ServiceUnavailableException('razorpay webhook verification is not configured');
      }
      if (!Number.isFinite(Number(process.env.RAZORPAY_USD_TO_INR)) || Number(process.env.RAZORPAY_USD_TO_INR) <= 0) {
        throw new ServiceUnavailableException('A positive Razorpay USD-to-INR rate is required in production');
      }
      const frontendUrls = String(process.env.FRONTEND_URL || '').split(',').map((url) => url.trim());
      if (!frontendUrls.length || frontendUrls.some((url) => !url.startsWith('https://'))) {
        throw new ServiceUnavailableException('Production frontend URLs must use HTTPS');
      }
    } else if (production) {
      if (process.env.PAYMENT_MODE !== 'production') {
        throw new ServiceUnavailableException('Live payment mode must be explicitly enabled in production');
      }
      const webhookReady = {
        stripe: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
        paypal: Boolean(process.env.PAYPAL_WEBHOOK_ID),
        razorpay: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      }[provider];
      if (!webhookReady) throw new ServiceUnavailableException(`${provider} webhook verification is not configured`);
      if (provider === 'stripe' && !process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
        throw new ServiceUnavailableException('Stripe live credentials are required in production');
      }
      const frontendUrls = String(process.env.FRONTEND_URL || '').split(',').map((url) => url.trim());
      if (!frontendUrls.length || frontendUrls.some((url) => !url.startsWith('https://'))) {
        throw new ServiceUnavailableException('Production frontend URLs must use HTTPS');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Create order: validate registration, recompute the authoritative amount,
  // create the internal order first, then the gateway order. (#3,#4,#5,#6,#15,#19)
  // ---------------------------------------------------------------------------
  async createOrder(body: Record<string, unknown>) {
    const registrationId = String(body.registrationId ?? body.registration_id ?? '').trim();
    const provider = String(body.provider ?? '').trim().toLowerCase();
    if (!registrationId) throw new BadRequestException('Registration id is required');
    if (!this.isProvider(provider)) throw new BadRequestException('Unsupported payment provider');
    this.assertProviderConfigured(provider);

    const reg = (await this.data.list('registration_intents', { id: registrationId }))[0] as Record<string, any> | undefined;
    if (!reg) throw new NotFoundException('Registration not found');
    if (String(reg.payment_status).toLowerCase() === 'paid') {
      throw new ConflictException('This registration is already paid');
    }
    if (String(reg.payment_provider).toLowerCase() !== provider) {
      throw new BadRequestException('Payment provider does not match the registration');
    }
    this.log('CREATE_ORDER_REQUESTED', {
      registrationId,
      paymentStatus: reg.payment_status,
      provider,
    });

    // Never trust any client amount: recompute registration and accommodation
    // pricing from server-side records and snapshot the entire order.
    const quantity = Number(reg.quantity ?? 1);
    const pricing = await this.data.computeRegistrationAmount(String(reg.plan_key), reg.coupon_code, quantity);
    const accommodationOptionId = String(reg.accommodation_option_id ?? '').trim();
    const accommodationCheckIn = reg.accommodation_check_in ?? null;
    const accommodationCheckOut = reg.accommodation_check_out ?? null;
    const accommodation = accommodationOptionId
      ? await this.data.quoteAccommodation(accommodationOptionId, accommodationCheckIn, accommodationCheckOut)
      : null;
    if (!accommodation && (accommodationCheckIn || accommodationCheckOut)) {
      throw new BadRequestException('Registration accommodation details are incomplete');
    }
    const accommodationTotal = Number(accommodation?.total ?? 0);
    const finalAmount = Math.round((pricing.finalAmount + accommodationTotal) * 100) / 100;
    if (finalAmount <= 0) throw new BadRequestException('Order amount must be greater than zero');

    if (!(await this.data.claimRegistrationCheckout(registrationId))) {
      throw new ConflictException('Checkout has already been started for this registration');
    }

    // Reserve the coupon use up front (atomic, capped at max_uses). This is what
    // makes a limit of N actually hold: the (N+1)th order is refused right here
    // instead of every concurrent order sailing through validation and all
    // getting the discount. If anything below fails, we release the use.
    if (pricing.couponCode) {
      let reserved: boolean;
      try {
        reserved = await this.data.reserveCoupon(pricing.couponCode);
      } catch (error) {
        await this.data.releaseRegistrationCheckoutClaim(registrationId);
        throw error;
      }
      if (!reserved) {
        await this.data.releaseRegistrationCheckoutClaim(registrationId);
        throw new BadRequestException('Coupon usage limit reached');
      }
    }

    // Every payment attempt gets its OWN fresh order and gateway order. We
    // deliberately do NOT reuse a prior open/abandoned order for this
    // registration: reusing one lets a later payment settle a stale, half-
    // finished transaction instead of the attempt the buyer is actually making.
    // A payment only ever finalizes the exact order it was created against.

    const gateway = this.toGatewayAmount(provider, finalAmount);
    let order: Record<string, any>;
    try {
      const orderPayload = {
        order_number: this.generateOrderNumber(),
        registration_id: registrationId,
        access_token: this.generateAccessToken(),
        provider,
        quantity,
        base_amount: Math.round((pricing.baseAmount + accommodationTotal) * 100) / 100,
        discount_amount: pricing.discountAmount,
        tax_amount: pricing.taxAmount,
        final_amount: finalAmount,
        currency: pricing.currency,
        gateway_amount: gateway.amount,
        gateway_currency: gateway.currency,
        coupon_code: pricing.couponCode,
        status: 'CREATED',
      };
      order = (accommodation
        ? await this.data.createOrderWithAccommodation(orderPayload, {
            optionId: accommodationOptionId,
            checkIn: accommodationCheckIn,
            checkOut: accommodationCheckOut,
            expectedPricePerNight: Number(accommodation.pricePerNight),
          })
        : await this.data.insert('orders', orderPayload)) as Record<string, any>;
    } catch (error) {
      if (pricing.couponCode) await this.data.releaseCoupon(pricing.couponCode);
      await this.data.releaseRegistrationCheckoutClaim(registrationId);
      throw error;
    }
    this.log('ORDER_CREATED', { orderId: order.id, orderNumber: order.order_number, provider, final: pricing.finalAmount });

    let providerOrderId = '';
    let checkoutUrl: string | undefined;
    try {
      if (provider === 'razorpay') {
        providerOrderId = (await this.createRazorpayOrder(order)).id;
      } else if (provider === 'stripe') {
        const session = await this.attachStripeSession(order, reg);
        providerOrderId = session.id;
        checkoutUrl = session.url;
      } else {
        const paypal = await this.attachPayPalOrder(order, reg);
        providerOrderId = paypal.id;
        checkoutUrl = paypal.url;
      }
    } catch (error) {
      await this.data.update('orders', order.id, { status: 'FAILED' });
      // The gateway never accepted this order, so no payment can ever land on
      // it — hand the reserved coupon use back.
      if (order.coupon_code) await this.data.releaseCoupon(order.coupon_code);
      await this.data.releaseRegistrationCheckoutClaim(registrationId);
      this.log('PROVIDER_ORDER_FAILED', { orderId: order.id, provider, error: this.errorMessage(error) });
      throw this.sanitize(error, 'We could not start your payment. Please try again.');
    }

    const updated = (await this.data.attachProviderOrder(order.id, providerOrderId)) as Record<string, any> | null;
    return this.presentOrder(updated || { ...order, status: 'PENDING', provider_order_id: providerOrderId }, reg, checkoutUrl);
  }

  // Shape returned to the client. The Razorpay key id is public; the secret never leaves the server.
  private presentOrder(order: Record<string, any>, reg: Record<string, any>, checkoutUrl?: string) {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      accessToken: order.access_token,
      provider: order.provider,
      quantity: Number(order.quantity ?? 1),
      status: order.status,
      amount: {
        base: Number(order.base_amount),
        discount: Number(order.discount_amount),
        tax: Number(order.tax_amount),
        final: Number(order.final_amount),
        currency: order.currency,
      },
      gatewayAmount: Number(order.gateway_amount),
      gatewayCurrency: order.gateway_currency,
      providerOrderId: order.provider_order_id,
      accommodation: order.accommodation_option_id
        ? {
            optionId: order.accommodation_option_id,
            name: order.accommodation_name,
            checkIn: order.accommodation_check_in,
            checkOut: order.accommodation_check_out,
            nights: Number(order.accommodation_nights),
            pricePerNight: Number(order.accommodation_price_per_night),
            total: Number(order.accommodation_total),
            currency: order.currency,
          }
        : null,
      keyId: order.provider === 'razorpay' ? process.env.RAZORPAY_KEY_ID : undefined,
      checkoutUrl,
      prefill: {
        name: reg.full_name,
        email: reg.email,
        contact: reg.phone && reg.phone !== 'Not provided' ? reg.phone : undefined,
      },
    };
  }

  // Convert the authoritative USD amount into the gateway's smallest unit. (#5)
  private toGatewayAmount(provider: PaymentProvider, amountUsd: number) {
    if (provider === 'razorpay') {
      const rate = Number(process.env.RAZORPAY_USD_TO_INR || 90);
      const inr = Math.round(amountUsd * rate * 100) / 100;
      return { amount: Math.round(inr * 100), currency: 'INR' }; // paise
    }
    return { amount: Math.round(amountUsd * 100), currency: 'USD' }; // cents
  }

  private generateOrderNumber() {
    const year = new Date().getFullYear();
    const random = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
    return `ORD-${year}-${random}`;
  }

  private generateAccessToken() {
    return (randomUUID() + randomUUID()).replace(/-/g, '');
  }

  // --- Gateway order creation -------------------------------------------------

  private async createRazorpayOrder(order: Record<string, any>) {
    const keyId = process.env.RAZORPAY_KEY_ID!;
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(order.gateway_amount), // paise
        currency: order.gateway_currency,
        receipt: order.order_number,
        notes: { registration_id: order.registration_id, order_id: order.id },
      }),
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    const result = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !result.id) {
      throw new BadRequestException(result?.error?.description || 'Razorpay could not create an order');
    }
    this.log('RAZORPAY_ORDER_CREATED', { orderId: order.id, providerOrderId: result.id });
    return { id: String(result.id) };
  }

  private async attachStripeSession(order: Record<string, any>, reg: Record<string, any>) {
    const secretKey = process.env.STRIPE_SECRET_KEY!;
    const frontendUrl = this.frontendUrl();
    const form = new URLSearchParams({
      mode: 'payment',
      success_url: `${frontendUrl}/registration/success?provider=stripe&order=${encodeURIComponent(order.access_token)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/registration/cancel?provider=stripe&order=${encodeURIComponent(order.access_token)}`,
      client_reference_id: order.id,
      'metadata[order_id]': order.id,
      'metadata[registration_id]': order.registration_id,
      'payment_intent_data[metadata][order_id]': order.id,
      'line_items[0][price_data][currency]': String(order.gateway_currency).toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(Number(order.gateway_amount)),
      'line_items[0][price_data][product_data][name]': String(reg.plan_name || 'Conference registration'),
      'line_items[0][quantity]': '1',
    });
    if (reg.email) form.set('customer_email', String(reg.email));
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `order-${order.id}`,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    const result = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !result.url) throw new BadRequestException(result?.error?.message || 'Stripe could not create a checkout session');
    this.log('STRIPE_SESSION_CREATED', { orderId: order.id, providerOrderId: result.id });
    return { id: String(result.id), url: String(result.url) };
  }

  private async attachPayPalOrder(order: Record<string, any>, reg: Record<string, any>) {
    const frontendUrl = this.frontendUrl();
    const paypalOrder = await this.payPalRequest('/v2/checkout/orders', 'POST', {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: order.id,
        custom_id: order.id,
        description: String(reg.plan_name || 'Conference registration'),
        amount: { currency_code: 'USD', value: Number(order.final_amount).toFixed(2) },
      }],
      application_context: {
        return_url: `${frontendUrl}/registration/success?provider=paypal&order=${encodeURIComponent(order.access_token)}`,
        cancel_url: `${frontendUrl}/registration/cancel?provider=paypal&order=${encodeURIComponent(order.access_token)}`,
        user_action: 'PAY_NOW',
      },
    });
    const approvalUrl = (paypalOrder.links as any[])?.find((link) => link.rel === 'approve')?.href;
    if (!approvalUrl) throw new BadRequestException('PayPal did not return an approval URL');
    this.log('PAYPAL_ORDER_CREATED', { orderId: order.id, providerOrderId: paypalOrder.id });
    return { id: String(paypalOrder.id), url: String(approvalUrl) };
  }

  async capturePayPalOrder(accessToken: string, providerOrderId: string) {
    const token = String(accessToken || '').trim();
    const requestedOrderId = String(providerOrderId || '').trim();
    if (!token || !requestedOrderId) throw new BadRequestException('PayPal order and access token are required');

    const order = ((await this.data.list('orders', { access_token: token })) as Record<string, any>[])[0];
    if (!order) throw new NotFoundException('Order not found');
    if (String(order.provider) !== 'paypal' || String(order.provider_order_id) !== requestedOrderId) {
      throw new ConflictException('PayPal order does not match this checkout');
    }
    if (String(order.status).toUpperCase() === 'PAID') {
      return { status: 'PAID', orderNumber: order.order_number };
    }

    let capturedOrder: Record<string, any>;
    try {
      capturedOrder = await this.payPalRequest(`/v2/checkout/orders/${encodeURIComponent(requestedOrderId)}/capture`, 'POST', {});
    } catch (captureError) {
      // A capture may have succeeded even if the network lost its response.
      // Fetching the order makes the browser-return retry idempotent.
      capturedOrder = await this.payPalRequest(`/v2/checkout/orders/${encodeURIComponent(requestedOrderId)}`, 'GET');
      if (String(capturedOrder.status).toUpperCase() !== 'COMPLETED') throw captureError;
    }

    const purchaseUnit = (capturedOrder.purchase_units as Record<string, any>[] | undefined)?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0] as Record<string, any> | undefined;
    if (String(capturedOrder.id) !== requestedOrderId ||
        String(purchaseUnit?.custom_id ?? purchaseUnit?.reference_id ?? '') !== String(order.id)) {
      throw new BadRequestException('PayPal capture does not match the application order');
    }
    if (!capture || String(capturedOrder.status).toUpperCase() !== 'COMPLETED' || String(capture.status).toUpperCase() !== 'COMPLETED') {
      return { status: 'PENDING', orderNumber: order.order_number };
    }

    const capturedMinorUnits = Math.round(Number(capture?.amount?.value) * 100);
    if (!Number.isFinite(capturedMinorUnits) || capturedMinorUnits !== Number(order.gateway_amount) ||
        String(capture?.amount?.currency_code).toUpperCase() !== String(order.gateway_currency).toUpperCase()) {
      throw new BadRequestException('PayPal capture amount or currency does not match the order');
    }

    const settled = await this.markOrderPaid(order, {
      provider: 'paypal',
      providerPaymentId: String(capture.id),
      providerOrderId: requestedOrderId,
      gatewayAmount: capturedMinorUnits,
      gatewayCurrency: String(capture.amount.currency_code).toUpperCase(),
      method: 'paypal',
    });
    return { status: settled ? 'PAID' : 'REFUNDED', orderNumber: order.order_number };
  }

  private async payPalRequest(path: string, method: 'POST' | 'GET', body?: Record<string, unknown>, requestId?: string) {
    const clientId = process.env.PAYPAL_CLIENT_ID!;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET!;
    const baseUrl = process.env.PAYMENT_MODE === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    const tokenData = (await tokenResponse.json().catch(() => ({}))) as any;
    if (!tokenResponse.ok || !tokenData.access_token) throw new ServiceUnavailableException('Could not authenticate with PayPal');
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    const result = (await response.json().catch(() => ({}))) as any;
    if (!response.ok) throw new BadRequestException(result?.message || result?.details?.[0]?.description || 'PayPal request failed');
    return result;
  }

  private frontendUrl() {
    return (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
  }

  // --- Razorpay client-side verification (#11, #20) ---------------------------
  async verifyRazorpayPayment(body: Record<string, unknown>) {
    const razorpayOrderId = String(body.razorpay_order_id ?? '').trim();
    const razorpayPaymentId = String(body.razorpay_payment_id ?? '').trim();
    const signature = String(body.razorpay_signature ?? '').trim();
    if (!razorpayOrderId || !razorpayPaymentId || !signature) {
      throw new BadRequestException('Missing Razorpay verification fields');
    }
    this.log('PAYMENT_VERIFICATION_STARTED', { provider: 'razorpay', razorpayOrderId });

    const order = (await this.data.list('orders', { provider_order_id: razorpayOrderId }))[0] as Record<string, any> | undefined;
    if (!order) throw new NotFoundException('No matching order found');
    if (order.provider !== 'razorpay') throw new BadRequestException('Order/provider mismatch');

    // Signature is HMAC_SHA256(order_id|payment_id) with the key secret.
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new ServiceUnavailableException('Razorpay is not configured');
    const expected = createHmac('sha256', secret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    if (!this.safeCompare(expected, signature)) {
      this.log('PAYMENT_VERIFICATION_FAILED', { orderId: order.id, reason: 'signature' });
      throw new UnauthorizedException('Payment verification failed');
    }

    // Cross-check the payment with Razorpay: amount, currency, capture status. (#20)
    const payment = await this.fetchRazorpayPayment(razorpayPaymentId);
    if (String(payment.order_id) !== razorpayOrderId) {
      throw new BadRequestException('Payment belongs to a different Razorpay order');
    }
    if (Number(payment.amount) !== Number(order.gateway_amount) || String(payment.currency) !== String(order.gateway_currency)) {
      await this.recordFailedPayment(order, { paymentId: razorpayPaymentId, code: 'AMOUNT_MISMATCH', description: 'Amount/currency mismatch' });
      throw new BadRequestException('Payment amount does not match the order');
    }
    if (String(payment.status) === 'failed') {
      await this.recordFailedPayment(order, { paymentId: razorpayPaymentId, code: 'PAYMENT_FAILED', description: 'Razorpay payment failed' });
    }
    if (String(payment.status) !== 'captured') {
      throw new BadRequestException('Payment has not been captured');
    }

    const settled = await this.markOrderPaid(order, {
      provider: 'razorpay',
      providerPaymentId: razorpayPaymentId,
      providerOrderId: razorpayOrderId,
      gatewayAmount: Number(payment.amount),
      gatewayCurrency: String(payment.currency).toUpperCase(),
      signature,
      method: payment.method,
    });
    if (!settled) throw new ConflictException('This order can no longer be settled');
    this.log('PAYMENT_VERIFICATION_SUCCESS', { orderId: order.id });
    return { status: 'PAID', orderNumber: order.order_number, accessToken: order.access_token };
  }

  private async fetchRazorpayPayment(paymentId: string) {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    const result = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !result.id) throw new BadRequestException('Could not verify payment with Razorpay');
    return result;
  }

  private async fetchRazorpayOrderPayments(orderId: string): Promise<Record<string, any>[]> {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    const result = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !Array.isArray(result.items)) throw new ServiceUnavailableException('Could not reconcile with Razorpay');
    return result.items;
  }

  private async fetchStripeCheckoutSession(sessionId: string): Promise<Record<string, any>> {
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    const result = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !result.id) throw new ServiceUnavailableException('Could not reconcile with Stripe');
    return result;
  }

  // --- Status lookup for anonymous buyers: DB is the source of truth (#21, #35) ---
  // Returns the full confirmed transaction so the success page can show the exact
  // details (amounts, coupon, method, gateway ids, timestamp) without trusting
  // the redirect or any client value. Ownership is proven by the access token.
  async getStatus(accessToken: string) {
    const token = String(accessToken || '').trim();
    if (!token) throw new BadRequestException('An order token is required');
    const order = (await this.data.list('orders', { access_token: token }))[0] as Record<string, any> | undefined;
    if (!order) throw new NotFoundException('Order not found');
    const payments = (await this.data.list('payments', { order_id: order.id })) as Record<string, any>[];
    const reg = ((await this.data.list('registration_intents', { id: order.registration_id })) as Record<string, any>[])[0];

    const hasSettledState = ['PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED']
      .includes(String(order.status).toUpperCase());
    const success = hasSettledState ? await this.getVerifiedPayment(order) : undefined;
    const orderStatus = String(order.status).toUpperCase();
    // Non-paid orders may show the latest attempt, but settled states only expose
    // details from the exact verified payment row.
    const settled = success || payments[0];

    return {
      orderNumber: order.order_number,
      provider: order.provider,
      quantity: Number(order.quantity ?? 1),
      status: orderStatus,
      paid: orderStatus === 'PAID' && Boolean(success),
      amount: {
        base: Number(order.base_amount),
        discount: Number(order.discount_amount),
        tax: Number(order.tax_amount),
        final: Number(order.final_amount),
        currency: order.currency,
      },
      gatewayAmount: Number(success?.gateway_amount ?? order.gateway_amount),
      gatewayCurrency: success?.gateway_currency ?? order.gateway_currency,
      registrationId: order.registration_id,
      customerName: reg?.full_name ?? null,
      couponCode: order.coupon_code ?? null,
      method: settled?.method ?? null,
      gatewayPaymentId: success?.provider_payment_id ?? null,
      gatewayOrderId: order.provider_order_id ?? null,
      paidAt: success?.created_at ?? null,
      attempts: payments.map((p) => ({ status: p.status, method: p.method, createdAt: p.created_at })),
      accommodation: success && order.accommodation_option_id
        ? {
            optionId: order.accommodation_option_id,
            name: order.accommodation_name,
            checkIn: order.accommodation_check_in,
            checkOut: order.accommodation_check_out,
            nights: Number(order.accommodation_nights),
            pricePerNight: Number(order.accommodation_price_per_night),
            total: Number(order.accommodation_total),
            currency: order.currency,
          }
        : null,
    };
  }

  private async getVerifiedPayment(order: Record<string, any>) {
    const rows = (await this.data.list('payments', {
      order_id: order.id,
      status: 'SUCCESS',
    })) as Record<string, any>[];
    const validRows = rows.filter((payment) =>
      String(payment.provider).toLowerCase() === String(order.provider).toLowerCase() &&
      Boolean(payment.provider_payment_id) &&
      String(payment.provider_order_id || '') === String(order.provider_order_id || '') &&
      Number(payment.amount) === Number(order.final_amount) &&
      String(payment.currency).toUpperCase() === String(order.currency).toUpperCase() &&
      Number(payment.gateway_amount) === Number(order.gateway_amount) &&
      String(payment.gateway_currency).toUpperCase() === String(order.gateway_currency).toUpperCase(),
    );
    if (validRows.length !== 1) {
      throw new ServiceUnavailableException('Verified payment transaction is unavailable or inconsistent');
    }
    return validRows[0];
  }

  // --- Anonymous receipt download: gated by the access token + PAID state ------
  // Registrants have no login; the unguessable access token proves ownership and
  // the receipt is only issued once the order is actually PAID. Reuses the same
  // generator the admin panel uses, so both get an identical receipt. (#21, #35)
  async getReceiptByToken(accessToken: string) {
    const token = String(accessToken || '').trim();
    if (!token) throw new BadRequestException('An order token is required');
    const order = (await this.data.list('orders', { access_token: token }))[0] as Record<string, any> | undefined;
    if (!order) throw new NotFoundException('Order not found');
    if (!['PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(String(order.status).toUpperCase())) {
      throw new BadRequestException('Your receipt is available once the payment is confirmed.');
    }
    await this.getVerifiedPayment(order);
    // Bind the receipt to THIS token's exact order, so a registration with
    // several orders always yields the receipt for the one actually paid here.
    return this.data.getReceipt(order.registration_id, order.id);
  }

  async getPaymentAudit(orderId: string) {
    const id = String(orderId || '').trim();
    if (!id) throw new BadRequestException('Order id is required');
    const order = (await this.data.list('orders', { id })) as Record<string, any>[];
    if (!order.length) throw new NotFoundException('Order not found');
    return this.data.listPaymentAudit(id);
  }

  async reconcileOrder(orderId: string, actorUserId?: string) {
    const id = String(orderId || '').trim();
    if (!id) throw new BadRequestException('Order id is required');
    const order = ((await this.data.list('orders', { id })) as Record<string, any>[])[0];
    if (!order) throw new NotFoundException('Order not found');
    const initialStatus = String(order.status || '').toUpperCase();
    if (['REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(initialStatus)) {
      return { orderNumber: order.order_number, status: initialStatus, reconciled: false, reason: 'Refund state requires refund reconciliation' };
    }
    if (initialStatus === 'PAID') return { orderNumber: order.order_number, status: 'PAID', reconciled: true };
    if (!order.provider_order_id) throw new ConflictException('Gateway order ID is not available yet');
    this.assertProviderConfigured(order.provider as PaymentProvider);

    let providerReference: string | undefined;
    if (order.provider === 'razorpay') {
      const payments = await this.fetchRazorpayOrderPayments(String(order.provider_order_id));
      const captured = payments.find((payment: Record<string, any>) => String(payment.status) === 'captured');
      if (captured) {
        if (String(captured.order_id) !== String(order.provider_order_id) ||
            Number(captured.amount) !== Number(order.gateway_amount) ||
            String(captured.currency) !== String(order.gateway_currency)) {
          throw new BadRequestException('Razorpay payment does not match the stored order');
        }
        providerReference = String(captured.id);
        await this.markOrderPaid(order, {
          provider: 'razorpay',
          providerOrderId: order.provider_order_id,
          providerPaymentId: providerReference,
          gatewayAmount: Number(captured.amount),
          gatewayCurrency: String(captured.currency).toUpperCase(),
          method: captured.method,
        });
      } else if (payments.length && payments.every((payment: Record<string, any>) => String(payment.status) === 'failed')) {
        await this.recordFailedPayment(order, { paymentId: payments[0].id, code: 'RECONCILED_FAILED' });
      }
    } else if (order.provider === 'stripe') {
      const session = await this.fetchStripeCheckoutSession(String(order.provider_order_id));
      if (String(session.id) !== String(order.provider_order_id) || String(session.metadata?.order_id) !== String(order.id)) {
        throw new BadRequestException('Stripe session does not match the stored order');
      }
      if (String(session.payment_status) === 'paid') {
        if (Number(session.amount_total) !== Number(order.gateway_amount) ||
            String(session.currency).toUpperCase() !== String(order.gateway_currency).toUpperCase()) {
          throw new BadRequestException('Stripe session amount or currency does not match the stored order');
        }
        providerReference = String(session.payment_intent || session.id);
        await this.markOrderPaid(order, {
          provider: 'stripe',
          providerOrderId: session.id,
          providerPaymentId: providerReference,
          gatewayAmount: Number(session.amount_total),
          gatewayCurrency: String(session.currency).toUpperCase(),
        });
      } else if (String(session.status) === 'expired') {
        await this.recordFailedPayment(order, { code: 'RECONCILED_EXPIRED' });
      }
    } else {
      const paypalOrder = await this.payPalRequest(`/v2/checkout/orders/${encodeURIComponent(String(order.provider_order_id))}`, 'GET');
      if (String(paypalOrder.id) !== String(order.provider_order_id)) throw new BadRequestException('PayPal order does not match the stored order');
      const unit = (paypalOrder.purchase_units as Record<string, any>[] | undefined)?.[0];
      const capture = unit?.payments?.captures?.[0] as Record<string, any> | undefined;
      if (String(unit?.custom_id ?? unit?.reference_id ?? '') !== String(order.id)) {
        throw new BadRequestException('PayPal order does not belong to the stored application order');
      }
      if (capture && String(capture.status).toUpperCase() === 'COMPLETED') {
        const amountMinor = Math.round(Number(capture.amount?.value) * 100);
        if (amountMinor !== Number(order.gateway_amount) ||
            String(capture.amount?.currency_code).toUpperCase() !== String(order.gateway_currency).toUpperCase()) {
          throw new BadRequestException('PayPal capture amount or currency does not match the stored order');
        }
        providerReference = String(capture.id);
        await this.markOrderPaid(order, {
          provider: 'paypal',
          providerOrderId: paypalOrder.id,
          providerPaymentId: providerReference,
          gatewayAmount: amountMinor,
          gatewayCurrency: String(capture.amount.currency_code).toUpperCase(),
          method: 'paypal',
        });
      } else if (['VOIDED', 'PAYER_ACTION_REQUIRED'].includes(String(paypalOrder.status).toUpperCase())) {
        await this.recordFailedPayment(order, { paymentId: capture?.id, code: 'RECONCILED_FAILED' });
      }
    }

    const latest = ((await this.data.list('orders', { id })) as Record<string, any>[])[0] || order;
    await this.data.recordPaymentAudit({
      orderId: id,
      actorUserId,
      provider: order.provider,
      action: 'PAYMENT_RECONCILED',
      previousStatus: initialStatus,
      newStatus: String(latest.status).toUpperCase(),
      amountMinor: Number(order.gateway_amount),
      currency: order.gateway_currency,
      providerReference,
    });
    return { orderNumber: order.order_number, status: String(latest.status).toUpperCase(), reconciled: true, providerReference: providerReference || null };
  }

  // --- Order/payment state transitions ---------------------------------------
  // Marks an order paid and records the successful attempt. Idempotent: safe to
  // call from both the client verification path and the webhook. (#19, #26)
  private async markOrderPaid(
    order: Record<string, any>,
    details: {
      provider: string;
      providerPaymentId?: string;
      providerOrderId?: string;
      gatewayAmount?: number;
      gatewayCurrency?: string;
      signature?: string;
      method?: string;
      eventId?: string;
    },
  ): Promise<boolean> {
    // Re-read the order from the DB so we act on its current status, never on a
    // stale copy captured before a concurrent verify/webhook already finalized it.
    let current = ((await this.data.list('orders', { id: order.id })) as Record<string, any>[])[0] || order;
    const statusNow = String(current.status || '').toUpperCase();
    if (['REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(statusNow)) {
      this.logger.warn(`Ignoring settlement for ${statusNow.toLowerCase()} order ${current.id}`);
      return false;
    }
    if (details.providerOrderId) {
      if (current.provider_order_id && String(current.provider_order_id) !== String(details.providerOrderId)) {
        throw new ConflictException('Provider order is already associated with a different gateway order');
      }
      if (!current.provider_order_id) {
        current = (await this.data.attachProviderOrder(current.id, details.providerOrderId)) || {
          ...current,
          provider_order_id: details.providerOrderId,
        };
      }
    }
    if (!Number.isSafeInteger(details.gatewayAmount) ||
        details.gatewayAmount !== Number(current.gateway_amount) ||
        String(details.gatewayCurrency || '').toUpperCase() !== String(current.gateway_currency).toUpperCase()) {
      throw new ConflictException('Verified gateway amount or currency does not match the stored order');
    }

    if (details.providerPaymentId) {
      const already = (await this.data.list('payments', { provider_payment_id: details.providerPaymentId })) as Record<string, any>[];
      if (already.length) {
        if (String(already[0].order_id) !== String(current.id)) {
          throw new ConflictException('Payment is already associated with another order');
        }
        if (String(already[0].provider).toLowerCase() !== String(details.provider).toLowerCase() ||
            String(already[0].provider_order_id || '') !== String(details.providerOrderId || current.provider_order_id || '')) {
          throw new ConflictException('Payment transaction does not match the verified provider order');
        }
        const existingStatus = String(already[0].status).toUpperCase();
        const existingGatewayAmount = already[0].gateway_amount;
        const existingGatewayCurrency = already[0].gateway_currency;
        if ((existingStatus === 'SUCCESS' || existingGatewayAmount != null || existingGatewayCurrency != null) &&
            (Number(existingGatewayAmount) !== details.gatewayAmount ||
             String(existingGatewayCurrency).toUpperCase() !== String(details.gatewayCurrency).toUpperCase())) {
          throw new ConflictException('Payment transaction does not match the verified gateway amount');
        }
        if (existingStatus === 'REFUNDED') return false;
        if (existingStatus !== 'SUCCESS') {
          await this.data.update('payments', already[0].id, {
            status: 'SUCCESS',
            provider_order_id: details.providerOrderId || current.provider_order_id || null,
            provider_signature: details.signature || null,
            gateway_amount: details.gatewayAmount,
            gateway_currency: String(details.gatewayCurrency).toUpperCase(),
            method: details.method || null,
            event_id: details.eventId || null,
          });
        }
        return this.syncPaidState(current);
      }
    }

    try {
      await this.data.insert('payments', {
        order_id: current.id,
        provider: details.provider,
        provider_payment_id: details.providerPaymentId || null,
        provider_order_id: details.providerOrderId || current.provider_order_id || null,
        provider_signature: details.signature || null,
        amount: Number(current.final_amount),
        currency: current.currency,
        gateway_amount: details.gatewayAmount,
        gateway_currency: String(details.gatewayCurrency).toUpperCase(),
        status: 'SUCCESS',
        method: details.method || null,
        event_id: details.eventId || null,
      });
    } catch (error) {
      // A concurrent insert lost the unique-constraint race: the payment already exists.
      if (!/duplicate|unique/i.test(this.errorMessage(error))) throw error;
      if (details.providerPaymentId) {
        const racedPayment = ((await this.data.list('payments', { provider_payment_id: details.providerPaymentId })) as Record<string, any>[])[0];
        if (!racedPayment || String(racedPayment.order_id) !== String(current.id)) {
          throw new ConflictException('Payment is already associated with another order');
        }
      }
    }

    const synchronized = await this.syncPaidState(current);
    if (!synchronized) return false;
    this.log('ORDER_MARKED_PAID', { orderId: current.id, orderNumber: current.order_number });
    return true;
  }

  private async syncPaidState(order: Record<string, any>): Promise<boolean> {
    await this.data.transitionOrderStatus(order.id, ['CREATED', 'PENDING', 'FAILED', 'CANCELLED', 'PAID'], 'PAID');
    const current = ((await this.data.list('orders', { id: order.id })) as Record<string, any>[])[0];
    if (!current || String(current.status).toUpperCase() !== 'PAID') return false;

    // Confirm the registration exactly once. If it is already 'paid' we must NOT
    // call updateRegistrationPayment again, because that path re-sends the
    // confirmation email — this makes duplicate verify+webhook safe. (#17)
    const reg = ((await this.data.list('registration_intents', { id: current.registration_id })) as Record<string, any>[])[0];
    if (reg && String(reg.payment_status || '').toLowerCase() === 'paid') return true;

    await this.data.updateRegistrationPayment({
      p_registration_id: current.registration_id,
      p_payment_status: 'paid',
      p_payment_provider: current.provider,
      p_payment_order_id: current.provider_order_id,
      p_payment_reference: `${current.provider}:order:${current.order_number}`,
      p_gateway_response: { orderId: current.id, orderNumber: current.order_number, confirmedAt: new Date().toISOString() },
    });
    return true;

    // The coupon use was already reserved when this order was created (see
    // createOrder / reserveCoupon), so there is nothing to consume here. A paid
    // order simply keeps the use it reserved.
  }

  private async recordFailedPayment(
    order: Record<string, any>,
    details: { paymentId?: string; code?: string; description?: string; eventId?: string },
  ) {
    try {
      await this.data.insert('payments', {
        order_id: order.id,
        provider: order.provider,
        provider_payment_id: details.paymentId || null,
        provider_order_id: order.provider_order_id || null,
        amount: Number(order.final_amount),
        currency: order.currency,
        status: 'FAILED',
        error_code: details.code || null,
        error_description: details.description || null,
        event_id: details.eventId || null,
      });
    } catch (error) {
      if (!/duplicate|unique/i.test(this.errorMessage(error))) throw error;
    }
    // Re-read the current status: never regress a PAID order to FAILED because
    // of an out-of-order or late failure event. (#9)
    const current = ((await this.data.list('orders', { id: order.id })) as Record<string, any>[])[0] || order;
    const statusNow = String(current.status || '').toUpperCase();
    if (['CREATED', 'PENDING'].includes(statusNow)) {
      // Release the coupon use this order reserved, but only on its FIRST move
      // into a failed state — so a buyer who retries after a failure gets the
      // coupon back and can reuse it, while repeated failure events for the same
      // order don't drive the counter down more than once.
      const transitioned = await this.data.transitionOrderStatus(order.id, ['CREATED', 'PENDING'], 'FAILED');
      if (transitioned) {
        if (current.coupon_code) await this.data.releaseCoupon(current.coupon_code);
        await this.data.releaseRegistrationCheckoutClaim(current.registration_id);
      }
    }
    this.log('PAYMENT_FAILED_RECORDED', { orderId: order.id, code: details.code });
  }

  // --- Cancel (buyer-initiated, token-owned) ----------------------------------
  // Called when a buyer returns from a cancelled/abandoned checkout. Marks the
  // order CANCELLED and hands its reserved coupon use back immediately, instead
  // of waiting for the stale-order sweeper. Never touches a PAID order.
  async cancelOrder(accessToken: string) {
    const token = String(accessToken || '').trim();
    if (!token) throw new BadRequestException('An order token is required');
    const order = (await this.data.list('orders', { access_token: token }))[0] as Record<string, any> | undefined;
    if (!order) throw new NotFoundException('Order not found');

    const statusNow = String(order.status || '').toUpperCase();
    if (['PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(statusNow)) {
      return { status: statusNow, orderNumber: order.order_number };
    }
    if (statusNow === 'CANCELLED') return { status: 'CANCELLED', orderNumber: order.order_number };

    if (!['CREATED', 'PENDING', 'FAILED'].includes(statusNow)) throw new ConflictException('Order cannot be cancelled from its current state');
    const transitioned = await this.data.transitionOrderStatus(order.id, ['CREATED', 'PENDING', 'FAILED'], 'CANCELLED');
    if (!transitioned) {
      const latest = ((await this.data.list('orders', { id: order.id })) as Record<string, any>[])[0];
      return { status: String(latest?.status || 'PENDING'), orderNumber: order.order_number };
    }
    if (['CREATED', 'PENDING'].includes(statusNow) && order.coupon_code) await this.data.releaseCoupon(order.coupon_code);
    await this.data.releaseRegistrationCheckoutClaim(order.registration_id);
    this.log('ORDER_CANCELLED', { orderId: order.id, orderNumber: order.order_number });
    return { status: 'CANCELLED', orderNumber: order.order_number };
  }

  // --- Refunds ----------------------------------------------------------------
  // Reconcile a refund that happened at the gateway (webhook-driven for any
  // provider, or right after an admin-initiated refund). Records a REFUNDED
  // payment row, flips the order to REFUNDED, and marks the registration
  // refunded. Idempotent on (order already REFUNDED) and on the gateway refund id.
  private async recordRefund(
    order: Record<string, any>,
    details: { refundId?: string; providerPaymentId?: string; amountMinor?: number; currency?: string; status?: string; eventId?: string; actorUserId?: string },
  ) {
    const current = ((await this.data.list('orders', { id: order.id })) as Record<string, any>[])[0] || order;
    const refundId = String(details.refundId || '').trim();
    const paymentId = String(details.providerPaymentId || '').trim();
    if (!refundId || !paymentId) throw new BadRequestException('Provider refund and payment IDs are required');

    const payment = ((await this.data.list('payments', { provider_payment_id: paymentId })) as Record<string, any>[])[0];
    if (!payment || String(payment.order_id) !== String(current.id) || String(payment.status).toUpperCase() !== 'SUCCESS') {
      throw new ConflictException('Refund payment does not belong to this paid order');
    }

    const amountMinor = Number(details.amountMinor ?? current.gateway_amount);
    const currency = String(details.currency || current.gateway_currency).toUpperCase();
    const status = String(details.status || 'PENDING').toUpperCase();
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > Number(current.gateway_amount) ||
        currency !== String(current.gateway_currency).toUpperCase()) {
      throw new BadRequestException('Refund amount or currency does not match the order');
    }
    if (!['PENDING', 'SUCCEEDED', 'FAILED'].includes(status)) throw new BadRequestException('Unknown provider refund status');

    const existing = (await this.data.list('refunds', { provider: current.provider, provider_refund_id: refundId })) as Record<string, any>[];
    const existingRefund = existing[0];
    if (existingRefund && (String(existingRefund.order_id) !== String(current.id) || String(existingRefund.provider_payment_id) !== paymentId)) {
      throw new ConflictException('Refund is already associated with another payment');
    }
    if (existingRefund && String(existingRefund.status).toUpperCase() !== 'PENDING') {
      if (String(existingRefund.status).toUpperCase() === 'SUCCEEDED') {
        await this.syncRefundedOrderStatus(current);
      }
      return { status: current.status, orderNumber: current.order_number, duplicate: true };
    }
    if (existingRefund && (Number(existingRefund.amount_minor) !== amountMinor || String(existingRefund.currency).toUpperCase() !== currency)) {
      throw new ConflictException('Provider refund details changed during processing');
    }
    if (details.eventId) {
      const duplicateEvent = (await this.data.list('refunds', { provider: current.provider, event_id: details.eventId })) as Record<string, any>[];
      if (duplicateEvent.length && String(duplicateEvent[0].provider_refund_id) !== refundId) {
        throw new ConflictException('Refund event is already associated with another refund');
      }
      if (duplicateEvent.length && !existingRefund) return { status: current.status, orderNumber: current.order_number, duplicate: true };
    }

    const previousSuccessful = (await this.data.list('refunds', { order_id: current.id, status: 'SUCCEEDED' })) as Record<string, any>[];
    const wasSuccessful = String(existingRefund?.status || '').toUpperCase() === 'SUCCEEDED';
    const totalRefundedMinor = previousSuccessful.reduce((sum, refund) => sum + Number(refund.amount_minor), 0) +
      (status === 'SUCCEEDED' && !wasSuccessful ? amountMinor : 0);
    if (totalRefundedMinor > Number(current.gateway_amount)) throw new ConflictException('Refund exceeds the captured payment amount');

    if (existingRefund) {
      await this.data.update('refunds', String(existingRefund.id), { status, event_id: details.eventId || existingRefund.event_id || null });
    } else {
      try {
        await this.data.insert('refunds', {
          order_id: current.id,
          provider: current.provider,
          provider_refund_id: refundId,
          provider_payment_id: paymentId,
          amount_minor: amountMinor,
          currency,
          status,
          event_id: details.eventId || null,
        });
      } catch (error) {
        if (!/duplicate|unique/i.test(this.errorMessage(error))) throw error;
        const racedRefund = (await this.data.list('refunds', { provider: current.provider, provider_refund_id: refundId })) as Record<string, any>[];
        if (!racedRefund.length || String(racedRefund[0].order_id) !== String(current.id)) {
          throw new ConflictException('Refund is already associated with another order');
        }
        return { status: current.status, orderNumber: current.order_number, duplicate: true };
      }
    }

    let orderStatus = String(current.status || '').toUpperCase();
    if (status === 'SUCCEEDED') {
      orderStatus = await this.syncRefundedOrderStatus(current);
    } else if (status === 'FAILED') {
      const existingSuccessful = totalRefundedMinor > 0 || (await this.data.list('refunds', { order_id: current.id, status: 'SUCCEEDED' }) as Record<string, any>[]).length > 0;
      if (!existingSuccessful && String(current.status).toUpperCase() === 'REFUND_PENDING') {
        await this.data.releaseOrderRefundClaim(current.id);
        orderStatus = 'PAID';
      } else {
        orderStatus = await this.syncRefundedOrderStatus(current);
      }
    } else if (orderStatus === 'PAID') {
      await this.data.update('orders', current.id, { status: 'REFUND_PENDING' });
      orderStatus = 'REFUND_PENDING';
    }


    await this.data.recordPaymentAudit({
      orderId: current.id,
      actorUserId: details.actorUserId,
      provider: current.provider,
      action: 'REFUND_RECONCILED',
      previousStatus: String(current.status || '').toUpperCase(),
      newStatus: orderStatus,
      amountMinor,
      currency,
      providerReference: refundId,
    });
    this.log('REFUND_RECORDED', { orderId: current.id, orderNumber: current.order_number, refundId, status });
    return { status: orderStatus, refundId, orderNumber: current.order_number };
  }

  private async syncRefundedOrderStatus(order: Record<string, any>): Promise<string> {
    const successful = (await this.data.list('refunds', { order_id: order.id, status: 'SUCCEEDED' })) as Record<string, any>[];
    const totalRefundedMinor = successful.reduce((sum, refund) => sum + Number(refund.amount_minor), 0);
    if (totalRefundedMinor <= 0) return String(order.status || '').toUpperCase();

    const status = totalRefundedMinor >= Number(order.gateway_amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await this.data.update('orders', order.id, { status });
    const registrationStatus = status === 'REFUNDED' ? 'refunded' : 'partially_refunded';
    await this.data.update('registration_intents', order.registration_id, {
      payment_status: registrationStatus,
      status: registrationStatus,
    });
    return status;
  }

  // Admin-initiated refund: calls the gateway's refund API for a PAID order,
  // then reconciles local state. The matching refund webhook (if configured) is
  // idempotent against this via recordRefund.
  async initiateRefund(orderId: string, actorUserId?: string) {
    const id = String(orderId || '').trim();
    if (!id) throw new BadRequestException('Order id is required');
    const order = (await this.data.list('orders', { id }))[0] as Record<string, any> | undefined;
    if (!order) throw new NotFoundException('Order not found');
    if (String(order.status || '').toUpperCase() === 'REFUNDED') {
      return { status: 'REFUNDED', orderNumber: order.order_number, alreadyRefunded: true };
    }
    if (String(order.status || '').toUpperCase() === 'REFUND_PENDING') {
      throw new ConflictException('A refund is already in progress');
    }
    if (String(order.status || '').toUpperCase() !== 'PAID') {
      throw new BadRequestException('Only a paid order can be refunded');
    }

    const success = ((await this.data.list('payments', { order_id: order.id, status: 'SUCCESS' })) as Record<string, any>[])[0];
    const providerPaymentId = success?.provider_payment_id as string | undefined;
    if (!providerPaymentId) throw new BadRequestException('No successful provider payment is available to refund');
    if (!(await this.data.claimOrderRefund(order.id))) throw new ConflictException('A refund is already in progress');
    try {
      await this.data.recordPaymentAudit({
        orderId: order.id,
        actorUserId,
        provider: order.provider,
        action: 'REFUND_INITIATED',
        previousStatus: 'PAID',
        newStatus: 'REFUND_PENDING',
        amountMinor: Number(order.gateway_amount),
        currency: order.gateway_currency,
        providerReference: providerPaymentId,
      });
    } catch (error) {
      await this.data.releaseOrderRefundClaim(order.id);
      throw error;
    }
    this.log('REFUND_INITIATED', { orderId: order.id, provider: order.provider });

    let providerRefund: Record<string, any>;
    try {
      if (order.provider === 'razorpay') {
        providerRefund = await this.refundRazorpay(providerPaymentId);
      } else if (order.provider === 'stripe') {
        providerRefund = await this.refundStripe(providerPaymentId, order.id);
      } else {
        providerRefund = await this.refundPayPal(providerPaymentId, order.id);
      }
    } catch (error) {
      if (error instanceof BadRequestException && error.getStatus() < 500) {
        await this.data.releaseOrderRefundClaim(order.id);
        await this.data.recordPaymentAudit({
          orderId: order.id,
          actorUserId,
          provider: order.provider,
          action: 'REFUND_REJECTED',
          previousStatus: 'REFUND_PENDING',
          newStatus: 'PAID',
          amountMinor: Number(order.gateway_amount),
          currency: order.gateway_currency,
          providerReference: providerPaymentId,
        });
        throw this.sanitize(error, 'The refund was rejected by the payment provider.');
      }
      this.logger.error(`Refund outcome is uncertain for order ${order.id}; keeping the refund lock for reconciliation.`);
      throw new ServiceUnavailableException('Refund outcome is uncertain. Do not retry until the provider status is reconciled.');
    }

    const amountMinor = order.provider === 'paypal'
      ? Math.round(Number(providerRefund.amount?.value) * 100)
      : Number(providerRefund.amount);
    return this.recordRefund(order, {
      refundId: providerRefund.id,
      providerPaymentId,
      amountMinor,
      currency: order.provider === 'paypal' ? providerRefund.amount?.currency_code : providerRefund.currency,
      status: this.normalizeRefundStatus(providerRefund.status),
      actorUserId,
    });
  }

  private normalizeRefundStatus(value: unknown): 'PENDING' | 'SUCCEEDED' | 'FAILED' {
    const status = String(value || '').toLowerCase();
    if (['processed', 'succeeded', 'completed'].includes(status)) return 'SUCCEEDED';
    if (['failed', 'rejected', 'denied', 'cancelled', 'canceled'].includes(status)) return 'FAILED';
    return 'PENDING';
  }

  private async refundRazorpay(paymentId: string): Promise<Record<string, any>> {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed: 'normal' }),
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    const result = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !result.id) throw new BadRequestException(result?.error?.description || 'Razorpay refund failed');
    return result;
  }

  private async refundStripe(paymentIntentId: string, orderId: string): Promise<Record<string, any>> {
    const response = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `refund-${orderId}`,
      },
      body: new URLSearchParams({ payment_intent: paymentIntentId }).toString(),
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    const result = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !result.id) throw new BadRequestException(result?.error?.message || 'Stripe refund failed');
    return result;
  }

  private async refundPayPal(captureId: string, orderId: string): Promise<Record<string, any>> {
    const result = await this.payPalRequest(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, 'POST', {}, `refund-${orderId}`);
    if (!result?.id) throw new BadRequestException('PayPal refund failed');
    return result;
  }

  // --- Webhooks (#22, #23): verify signature, then reconcile order state -------
  async handleWebhook(
    provider: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
    payload: Record<string, any>,
  ) {
    const normalized = String(provider || '').toLowerCase();
    if (!this.isProvider(normalized)) throw new BadRequestException('Unsupported webhook provider');
    if (!rawBody?.length) throw new BadRequestException('Webhook body is missing');
    this.log('WEBHOOK_RECEIVED', { provider: normalized });

    if (normalized === 'razorpay') return this.handleRazorpayWebhook(rawBody, headers, payload);
    if (normalized === 'stripe') return this.handleStripeWebhook(rawBody, headers, payload);
    return this.handlePayPalWebhook(headers, payload);
  }

  private async handleRazorpayWebhook(rawBody: Buffer, headers: Record<string, any>, payload: Record<string, any>) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Razorpay webhook verification is not configured');
    const signature = this.header(headers, 'x-razorpay-signature');
    if (!signature) throw new UnauthorizedException('Missing Razorpay signature');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!this.safeCompare(expected, signature)) throw new UnauthorizedException('Invalid Razorpay webhook signature');

    const eventId = this.header(headers, 'x-razorpay-event-id') || undefined;
    const entity = payload?.payload?.payment?.entity as Record<string, any> | undefined;
    const refundEntity = payload?.payload?.refund?.entity as Record<string, any> | undefined;
    const razorpayOrderId = entity?.order_id;
    const internalOrderId = entity?.notes?.order_id;
    const refundPaymentId = refundEntity?.payment_id || entity?.id;
    if (!razorpayOrderId && !internalOrderId && !refundPaymentId) return { received: true, ignored: true };
    let order = (razorpayOrderId
      ? (await this.data.list('orders', { provider_order_id: razorpayOrderId }))[0]
      : undefined) as Record<string, any> | undefined;
    if (!order && internalOrderId) {
      order = ((await this.data.list('orders', { id: internalOrderId }))[0]) as Record<string, any> | undefined;
    }
    if (!order && refundPaymentId) order = await this.findOrderByProviderPayment('razorpay', String(refundPaymentId));
    if (!order) throw new ServiceUnavailableException('Razorpay webhook order is not available yet');
    if (String(order.provider).toLowerCase() !== 'razorpay') throw new ConflictException('Razorpay webhook does not own this order');

    if (['payment.captured', 'order.paid'].includes(String(payload.event))) {
      if (!entity?.id) return { received: true, ignored: true };
      const payment = await this.fetchRazorpayPayment(String(entity.id));
        if (String(payment.order_id) !== String(razorpayOrderId) ||
          (order.provider_order_id && String(payment.order_id) !== String(order.provider_order_id)) ||
          Number(payment.amount) !== Number(order.gateway_amount) ||
          String(payment.currency) !== String(order.gateway_currency)) {
        throw new BadRequestException('Razorpay payment does not match the order');
      }
      if (String(payment.status) !== 'captured') return { received: true, pending: true, provider: 'razorpay' };
      await this.markOrderPaid(order, {
        provider: 'razorpay',
        providerPaymentId: payment.id,
        providerOrderId: razorpayOrderId,
        gatewayAmount: Number(payment.amount),
        gatewayCurrency: String(payment.currency).toUpperCase(),
        method: payment.method,
        eventId,
      });
    } else if (payload.event === 'payment.failed') {
      await this.recordFailedPayment(order, { paymentId: entity?.id, code: entity?.error_code, description: entity?.error_description, eventId });
    } else if (['refund.processed', 'refund.created', 'payment.refunded'].includes(String(payload.event))) {
      const refund = refundEntity;
      await this.recordRefund(order, {
        refundId: refund?.id,
        providerPaymentId: refund?.payment_id || entity?.id || refundPaymentId,
        amountMinor: refund?.amount != null ? Number(refund.amount) : undefined,
        currency: refund?.currency || order.gateway_currency,
        status: this.normalizeRefundStatus(refund?.status || (payload.event === 'refund.processed' ? 'processed' : 'created')),
        eventId,
      });
    }
    return { received: true, provider: 'razorpay' };
  }

  private async handleStripeWebhook(rawBody: Buffer, headers: Record<string, any>, payload: Record<string, any>) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Stripe webhook verification is not configured');
    this.verifyStripeSignature(rawBody, secret, this.header(headers, 'stripe-signature'));

    const eventId = String(payload.id || '') || undefined;
    const object = payload?.data?.object as Record<string, any> | undefined;
    const orderId = object?.metadata?.order_id;
    const eventType = String(payload.type);
    const isRefundEvent = ['charge.refunded', 'refund.updated', 'charge.refund.updated'].includes(eventType);
    const providerPaymentId = object?.payment_intent || (object?.object === 'payment_intent' ? object?.id : undefined);
    const order = (orderId
      ? (await this.data.list('orders', { id: orderId }))[0]
      : isRefundEvent && providerPaymentId
        ? await this.findOrderByProviderPayment('stripe', String(providerPaymentId))
        : undefined) as Record<string, any> | undefined;
    if (!order) {
      if (orderId || (isRefundEvent && providerPaymentId)) throw new ServiceUnavailableException('Stripe webhook order is not available yet');
      return { received: true, ignored: true };
    }

    if (String(order.provider) !== 'stripe') throw new BadRequestException('Order/provider mismatch');
    const isCheckoutSession = eventType === 'checkout.session.completed' || eventType === 'checkout.session.async_payment_succeeded';
    const paid = isCheckoutSession || eventType === 'payment_intent.succeeded';
    if (paid) {
      if (isCheckoutSession && String(object?.payment_status) !== 'paid') {
        return { received: true, pending: true, provider: 'stripe' };
      }
      if (isCheckoutSession && order.provider_order_id && String(object?.id) !== String(order.provider_order_id)) {
        throw new BadRequestException('Stripe session does not match the order');
      }
      const paidAmount = isCheckoutSession ? object?.amount_total : object?.amount_received ?? object?.amount;
      if (Number(paidAmount) !== Number(order.gateway_amount) ||
          String(object?.currency).toUpperCase() !== String(order.gateway_currency).toUpperCase()) {
        throw new BadRequestException('Stripe payment does not match the order amount or currency');
      }
      await this.markOrderPaid(order, {
        provider: 'stripe',
        providerPaymentId: object?.payment_intent || object?.id,
        providerOrderId: isCheckoutSession ? object?.id : undefined,
        gatewayAmount: Number(paidAmount),
        gatewayCurrency: String(object?.currency).toUpperCase(),
        eventId,
      });
    } else if (String(payload.type) === 'checkout.session.expired') {
      await this.recordFailedPayment(order, { code: 'EXPIRED', description: 'Checkout session expired', eventId });
    } else if (isRefundEvent) {
      const refunds = eventType === 'charge.refunded'
        ? (Array.isArray(object?.refunds?.data) ? object.refunds.data as Record<string, any>[] : [])
        : [object];
      for (const [index, refund] of refunds.entries()) {
        if (!refund?.id) continue;
        await this.recordRefund(order, {
          refundId: refund.id,
          providerPaymentId: refund.payment_intent || providerPaymentId,
          amountMinor: Number(refund.amount),
          currency: refund.currency || object?.currency || order.gateway_currency,
          status: this.normalizeRefundStatus(refund.status || (payload.type === 'charge.refunded' ? 'succeeded' : 'pending')),
          eventId: index === 0 ? eventId : undefined,
        });
      }
    }
    return { received: true, provider: 'stripe' };
  }

  private async handlePayPalWebhook(headers: Record<string, any>, payload: Record<string, any>) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) throw new ServiceUnavailableException('PayPal webhook verification is not configured');
    const verification = await this.payPalRequest('/v1/notifications/verify-webhook-signature', 'POST', {
      auth_algo: this.header(headers, 'paypal-auth-algo'),
      cert_url: this.header(headers, 'paypal-cert-url'),
      transmission_id: this.header(headers, 'paypal-transmission-id'),
      transmission_sig: this.header(headers, 'paypal-transmission-sig'),
      transmission_time: this.header(headers, 'paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: payload,
    });
    if (verification.verification_status !== 'SUCCESS') throw new UnauthorizedException('Invalid PayPal webhook signature');

    const eventId = String(payload.id || '') || undefined;
    const resource = payload?.resource as Record<string, any> | undefined;
    const internalOrderId = resource?.custom_id || resource?.purchase_units?.[0]?.custom_id;
    const providerOrderId = resource?.supplementary_data?.related_ids?.order_id || resource?.order_id;
    const captureId = resource?.supplementary_data?.related_ids?.capture_id ||
      (String(payload.event_type) === 'PAYMENT.CAPTURE.REFUNDED'
        ? (resource?.links as Record<string, any>[] | undefined)?.find((link) => link.rel === 'up')?.href?.split('/').pop()
        : resource?.id);
    if (!internalOrderId && !providerOrderId && !captureId) return { received: true, ignored: true };
    const order = (internalOrderId
      ? (await this.data.list('orders', { id: internalOrderId }))[0]
      : providerOrderId
        ? (await this.data.list('orders', { provider_order_id: providerOrderId }))[0]
        : await this.findOrderByProviderPayment('paypal', String(captureId))) as Record<string, any> | undefined;
    if (!order) throw new ServiceUnavailableException('PayPal webhook order is not available yet');
    if (String(order.provider) !== 'paypal' ||
      (providerOrderId && order.provider_order_id && String(providerOrderId) !== String(order.provider_order_id))) {
      throw new BadRequestException('PayPal event does not match the order');
    }

    if (String(payload.event_type) === 'PAYMENT.CAPTURE.COMPLETED') {
      const capturedMinorUnits = Math.round(Number(resource?.amount?.value) * 100);
      if (String(resource?.status).toUpperCase() !== 'COMPLETED' ||
          !Number.isFinite(capturedMinorUnits) || capturedMinorUnits !== Number(order.gateway_amount) ||
          String(resource?.amount?.currency_code).toUpperCase() !== String(order.gateway_currency).toUpperCase()) {
        throw new BadRequestException('PayPal capture amount or currency does not match the order');
      }
      await this.markOrderPaid(order, {
        provider: 'paypal',
        providerPaymentId: resource?.id,
        providerOrderId: providerOrderId || undefined,
        gatewayAmount: capturedMinorUnits,
        gatewayCurrency: String(resource?.amount?.currency_code).toUpperCase(),
        eventId,
      });
    } else if (['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED'].includes(String(payload.event_type))) {
      await this.recordFailedPayment(order, { paymentId: resource?.id, code: 'CAPTURE_DENIED', eventId });
    } else if (String(payload.event_type) === 'PAYMENT.CAPTURE.REFUNDED') {
      const captureLink = (resource?.links as Record<string, any>[] | undefined)?.find((link) => link.rel === 'up')?.href;
      const captureId = resource?.supplementary_data?.related_ids?.capture_id || captureLink?.split('/').pop();
      await this.recordRefund(order, {
        refundId: resource?.id,
        providerPaymentId: captureId,
        amountMinor: resource?.amount?.value != null ? Math.round(Number(resource.amount.value) * 100) : undefined,
        currency: resource?.amount?.currency_code || order.gateway_currency,
        status: this.normalizeRefundStatus(resource?.status),
        eventId,
      });
    }
    return { received: true, provider: 'paypal' };
  }

  // --- Helpers ----------------------------------------------------------------

  private async findOrderByProviderPayment(provider: PaymentProvider, paymentId: string) {
    const payments = (await this.data.list('payments', { provider_payment_id: paymentId })) as Record<string, any>[];
    const payment = payments.find((item) => String(item.provider).toLowerCase() === provider);
    if (!payment) return undefined;
    const orders = (await this.data.list('orders', { id: payment.order_id })) as Record<string, any>[];
    return orders[0];
  }

  private header(headers: Record<string, any>, name: string): string {
    const value = headers?.[name] ?? headers?.[name.toLowerCase()];
    if (Array.isArray(value)) return String(value[0] ?? '');
    return value == null ? '' : String(value);
  }

  // Verifies a Stripe webhook signature header (t=…,v1=…) against the raw body. (#23)
  private verifyStripeSignature(rawBody: Buffer, secret: string, header: string) {
    if (!header) throw new UnauthorizedException('Missing Stripe signature');
    const parts = header.split(',').reduce<Record<string, string>>((acc, kv) => {
      const [k, v] = kv.split('=');
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    }, {});
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) throw new UnauthorizedException('Malformed Stripe signature');
    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
    if (!this.safeCompare(expected, signature)) throw new UnauthorizedException('Invalid Stripe webhook signature');
    // Reject signatures older than 5 minutes to blunt replay attempts.
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) throw new UnauthorizedException('Stripe signature timestamp is out of tolerance');
  }

  // Constant-time comparison so signature checks don't leak via timing. (#11)
  private safeCompare(a: string, b: string): boolean {
    const bufferA = Buffer.from(String(a));
    const bufferB = Buffer.from(String(b));
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : 'Unknown error';
  }

  // Preserve the real error server-side, but never leak gateway internals to the client. (#24)
  private sanitize(error: unknown, fallbackMessage: string) {
    if (error instanceof HttpException) {
      if (error.getStatus() >= 500) return error;
      return new BadGatewayException(fallbackMessage);
    }
    this.logger.error(this.errorMessage(error));
    return new BadGatewayException(fallbackMessage);
  }
}

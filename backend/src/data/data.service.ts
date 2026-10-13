import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../database/prisma.service';
import { EmailService, isEmailAddress, type AdminNotificationDetails } from '../email/email.service';
import { CloudinaryService } from '../storage/cloudinary.service';

type Sort = { column: string; ascending?: boolean };

type TableConfig = {
  columns: string[];
  writable: string[];
  defaultOrder?: Sort[];
};

type EmailNotificationType =
  | 'ABSTRACT_SUBMISSION'
  | 'BROCHURE_REQUEST'
  | 'CONTACT_ACKNOWLEDGEMENT'
  | 'REGISTRATION_RECEIVED'
  | 'PAYMENT_CONFIRMED'
  | 'ABSTRACT_DECISION'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'
  | 'REFUND_CONFIRMED';

type EmailNotification = {
  type: EmailNotificationType;
  dedupeKey: string;
  recipient: string;
  payload: Record<string, unknown>;
  recipientRole?: 'USER' | 'ADMIN';
  adminPayload?: Record<string, unknown>;
};

type RawExecutor = {
  $executeRawUnsafe: (...args: any[]) => Promise<any>;
  $queryRawUnsafe: (...args: any[]) => Promise<any>;
};

const TABLES: Record<string, TableConfig> = {
  site_data: {
    columns: ['id', 'data_key', 'label', 'value', 'value_type', 'group_name', 'is_public', 'created_at', 'updated_at'],
    writable: ['data_key', 'label', 'value', 'value_type', 'group_name', 'is_public'],
    defaultOrder: [{ column: 'group_name' }, { column: 'label' }],
  },
  website_content: {
    columns: ['id', 'section_key', 'title', 'content', 'metadata', 'updated_at', 'updated_by'],
    writable: ['section_key', 'title', 'content', 'metadata', 'updated_by'],
    defaultOrder: [{ column: 'section_key' }],
  },
  speakers: {
    columns: ['id', 'name', 'title', 'organization', 'topic', 'bio', 'image_url', 'website_url', 'linkedin_url', 'twitter_url', 'session_type', 'display_order', 'is_visible', 'created_at', 'updated_at'],
    writable: ['name', 'title', 'organization', 'topic', 'bio', 'image_url', 'website_url', 'linkedin_url', 'twitter_url', 'session_type', 'display_order', 'is_visible'],
    defaultOrder: [{ column: 'display_order' }, { column: 'created_at' }],
  },
  accommodation_options: {
    columns: ['id', 'name', 'description', 'price_per_night', 'currency', 'available_from', 'available_until', 'minimum_nights', 'maximum_nights', 'capacity', 'allow_outside_conference_dates', 'is_active', 'created_at', 'updated_at'],
    writable: ['name', 'description', 'price_per_night', 'currency', 'available_from', 'available_until', 'minimum_nights', 'maximum_nights', 'capacity', 'allow_outside_conference_dates', 'is_active'],
    defaultOrder: [{ column: 'name' }],
  },
  media_partners: {
    columns: ['id', 'name', 'description', 'logo_url', 'website_url', 'tier', 'display_order', 'is_visible', 'created_at', 'updated_at'],
    writable: ['name', 'description', 'logo_url', 'website_url', 'tier', 'display_order', 'is_visible'],
    defaultOrder: [{ column: 'display_order' }, { column: 'created_at' }],
  },
  information_blocks: {
    columns: ['id', 'title', 'subtitle', 'content', 'category', 'cta_label', 'cta_url', 'display_order', 'is_visible', 'created_at', 'updated_at'],
    writable: ['title', 'subtitle', 'content', 'category', 'cta_label', 'cta_url', 'display_order', 'is_visible'],
    defaultOrder: [{ column: 'display_order' }, { column: 'created_at' }],
  },
  contact_messages: {
    columns: ['id', 'name', 'email', 'subject', 'message', 'status', 'created_at'],
    writable: ['name', 'email', 'subject', 'message', 'status'],
    defaultOrder: [{ column: 'created_at', ascending: false }],
  },
  abstract_submissions: {
    columns: ['id', 'full_name', 'email', 'phone', 'affiliation', 'country', 'session', 'abstract_title', 'abstract_text', 'presentation_type', 'keywords', 'supporting_text', 'drive_url', 'website_url', 'file_paths', 'voice_file_name', 'voice_file_path', 'status', 'created_at'],
    writable: ['full_name', 'email', 'phone', 'affiliation', 'country', 'session', 'abstract_title', 'abstract_text', 'presentation_type', 'keywords', 'supporting_text', 'drive_url', 'website_url', 'file_paths', 'voice_file_name', 'voice_file_path', 'status'],
    defaultOrder: [{ column: 'created_at', ascending: false }],
  },
  registration_intents: {
    columns: ['id', 'full_name', 'email', 'phone', 'country', 'affiliation', 'designation', 'plan_key', 'plan_name', 'quantity', 'amount_usd', 'currency', 'payment_provider', 'payment_status', 'payment_reference', 'payment_session_id', 'payment_order_id', 'gateway_response', 'status', 'notes', 'redirect_url', 'redirected_at', 'completed_at', 'cancelled_at', 'created_at', 'updated_at', 'coupon_code', 'accommodation_option_id', 'accommodation_check_in', 'accommodation_check_out'],
    writable: ['full_name', 'email', 'phone', 'country', 'affiliation', 'designation', 'plan_key', 'plan_name', 'quantity', 'amount_usd', 'currency', 'payment_provider', 'payment_status', 'payment_reference', 'payment_session_id', 'payment_order_id', 'gateway_response', 'status', 'notes', 'redirect_url', 'redirected_at', 'completed_at', 'cancelled_at', 'coupon_code', 'accommodation_option_id', 'accommodation_check_in', 'accommodation_check_out'],
    defaultOrder: [{ column: 'created_at', ascending: false }],
  },
  coupon_codes: {
    columns: ['id', 'code', 'description', 'discount_percent', 'discount_amount', 'max_uses', 'current_uses', 'is_active', 'valid_from', 'valid_until', 'created_at'],
    writable: ['code', 'description', 'discount_percent', 'discount_amount', 'max_uses', 'current_uses', 'is_active', 'valid_from', 'valid_until'],
    defaultOrder: [{ column: 'created_at', ascending: false }],
  },
  orders: {
    columns: ['id', 'order_number', 'registration_id', 'access_token', 'provider', 'quantity', 'base_amount', 'discount_amount', 'tax_amount', 'final_amount', 'currency', 'gateway_amount', 'gateway_currency', 'coupon_code', 'accommodation_option_id', 'accommodation_name', 'accommodation_check_in', 'accommodation_check_out', 'accommodation_nights', 'accommodation_price_per_night', 'accommodation_total', 'status', 'provider_order_id', 'created_at', 'updated_at'],
    writable: ['order_number', 'registration_id', 'access_token', 'provider', 'quantity', 'base_amount', 'discount_amount', 'tax_amount', 'final_amount', 'currency', 'gateway_amount', 'gateway_currency', 'coupon_code', 'accommodation_option_id', 'accommodation_name', 'accommodation_check_in', 'accommodation_check_out', 'accommodation_nights', 'accommodation_price_per_night', 'accommodation_total', 'status', 'provider_order_id'],
    defaultOrder: [{ column: 'created_at', ascending: false }],
  },
  payments: {
    columns: ['id', 'order_id', 'provider', 'provider_payment_id', 'provider_order_id', 'provider_signature', 'amount', 'currency', 'gateway_amount', 'gateway_currency', 'status', 'method', 'error_code', 'error_description', 'event_id', 'created_at', 'updated_at'],
    writable: ['order_id', 'provider', 'provider_payment_id', 'provider_order_id', 'provider_signature', 'amount', 'currency', 'gateway_amount', 'gateway_currency', 'status', 'method', 'error_code', 'error_description', 'event_id'],
    defaultOrder: [{ column: 'created_at', ascending: false }],
  },
  refunds: {
    columns: ['id', 'order_id', 'provider', 'provider_refund_id', 'provider_payment_id', 'amount_minor', 'currency', 'status', 'event_id', 'created_at', 'updated_at'],
    writable: ['order_id', 'provider', 'provider_refund_id', 'provider_payment_id', 'amount_minor', 'currency', 'status', 'event_id'],
    defaultOrder: [{ column: 'created_at', ascending: false }],
  },
};

const CONFERENCE_TIME_KEYS = new Set([
  'conference_start_datetime_utc',
  'conference_end_datetime_utc',
]);

// Registration adds a fixed service charge on top of the plan/discounted price.
export const SERVICE_CHARGE_RATE = 0.05;
const ACCOMMODATION_HOLD_MINUTES = Number(process.env.ORDER_STALE_MINUTES || 30);

const DEFAULT_PRICES: Record<string, Record<string, number>> = {
  speaker: { pre: 109, early: 149, mid: 179, onspot: 199 },
  poster: { pre: 69, early: 99, mid: 129, onspot: 149 },
  student: { pre: 49, early: 59, mid: 79, onspot: 99 },
  delegate: { pre: 39, early: 49, mid: 69, onspot: 89 },
};

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async list(table: string, filters: Record<string, unknown> = {}, order: Sort[] = []) {
    const config = this.getTable(table);
    const where = this.buildWhere(config, filters);
    const sorts = order.length ? order : config.defaultOrder ?? [];
    const sql = [
      `SELECT ${config.columns.map((column) => `\`${column}\``).join(', ')} FROM \`${table}\``,
      where.sql,
      this.buildOrder(config, sorts),
    ].filter(Boolean).join(' ');

    return this.jsonSafe(await (this.prisma as any).$queryRawUnsafe(sql, ...where.values));
  }

  async getPublicSpeakerProfile(id: string) {
    const speakerConfig = this.getTable('speakers');
    const speakers = await (this.prisma as any).$queryRawUnsafe(
      `SELECT ${speakerConfig.columns.map((column) => `\`${column}\``).join(', ')} FROM \`speakers\` WHERE \`id\` = ? AND \`is_visible\` = TRUE LIMIT 1`,
      id,
    );
    const speaker = this.jsonSafe(speakers)[0];
    if (!speaker) throw new NotFoundException('Speaker not found');

    const sessions = await (this.prisma as any).$queryRawUnsafe(
      'SELECT s.`id`, s.`title`, s.`description`, s.`startTime`, s.`endTime`, s.`room` FROM `_SessionToSpeaker` AS link INNER JOIN `sessions` AS s ON s.`id` = link.`A` WHERE link.`B` = ? ORDER BY s.`startTime` ASC',
      id,
    );

    return { speaker, sessions: this.jsonSafe(sessions) };
  }

  private async validateConferenceTimes(changes: Array<{ data_key?: unknown; value?: unknown }>) {
    const persistedRows = await Promise.all(
      [...CONFERENCE_TIME_KEYS].map(async (dataKey) => {
        const [row] = await this.list('site_data', { data_key: dataKey }) as Array<{ data_key: string; value: string | null }>;
        return row;
      }),
    );
    const values = new Map<string, string | null>(
      persistedRows.filter(Boolean).map((row) => [row.data_key, row.value]),
    );

    for (const change of changes) {
      const key = String(change.data_key ?? '');
      if (CONFERENCE_TIME_KEYS.has(key)) {
        values.set(key, change.value == null || change.value === '' ? null : String(change.value));
      }
    }

    for (const key of CONFERENCE_TIME_KEYS) {
      const value = values.get(key);
      if (value == null || value === '') continue;
      const parsed = new Date(value);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
          Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
        throw new BadRequestException(`${key} must be a valid UTC ISO datetime`);
      }
    }

    const start = values.get('conference_start_datetime_utc');
    const end = values.get('conference_end_datetime_utc');
    if (start && end && Date.parse(end) < Date.parse(start)) {
      throw new BadRequestException('Conference end datetime must not precede its start datetime');
    }
  }

  // The mariadb adapter returns BIGINT columns (e.g. orders.gateway_amount, the
  // Razorpay charge in paise) as native BigInt, and DECIMAL columns (amounts
  // like final_amount / amount_usd) as Decimal.js instances. JSON.stringify
  // turns a Decimal into `{s,e,d}` and throws on a BigInt, so an unconverted row
  // either 500s the response or hands the client an unusable amount. Deep-
  // convert both to plain numbers (integer minor-unit amounts stay well within
  // MAX_SAFE_INTEGER) so query results are always JSON-safe and numeric. Date
  // columns are passed through untouched — Date.toJSON already yields an ISO
  // string, and rebuilding one field-by-field like a plain object would flatten
  // it to `{}`.
  private jsonSafe<T>(value: T): T {
    if (typeof value === 'bigint') return Number(value) as unknown as T;
    if (Array.isArray(value)) return value.map((item) => this.jsonSafe(item)) as unknown as T;
    if (value instanceof Date) return value as unknown as T;
    if (value && typeof value === 'object') {
      const decimalLike = value as { s?: unknown; e?: unknown; d?: unknown; toString?: () => string };
      if (typeof decimalLike.s === 'number' && typeof decimalLike.e === 'number' && Array.isArray(decimalLike.d)) {
        return Number(decimalLike.toString?.() ?? value) as unknown as T;
      }
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        result[key] = this.jsonSafe(item);
      }
      return result as unknown as T;
    }
    return value;
  }

  async insert(table: string, payload: Record<string, unknown> | Record<string, unknown>[]) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const preparedRows = rows.map((row) => this.pickWritable(table, row, true));
    if (table === 'site_data') {
      await this.validateConferenceTimes(preparedRows);
    }
    const created = [];

    for (const data of preparedRows) {
      if (!data.id) data.id = randomUUID();
      const columns = Object.keys(data);
      if (!columns.length) throw new BadRequestException('No writable fields provided');

      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders})`;
      await (this.prisma as any).$executeRawUnsafe(
        sql,
        ...columns.map((column) => this.normalizeValue(data[column], table === 'site_data' && column === 'value')),
      );
      const [inserted] = await this.list(table, { id: data.id }) as any[];
      created.push(inserted);
    }

    return Array.isArray(payload) ? created : created[0];
  }

  async quoteAccommodation(optionId: string, checkIn: unknown, checkOut: unknown) {
    const options = await this.list('accommodation_options', { id: optionId, is_active: true }) as Record<string, any>[];
    const option = options[0];
    if (!option) throw new BadRequestException('The selected accommodation is unavailable');
    return this.buildAccommodationQuote(option, checkIn, checkOut, {
      $queryRawUnsafe: (...args: any[]) => (this.prisma as any).$queryRawUnsafe(...args),
    });
  }

  async createOrderWithAccommodation(
    order: Record<string, unknown>,
    selection: { optionId: string; checkIn: unknown; checkOut: unknown; expectedPricePerNight: number },
  ) {
    const config = this.getTable('orders');
    return (this.prisma as any).$transaction(async (transaction: any) => {
      const optionColumns = this.getTable('accommodation_options').columns;
      const optionRows = await transaction.$queryRawUnsafe(
        `SELECT ${optionColumns.map((column) => `\`${column}\``).join(', ')} FROM \`accommodation_options\` WHERE \`id\` = ? FOR UPDATE`,
        selection.optionId,
      );
      const option = this.jsonSafe(optionRows)[0] as Record<string, any> | undefined;
      if (!option || !this.isTruthy(option.is_active)) {
        throw new BadRequestException('The selected accommodation is no longer available');
      }
      const quote = await this.buildAccommodationQuote(option, selection.checkIn, selection.checkOut, transaction);
      if (quote.pricePerNight !== selection.expectedPricePerNight) {
        throw new ConflictException('Accommodation pricing changed. Please review your updated registration total.');
      }

      if (option.capacity != null) {
        const rows = await transaction.$queryRawUnsafe(
          `SELECT COUNT(*) AS booked FROM \`orders\`
           WHERE \`accommodation_option_id\` = ?
             AND \`accommodation_check_in\` < ?
             AND \`accommodation_check_out\` > ?
             AND (
               \`status\` = 'PAID'
               OR (\`status\` IN ('CREATED', 'PENDING') AND \`updated_at\` >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE))
             )`,
          selection.optionId,
          quote.checkOut,
          quote.checkIn,
          ACCOMMODATION_HOLD_MINUTES,
        );
        const booked = Number(rows[0]?.booked ?? 0);
        if (booked >= Number(option.capacity)) {
          throw new ConflictException('No rooms remain for the selected accommodation dates. Choose different dates or another option.');
        }
      }

      const data = this.pickWritable('orders', {
        ...order,
        accommodation_option_id: option.id,
        accommodation_name: option.name,
        accommodation_check_in: quote.checkIn,
        accommodation_check_out: quote.checkOut,
        accommodation_nights: quote.nights,
        accommodation_price_per_night: quote.pricePerNight,
        accommodation_total: quote.total,
      }, true);
      if (!data.id) data.id = randomUUID();
      const columns = Object.keys(data);
      const sql = `INSERT INTO \`orders\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
      await transaction.$executeRawUnsafe(
        sql,
        ...columns.map((column) => this.normalizeValue(data[column])),
      );
      const [saved] = await transaction.$queryRawUnsafe(
        `SELECT ${config.columns.map((column) => `\`${column}\``).join(', ')} FROM \`orders\` WHERE \`id\` = ?`,
        data.id,
      );
      return this.jsonSafe(saved);
    });
  }

  private async buildAccommodationQuote(
    option: Record<string, any>,
    checkInValue: unknown,
    checkOutValue: unknown,
    queryable: { $queryRawUnsafe: (...args: any[]) => Promise<any> },
  ) {
    const checkIn = this.parseDateOnly(checkInValue, 'Check-in');
    const checkOut = this.parseDateOnly(checkOutValue, 'Check-out');
    const start = Date.parse(`${checkIn}T00:00:00.000Z`);
    const end = Date.parse(`${checkOut}T00:00:00.000Z`);
    const nights = (end - start) / 86_400_000;
    if (!Number.isInteger(nights) || nights < 1) throw new BadRequestException('Check-out must be after check-in');

    const minimum = Number(option.minimum_nights ?? 1);
    const maximum = option.maximum_nights == null ? null : Number(option.maximum_nights);
    if (!Number.isInteger(minimum) || minimum < 1 || (maximum != null && (!Number.isInteger(maximum) || maximum < minimum))) {
      throw new ServiceUnavailableException('Accommodation stay limits are invalid');
    }
    if (nights < minimum || (maximum != null && nights > maximum)) {
      throw new BadRequestException(`Stay must be between ${minimum} and ${maximum ?? 'unlimited'} nights`);
    }

    const availableFrom = option.available_from == null ? null : this.parseDateOnly(option.available_from, 'Accommodation availability start');
    const availableUntil = option.available_until == null ? null : this.parseDateOnly(option.available_until, 'Accommodation availability end');
    if (availableFrom && checkIn < availableFrom) throw new BadRequestException('Check-in is before accommodation availability');
    if (availableUntil && checkOut > availableUntil) throw new BadRequestException('Check-out is after accommodation availability');
    if (availableFrom && availableUntil && availableFrom >= availableUntil) {
      throw new ServiceUnavailableException('Accommodation availability dates are invalid');
    }

    if (!this.isTruthy(option.allow_outside_conference_dates)) {
      const settings = await queryable.$queryRawUnsafe(
        'SELECT `data_key`, `value` FROM `site_data` WHERE `data_key` IN (?, ?)',
        'conference_start_datetime_utc',
        'conference_end_datetime_utc',
      ) as Array<{ data_key: string; value: string | null }>;
      const byKey = new Map(settings.map((row) => [row.data_key, row.value]));
      const conferenceStart = byKey.get('conference_start_datetime_utc');
      const conferenceEnd = byKey.get('conference_end_datetime_utc');
      if (!conferenceStart || !conferenceEnd) {
        throw new ServiceUnavailableException('Conference UTC dates must be configured before accommodation can be booked');
      }
      const startDate = new Date(conferenceStart);
      const endDate = new Date(conferenceEnd);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
        throw new ServiceUnavailableException('Configured conference dates are invalid');
      }
      const conferenceFirstNight = startDate.toISOString().slice(0, 10);
      const lastConferenceDate = endDate.toISOString().slice(0, 10);
      const checkoutLimit = new Date(`${lastConferenceDate}T00:00:00.000Z`);
      checkoutLimit.setUTCDate(checkoutLimit.getUTCDate() + 1);
      if (checkIn < conferenceFirstNight || checkOut > checkoutLimit.toISOString().slice(0, 10)) {
        throw new BadRequestException('Accommodation dates must fall within the configured conference period');
      }
    }

    const currency = String(option.currency || 'USD').toUpperCase();
    if (currency !== 'USD') throw new ServiceUnavailableException('Accommodation pricing must use USD to match conference registration');
    const pricePerNight = Number(option.price_per_night);
    if (!Number.isFinite(pricePerNight) || pricePerNight <= 0) {
      throw new ServiceUnavailableException('Accommodation pricing is invalid');
    }
    if (option.capacity != null && (!Number.isInteger(Number(option.capacity)) || Number(option.capacity) < 1)) {
      throw new ServiceUnavailableException('Accommodation capacity is invalid');
    }

    return {
      optionId: String(option.id),
      name: String(option.name),
      checkIn,
      checkOut,
      nights,
      pricePerNight: Math.round(pricePerNight * 100) / 100,
      total: Math.round(pricePerNight * nights * 100) / 100,
      currency,
    };
  }

  private parseDateOnly(value: unknown, label: string) {
    const date = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException(`${label} must be a valid calendar date`);
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new BadRequestException(`${label} must be a valid calendar date`);
    }
    return date;
  }

  private isTruthy(value: unknown) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  private async persistPublicRecordWithNotification(
    table: 'contact_messages' | 'abstract_submissions' | 'registration_intents',
    payload: Record<string, unknown>,
    createNotification: (record: Record<string, any>) => EmailNotification,
  ) {
    const config = this.getTable(table);
    const data = this.pickWritable(table, payload, true);
    if (!data.id) data.id = randomUUID();
    const columns = Object.keys(data);
    if (!columns.length) throw new BadRequestException('No writable fields provided');
    let notifications: EmailNotification[] = [];

    const record = await (this.prisma as any).$transaction(async (transaction: RawExecutor) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        ...columns.map((column) => this.normalizeValue(data[column])),
      );
      const rows = await transaction.$queryRawUnsafe(
        `SELECT ${config.columns.map((column) => `\`${column}\``).join(', ')} FROM \`${table}\` WHERE \`id\` = ?`,
        data.id,
      );
      const saved = this.jsonSafe(rows)[0] as Record<string, any> | undefined;
      if (!saved) throw new ServiceUnavailableException(`Saved ${table} record could not be loaded`);

      const notification = createNotification(saved);
      const adminDetails = notification.adminPayload;
      notifications = this.notificationPair(notification, adminDetails);
      for (const item of notifications) {
        if (isEmailAddress(item.recipient) || item.recipientRole === 'ADMIN') {
          await this.insertEmailNotification(item, transaction);
        } else {
          this.logger.warn(JSON.stringify({
            event: 'email.notification.skipped',
            type: item.type,
            recipientRole: item.recipientRole || 'USER',
            reason: 'invalid_or_missing_recipient',
          }));
        }
      }
      if (!isEmailAddress(notification.recipient) && notifications.length === 0) {
        this.logger.warn(JSON.stringify({
          event: 'email.notification.skipped',
          type: notification.type,
          reason: 'invalid_or_missing_recipient',
        }));
      }
      return saved;
    });

    for (const notification of notifications) {
      if (isEmailAddress(notification.recipient)) {
        await this.dispatchQueuedEmailBestEffort(notification.dedupeKey, notification.type);
      }
    }
    return record;
  }

  private notificationPair(userNotification: EmailNotification, adminPayload?: Record<string, unknown>) {
    const notifications = [userNotification];
    const adminRecipient = String(process.env.ADMIN_NOTIFICATION_EMAIL || '').trim();
    if (adminPayload && !isEmailAddress(adminRecipient)) {
      this.logger.error(JSON.stringify({
        event: 'email.admin_notification.unavailable',
        type: userNotification.type,
        reason: 'ADMIN_NOTIFICATION_EMAIL is missing or invalid',
      }));
    }
    if (adminPayload) {
      notifications.push({
        type: userNotification.type,
        dedupeKey: `${userNotification.dedupeKey}:ADMIN`,
        recipient: isEmailAddress(adminRecipient) ? adminRecipient : '',
        recipientRole: 'ADMIN',
        payload: adminPayload,
      });
    }
    return notifications;
  }

  private async insertEmailNotification(notification: EmailNotification, executor: RawExecutor = this.prisma as any) {
    const configuredAdmin = notification.recipientRole === 'ADMIN' && isEmailAddress(notification.recipient);
    const initialStatus = notification.recipientRole === 'ADMIN' && !configuredAdmin ? 'FAILED' : 'PENDING';
    const nextAttemptAt = initialStatus === 'FAILED'
      ? 'DATE_ADD(NOW(3), INTERVAL 5 MINUTE)'
      : 'NOW(3)';
    await executor.$executeRawUnsafe(
      `INSERT INTO \`email_notifications\` (\`id\`, \`dedupe_key\`, \`type\`, \`recipient\`, \`recipient_role\`, \`payload\`, \`status\`, \`attempts\`, \`last_error\`, \`next_attempt_at\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ${nextAttemptAt})
       ON DUPLICATE KEY UPDATE \`dedupe_key\` = VALUES(\`dedupe_key\`)`,
      randomUUID(),
      notification.dedupeKey,
      notification.type,
      notification.recipient,
      notification.recipientRole || 'USER',
      JSON.stringify(notification.payload),
      initialStatus,
      initialStatus === 'FAILED' ? 'ADMIN_NOTIFICATION_EMAIL_UNAVAILABLE' : null,
    );
  }

  private async dispatchQueuedEmailBestEffort(dedupeKey: string, type: EmailNotificationType) {
    try {
      await this.deliverEmailNotification(dedupeKey);
    } catch (error) {
      this.logger.error(JSON.stringify({
        event: 'email.notification.dispatch_error',
        type,
        errorCategory: this.emailErrorCategory(error),
      }));
    }
  }

  private emailErrorCategory(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String(error.code);
      return /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'SMTP_ERROR';
    }
    return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
  }

  private toAdminNotificationDetails(payload: Record<string, unknown>): AdminNotificationDetails {
    const fields = payload.fields;
    if (
      typeof payload.eventType !== 'string' ||
      typeof payload.submittedAt !== 'string' ||
      typeof payload.referenceId !== 'string' ||
      !fields ||
      typeof fields !== 'object' ||
      Array.isArray(fields)
    ) {
      throw new BadRequestException('Admin email notification data is invalid');
    }
    return {
      eventType: payload.eventType,
      submittedAt: payload.submittedAt,
      referenceId: payload.referenceId,
      fields: Object.fromEntries(
        Object.entries(fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ),
    };
  }

  async createPublicRegistration(payload: Record<string, unknown>) {
    const fullName = String(payload.full_name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const affiliation = String(payload.affiliation || '').trim();
    const country = String(payload.country || '').trim();
    const requestedPhone = String(payload.phone || '').trim();
    const phone = requestedPhone === 'Not provided' ? '' : requestedPhone;
    const whatsapp = String(payload.whatsapp || '').trim();
    const planKey = String(payload.plan_key || '').trim().toLowerCase();
    const provider = String(payload.payment_provider || 'stripe').toLowerCase();
    const quantity = Number(payload.quantity ?? 1);
    const accommodationOptionId = String(payload.accommodation_option_id ?? '').trim();
    const accommodationCheckIn = payload.accommodation_check_in ?? null;
    const accommodationCheckOut = payload.accommodation_check_out ?? null;
    if (!fullName || fullName.length > 200 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new BadRequestException('A valid name and email are required');
    }
    if (!affiliation || affiliation.length > 200 || !country || country.length > 100) {
      throw new BadRequestException('Organization and country are required');
    }
    if ((phone && !/^\d{10}$/.test(phone)) || (whatsapp && !/^\d{10}$/.test(whatsapp))) {
      throw new BadRequestException('Phone and WhatsApp numbers must contain exactly 10 digits');
    }
    if (!['stripe', 'paypal', 'razorpay'].includes(provider)) throw new BadRequestException('Unsupported payment provider');

    const pricing = await this.computeRegistrationAmount(planKey, String(payload.coupon_code || '').trim(), quantity);
    if (accommodationOptionId) {
      await this.quoteAccommodation(accommodationOptionId, accommodationCheckIn, accommodationCheckOut);
    } else if (accommodationCheckIn || accommodationCheckOut) {
      throw new BadRequestException('Select an accommodation option before providing stay dates');
    }
    return this.persistPublicRecordWithNotification('registration_intents', {
      full_name: fullName,
      email,
      phone: phone || whatsapp || 'Not provided',
      affiliation,
      country,
      designation: String(payload.designation || pricing.planLabel).trim(),
      plan_key: planKey,
      plan_name: pricing.planLabel,
      quantity,
      amount_usd: pricing.finalAmount,
      currency: 'USD',
      coupon_code: pricing.couponCode,
      accommodation_option_id: accommodationOptionId || null,
      accommodation_check_in: accommodationOptionId ? this.parseDateOnly(accommodationCheckIn, 'Check-in') : null,
      accommodation_check_out: accommodationOptionId ? this.parseDateOnly(accommodationCheckOut, 'Check-out') : null,
      payment_provider: provider,
      payment_status: 'pending',
      status: 'initiated',
      notes: String(payload.notes || '').slice(0, 4000),
    }, (record) => ({
      type: 'REGISTRATION_RECEIVED',
      dedupeKey: `REGISTRATION_RECEIVED:${String(record.id)}`,
      recipient: String(record.email || ''),
      payload: {
        firstName: String(record.full_name || '').split(/\s+/)[0],
        registrationId: String(record.id),
        planName: String(record.plan_name || record.plan_key || ''),
      },
      adminPayload: {
        eventType: 'REGISTRATION_RECEIVED',
        submittedAt: String(record.created_at || new Date().toISOString()),
        referenceId: String(record.id),
        fields: {
          Name: String(record.full_name || ''),
          Email: String(record.email || ''),
          Phone: String(record.phone || ''),
          Organization: String(record.affiliation || ''),
          Country: String(record.country || ''),
          Designation: String(record.designation || ''),
          Registration: String(record.plan_name || record.plan_key || ''),
          Quantity: String(record.quantity || ''),
          'Calculated amount': `${String(record.currency || 'USD')} ${Number(record.amount_usd || 0).toFixed(2)}`,
          'Accommodation option': String(record.accommodation_option_id || ''),
          'Check-in': String(record.accommodation_check_in || ''),
          'Check-out': String(record.accommodation_check_out || ''),
        },
      },
    }));
  }

  async createPublicContactMessage(payload: Record<string, unknown>) {
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const phone = String(payload.phone || '').trim();
    const message = String(payload.message || '').trim();
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !message) throw new BadRequestException('Name, email, and message are required');
    if (phone && !/^\d{10}$/.test(phone)) throw new BadRequestException('A valid 10-digit phone number is required');
    const subject = String(payload.subject || '').trim().slice(0, 255);
    const isBrochureRequest = subject.toLowerCase() === 'brochure download request';
    const frontendUrl = String(process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
    return this.persistPublicRecordWithNotification('contact_messages', {
      name,
      email,
      subject,
      message: message.slice(0, 10000),
      status: 'new',
    }, (record) => ({
      type: isBrochureRequest ? 'BROCHURE_REQUEST' : 'CONTACT_ACKNOWLEDGEMENT',
      dedupeKey: `${isBrochureRequest ? 'BROCHURE_REQUEST' : 'CONTACT_ACKNOWLEDGEMENT'}:${String(record.id)}`,
      recipient: String(record.email || ''),
      payload: isBrochureRequest
        ? { firstName: String(record.name || '').split(/\s+/)[0], brochureUrl: `${frontendUrl}/brochure-2027.pdf` }
        : { name: String(record.name || ''), subject: String(record.subject || '') },
      adminPayload: {
        eventType: isBrochureRequest ? 'BROCHURE_REQUEST' : 'CONTACT_ACKNOWLEDGEMENT',
        submittedAt: String(record.created_at || new Date().toISOString()),
        referenceId: String(record.id),
        fields: {
          Name: String(record.name || ''),
          Email: String(record.email || ''),
          Subject: String(record.subject || ''),
          Message: String(record.message || ''),
        },
      },
    }));
  }

  async createPublicAbstractSubmission(payload: Record<string, unknown>) {
    const fullName = String(payload.full_name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const phone = String(payload.phone || '').trim();
    const title = String(payload.abstract_title || '').trim();
    if (!fullName || !/^\S+@\S+\.\S+$/.test(email) || !title) throw new BadRequestException('Name, email, and abstract title are required');
    if (!/^\d{10}$/.test(phone)) throw new BadRequestException('A valid 10-digit phone number is required');
    const allowed = TABLES.abstract_submissions.writable;
    const cleaned = Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.includes(key)));
    return this.persistPublicRecordWithNotification('abstract_submissions', {
      ...cleaned,
      full_name: fullName,
      email,
      abstract_title: title,
      status: 'pending',
    }, (record) => ({
      type: 'ABSTRACT_SUBMISSION',
      dedupeKey: `ABSTRACT_SUBMISSION:${String(record.id)}`,
      recipient: String(record.email || ''),
      payload: {
        firstName: String(record.full_name || '').split(/\s+/)[0],
        abstractTitle: String(record.abstract_title || ''),
        submissionId: String(record.id),
      },
      adminPayload: {
        eventType: 'ABSTRACT_SUBMISSION',
        submittedAt: String(record.created_at || new Date().toISOString()),
        referenceId: String(record.id),
        fields: {
          Name: String(record.full_name || ''),
          Email: String(record.email || ''),
          Phone: String(record.phone || ''),
          Affiliation: String(record.affiliation || ''),
          Country: String(record.country || ''),
          Session: String(record.session || ''),
          'Abstract title': String(record.abstract_title || ''),
          'Abstract text': String(record.abstract_text || '').slice(0, 8000),
          'Presentation type': String(record.presentation_type || ''),
          Keywords: String(record.keywords || ''),
          'Supporting text': String(record.supporting_text || '').slice(0, 2000),
          'Drive URL': String(record.drive_url || ''),
          'Website URL': String(record.website_url || ''),
          Status: String(record.status || ''),
        },
      },
    }));
  }

  private async enqueueEmailNotification(
    notification: EmailNotification,
    adminDetails?: Record<string, unknown>,
  ) {
    if (!isEmailAddress(notification.recipient)) {
      this.logger.warn(JSON.stringify({
        event: 'email.notification.skipped',
        type: notification.type,
        recipientRole: 'USER',
        reason: 'invalid_or_missing_recipient',
      }));
    }
    const notifications = this.notificationPair(notification, adminDetails);
    for (const item of notifications) {
      if (isEmailAddress(item.recipient) || item.recipientRole === 'ADMIN') await this.insertEmailNotification(item);
    }
    const results = [];
    for (const item of notifications) {
      if (isEmailAddress(item.recipient)) results.push(await this.deliverEmailNotification(item.dedupeKey));
    }
    return results;
  }

  async transitionOrderWithEmailNotification(
    orderId: string,
    fromStatuses: string[],
    toStatus: 'FAILED' | 'CANCELLED',
    type: 'PAYMENT_FAILED' | 'PAYMENT_CANCELLED',
    eventId?: string,
  ) {
    const expected = [...new Set(fromStatuses.map((status) => status.toUpperCase()))];
    if (!expected.length) return false;
    const placeholders = expected.map(() => '?').join(', ');
    let notifications: EmailNotification[] = [];
    const transitioned = await (this.prisma as any).$transaction(async (transaction: RawExecutor) => {
      const affected = await transaction.$executeRawUnsafe(
        `UPDATE orders SET status = ? WHERE id = ? AND status IN (${placeholders})`,
        toStatus,
        orderId,
        ...expected,
      );
      if (Number(affected) !== 1) return false;

      const rows = await transaction.$queryRawUnsafe(
        `SELECT o.id, o.order_number, o.final_amount, o.currency, o.provider, r.full_name, r.email
         FROM orders o JOIN registration_intents r ON r.id = o.registration_id
         WHERE o.id = ? LIMIT 1`,
        orderId,
      ) as Array<Record<string, unknown>>;
      const order = rows[0];
      if (!order) {
        this.logger.warn(JSON.stringify({
          event: 'email.notification.skipped',
          type,
          reason: 'persisted_recipient_not_found',
        }));
        return true;
      }
      if (!isEmailAddress(String(order.email || ''))) {
        this.logger.warn(JSON.stringify({
          event: 'email.notification.skipped',
          type,
          recipientRole: 'USER',
          reason: 'invalid_or_missing_recipient',
        }));
      }

      const notification: EmailNotification = {
        type,
        dedupeKey: `${type}:${orderId}:${eventId || orderId}`,
        recipient: String(order.email),
        payload: {
          firstName: String(order.full_name || '').split(/\s+/)[0],
          orderNumber: String(order.order_number || order.id),
        },
      };
      notifications = this.notificationPair(notification, {
        eventType: type,
        submittedAt: new Date().toISOString(),
        referenceId: String(order.order_number || order.id),
        fields: {
          Name: String(order.full_name || ''),
          Email: String(order.email || ''),
          'Order number': String(order.order_number || order.id),
          Status: toStatus,
          Provider: String(order.provider || ''),
          Amount: `${String(order.currency || 'USD')} ${Number(order.final_amount || 0).toFixed(2)}`,
        },
      });
      for (const item of notifications) {
        if (isEmailAddress(item.recipient) || item.recipientRole === 'ADMIN') await this.insertEmailNotification(item, transaction);
      }
      return true;
    });

    if (transitioned) {
      for (const notification of notifications) {
        if (isEmailAddress(notification.recipient)) {
          await this.dispatchQueuedEmailBestEffort(notification.dedupeKey, notification.type);
        }
      }
    }
    return transitioned;
  }

  async queueRefundConfirmationNotification(orderId: string, refundId: string) {
    try {
      const order = (await this.list('orders', { id: orderId }) as Record<string, any>[])[0];
      if (!order) throw new NotFoundException('Notification order was not found');
      const registration = (await this.list('registration_intents', { id: order.registration_id }) as Record<string, any>[])[0];
      const recipient = String(registration?.email || '');
      if (!isEmailAddress(recipient)) {
        this.logger.warn(JSON.stringify({
          event: 'email.notification.skipped',
          type: 'REFUND_CONFIRMED',
          recipientRole: 'USER',
          reason: 'invalid_or_missing_recipient',
        }));
      }
      const refund = (await this.list('refunds', {
        order_id: orderId,
        provider_refund_id: refundId,
        status: 'SUCCEEDED',
      }) as Record<string, any>[])[0];
      if (!refund) throw new ConflictException('A successful persisted refund is required before notification');
      const successfulRefunds = (await this.list('refunds', {
        order_id: orderId,
        status: 'SUCCEEDED',
      }) as Record<string, any>[]);
      const totalRefunded = successfulRefunds.reduce((total, item) => total + Number(item.amount_minor || 0), 0);
      await this.enqueueEmailNotification({
        type: 'REFUND_CONFIRMED',
        dedupeKey: `REFUND_CONFIRMED:${order.provider}:${refundId}`,
        recipient,
        payload: {
          firstName: String(registration.full_name || '').split(/\s+/)[0],
          orderNumber: String(order.order_number || order.id),
          amount: (Number(refund.amount_minor) / 100).toFixed(2),
          currency: String(refund.currency || order.gateway_currency || 'USD'),
          partial: totalRefunded < Number(order.gateway_amount),
        },
      }, {
        eventType: 'REFUND_CONFIRMED',
        submittedAt: String(refund.updated_at || new Date().toISOString()),
        referenceId: String(refundId),
        fields: {
          Name: String(registration.full_name || ''),
          Email: recipient,
          'Order number': String(order.order_number || order.id),
          'Refund amount': `${String(refund.currency || order.gateway_currency || 'USD')} ${(Number(refund.amount_minor) / 100).toFixed(2)}`,
          Status: String(refund.status || ''),
          Provider: String(order.provider || ''),
        },
      });
    } catch (error) {
      this.logger.error(JSON.stringify({
        event: 'email.notification.queue_error',
        type: 'REFUND_CONFIRMED',
        errorCategory: this.emailErrorCategory(error),
      }));
    }
  }

  private async recoverSuccessfulRefundNotifications(limit: number) {
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT rf.provider, rf.provider_refund_id, rf.amount_minor, rf.currency, rf.updated_at,
              o.id AS order_id, o.order_number, o.gateway_amount,
              r.full_name, r.email,
              (SELECT SUM(successful.amount_minor) FROM refunds successful
               WHERE successful.order_id = o.id AND successful.status = 'SUCCEEDED') AS total_refunded_minor
       FROM refunds rf
       JOIN orders o ON o.id = rf.order_id
       JOIN registration_intents r ON r.id = o.registration_id
       LEFT JOIN email_notifications user_en
         ON user_en.dedupe_key = CONCAT('REFUND_CONFIRMED:', rf.provider, ':', rf.provider_refund_id)
       LEFT JOIN email_notifications admin_en
         ON admin_en.dedupe_key = CONCAT('REFUND_CONFIRMED:', rf.provider, ':', rf.provider_refund_id, ':ADMIN')
       WHERE rf.status = 'SUCCEEDED' AND (user_en.id IS NULL OR admin_en.id IS NULL)
       ORDER BY rf.updated_at ASC LIMIT ?`,
      limit,
    ) as Array<Record<string, any>>;

    for (const row of rows) {
      if (!isEmailAddress(String(row.email || ''))) {
        this.logger.warn(JSON.stringify({
          event: 'email.notification.skipped',
          type: 'REFUND_CONFIRMED',
          recipientRole: 'USER',
          reason: 'invalid_or_missing_recipient',
        }));
      }
      const userNotification: EmailNotification = {
        type: 'REFUND_CONFIRMED',
        dedupeKey: `REFUND_CONFIRMED:${row.provider}:${row.provider_refund_id}`,
        recipient: String(row.email),
        payload: {
          firstName: String(row.full_name || '').split(/\s+/)[0],
          orderNumber: String(row.order_number || row.order_id),
          amount: (Number(row.amount_minor) / 100).toFixed(2),
          currency: String(row.currency || 'USD'),
          partial: Number(row.total_refunded_minor) < Number(row.gateway_amount),
        },
      };
      const paired = this.notificationPair(userNotification, {
        eventType: 'REFUND_CONFIRMED',
        submittedAt: String(row.updated_at || new Date().toISOString()),
        referenceId: String(row.provider_refund_id),
        fields: {
          Name: String(row.full_name || ''),
          Email: String(row.email || ''),
          'Order number': String(row.order_number || row.order_id),
          'Refund amount': `${String(row.currency || 'USD')} ${(Number(row.amount_minor) / 100).toFixed(2)}`,
          Status: 'SUCCEEDED',
          Provider: String(row.provider || ''),
        },
      });
      for (const notification of paired) {
        if (isEmailAddress(notification.recipient) || notification.recipientRole === 'ADMIN') await this.insertEmailNotification(notification);
      }
    }
    return rows.length;
  }

  private async recoverMissingAbstractNotifications(limit: number) {
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT s.id, s.full_name, s.email, s.phone, s.affiliation, s.country, s.session,
              s.abstract_title, s.abstract_text, s.presentation_type, s.keywords,
              s.supporting_text, s.drive_url, s.website_url, s.status, s.created_at
       FROM abstract_submissions s
       LEFT JOIN email_notifications admin_en
         ON admin_en.dedupe_key = CONCAT('ABSTRACT_SUBMISSION:', s.id, ':ADMIN')
       WHERE admin_en.id IS NULL
       ORDER BY s.created_at ASC LIMIT ?`,
      limit,
    ) as Array<Record<string, any>>;

    for (const row of rows) {
      const notification: EmailNotification = {
        type: 'ABSTRACT_SUBMISSION',
        dedupeKey: `ABSTRACT_SUBMISSION:${String(row.id)}`,
        recipient: String(row.email || ''),
        payload: {
          firstName: String(row.full_name || '').split(/\s+/)[0],
          abstractTitle: String(row.abstract_title || ''),
          submissionId: String(row.id),
        },
      };
      const paired = this.notificationPair(notification, {
        eventType: 'ABSTRACT_SUBMISSION',
        submittedAt: String(row.created_at || new Date().toISOString()),
        referenceId: String(row.id),
        fields: {
          Name: String(row.full_name || ''),
          Email: String(row.email || ''),
          Phone: String(row.phone || ''),
          Affiliation: String(row.affiliation || ''),
          Country: String(row.country || ''),
          Session: String(row.session || ''),
          'Abstract title': String(row.abstract_title || ''),
          'Abstract text': String(row.abstract_text || '').slice(0, 8000),
          'Presentation type': String(row.presentation_type || ''),
          Keywords: String(row.keywords || ''),
          'Supporting text': String(row.supporting_text || '').slice(0, 2000),
          'Drive URL': String(row.drive_url || ''),
          'Website URL': String(row.website_url || ''),
          Status: String(row.status || ''),
        },
      });
      const adminNotification = paired.find((item) => item.recipientRole === 'ADMIN');
      if (adminNotification) {
        await this.insertEmailNotification(adminNotification);
      }
    }
    return rows.length;
  }

  private async deliverEmailNotification(dedupeKey: string) {
    const claimed = await (this.prisma as any).$executeRawUnsafe(
      `UPDATE \`email_notifications\` SET \`status\` = 'SENDING', \`attempts\` = \`attempts\` + 1, \`updated_at\` = NOW(3)
       WHERE \`dedupe_key\` = ? AND \`status\` IN ('PENDING', 'FAILED') AND \`next_attempt_at\` <= NOW(3)`,
      dedupeKey,
    );
    if (Number(claimed) !== 1) return { skipped: true };

    const rows = await (this.prisma as any).$queryRawUnsafe(
      'SELECT `id`, `type`, `recipient`, `recipient_role`, `payload`, `attempts` FROM `email_notifications` WHERE `dedupe_key` = ? AND `status` = ? LIMIT 1',
      dedupeKey,
      'SENDING',
    ) as Array<Record<string, unknown>>;
    const notification = rows[0];
    if (!notification) throw new ServiceUnavailableException('Claimed email notification could not be loaded');

    try {
      if (!isEmailAddress(String(notification.recipient || ''))) {
        await (this.prisma as any).$executeRawUnsafe(
          "UPDATE `email_notifications` SET `status` = 'PERMANENT_FAILURE', `last_error` = 'INVALID_RECIPIENT', `updated_at` = NOW(3) WHERE `id` = ? AND `status` = 'SENDING'",
          notification.id,
        );
        this.logger.error(JSON.stringify({
          event: 'email.notification.permanent_failure',
          type: String(notification.type),
          reason: 'invalid_or_missing_recipient',
        }));
        return { success: false, retryable: false };
      }
      const payload = typeof notification.payload === 'string'
        ? JSON.parse(notification.payload) as Record<string, unknown>
        : notification.payload as Record<string, unknown>;
      if (String(notification.recipient_role || 'USER') === 'ADMIN') {
        if (notification.type === 'PAYMENT_CONFIRMED') {
          await this.sendPaymentAdminNotification(
            String(payload.registrationId ?? ''),
            String(notification.recipient),
          );
        } else {
          await this.emailService.sendAdminEventNotification(
            String(notification.recipient),
            this.toAdminNotificationDetails(payload),
          );
        }
      } else if (notification.type === 'PAYMENT_CONFIRMED') {
        await this.sendPaymentSuccessNotification(String(payload.registrationId ?? ''), null);
      } else if (notification.type === 'ABSTRACT_SUBMISSION') {
        await this.emailService.sendAbstractSubmissionConfirmation(
          String(notification.recipient),
          String(payload.firstName ?? ''),
          String(payload.abstractTitle ?? ''),
          String(payload.submissionId ?? ''),
        );
      } else if (notification.type === 'BROCHURE_REQUEST') {
        await this.emailService.sendBrochureRequestConfirmation(
          String(notification.recipient),
          String(payload.firstName ?? ''),
          String(payload.brochureUrl ?? ''),
        );
      } else if (notification.type === 'CONTACT_ACKNOWLEDGEMENT') {
        await this.emailService.sendContactAcknowledgement(
          String(notification.recipient),
          String(payload.name ?? ''),
          String(payload.subject ?? ''),
        );
      } else if (notification.type === 'REGISTRATION_RECEIVED') {
        await this.emailService.sendRegistrationReceived(
          String(notification.recipient),
          String(payload.firstName ?? ''),
          String(payload.registrationId ?? ''),
          String(payload.planName ?? ''),
        );
      } else if (notification.type === 'ABSTRACT_DECISION') {
        const status = String(payload.status);
        if (status !== 'approved' && status !== 'rejected') {
          throw new BadRequestException('Unsupported abstract decision status');
        }
        await this.emailService.sendAbstractDecision(
          String(notification.recipient),
          String(payload.firstName ?? ''),
          String(payload.abstractTitle ?? ''),
          status,
        );
      } else if (notification.type === 'PAYMENT_FAILED') {
        await this.emailService.sendPaymentFailure(
          String(notification.recipient),
          String(payload.firstName ?? ''),
          String(payload.orderNumber ?? ''),
        );
      } else if (notification.type === 'PAYMENT_CANCELLED') {
        await this.emailService.sendPaymentCancelled(
          String(notification.recipient),
          String(payload.firstName ?? ''),
          String(payload.orderNumber ?? ''),
        );
      } else if (notification.type === 'REFUND_CONFIRMED') {
        await this.emailService.sendRefundConfirmation(
          String(notification.recipient),
          String(payload.firstName ?? ''),
          String(payload.orderNumber ?? ''),
          String(payload.amount ?? ''),
          String(payload.currency ?? ''),
          payload.partial === true,
        );
      } else {
        throw new BadRequestException(`Unsupported email notification type: ${String(notification.type)}`);
      }
      await (this.prisma as any).$executeRawUnsafe(
        "UPDATE `email_notifications` SET `status` = 'SENT', `sent_at` = NOW(3), `last_error` = NULL, `updated_at` = NOW(3) WHERE `id` = ? AND `status` = 'SENDING'",
        notification.id,
      );
      this.logger.log(JSON.stringify({
        event: 'email.notification.sent',
        type: String(notification.type),
        attempt: Number(notification.attempts),
      }));
      return { success: true, sent: true };
    } catch (error) {
      const errorCategory = this.emailErrorCategory(error);
      const retryable = Number(notification.attempts) < 12;
      await (this.prisma as any).$executeRawUnsafe(
        "UPDATE `email_notifications` SET `status` = CASE WHEN `attempts` >= 12 THEN 'PERMANENT_FAILURE' ELSE 'FAILED' END, `last_error` = ?, `next_attempt_at` = DATE_ADD(NOW(3), INTERVAL LEAST(POW(2, `attempts`) * (0.8 + RAND() * 0.4), 60) MINUTE), `updated_at` = NOW(3) WHERE `id` = ? AND `status` = 'SENDING'",
        errorCategory,
        notification.id,
      );
      this.logger.warn(JSON.stringify({
        event: retryable ? 'email.notification.retry_scheduled' : 'email.notification.permanent_failure',
        type: String(notification.type),
        attempt: Number(notification.attempts),
        errorCategory,
      }));
      return { success: false, retryable };
    }
  }

  async retryFailedEmailNotifications(limit = 50) {
    const batchSize = Math.min(Math.max(Math.floor(limit), 1), 100);
    const adminRecipient = String(process.env.ADMIN_NOTIFICATION_EMAIL || '').trim();
    if (isEmailAddress(adminRecipient)) {
      await (this.prisma as any).$executeRawUnsafe(
        "UPDATE `email_notifications` SET `recipient` = ?, `status` = 'PENDING', `last_error` = NULL, `next_attempt_at` = NOW(3), `updated_at` = NOW(3) WHERE `recipient_role` = 'ADMIN' AND `recipient` = '' AND `status` = 'FAILED' AND `last_error` = 'ADMIN_NOTIFICATION_EMAIL_UNAVAILABLE'",
        adminRecipient,
      );
    }
    await this.recoverMissingAbstractNotifications(batchSize);
    await this.recoverSuccessfulRefundNotifications(batchSize);
    await (this.prisma as any).$executeRawUnsafe(
      "UPDATE `email_notifications` SET `status` = 'FAILED' WHERE `status` = 'SENDING' AND `updated_at` < DATE_SUB(NOW(3), INTERVAL 10 MINUTE)",
    );
    const rows = await (this.prisma as any).$queryRawUnsafe(
      "SELECT `dedupe_key` FROM `email_notifications` WHERE `status` IN ('PENDING', 'FAILED') AND `next_attempt_at` <= NOW(3) AND (`recipient_role` <> 'ADMIN' OR `recipient` <> '') ORDER BY `next_attempt_at` ASC LIMIT ?",
      batchSize,
    ) as Array<{ dedupe_key: string }>;
    const results = [];
    for (const row of rows) results.push(await this.deliverEmailNotification(row.dedupe_key));
    return results;
  }

  async upsert(table: string, payload: Record<string, unknown> | Record<string, unknown>[], onConflict?: string) {
    const config = this.getTable(table);
    const conflictColumn = onConflict || 'id';
    if (!config.columns.includes(conflictColumn)) throw new BadRequestException(`Unknown conflict column: ${conflictColumn}`);

    const rows = Array.isArray(payload) ? payload : [payload];
    const preparedRows = rows.map((row) => this.pickWritable(table, row, true));
    if (table === 'site_data') {
      await this.validateConferenceTimes(preparedRows);
      return (this.prisma as any).$transaction(async (transaction: any) => {
        const savedRows = [];
        for (const data of preparedRows) {
          if (!data.id) data.id = randomUUID();
          const columns = Object.keys(data);
          if (!columns.length) throw new BadRequestException('No writable fields provided');
          if (data[conflictColumn] === undefined) throw new BadRequestException(`Conflict column is required: ${conflictColumn}`);

          const updateColumns = columns.filter((column) => column !== 'id' && column !== conflictColumn);
          const placeholders = columns.map(() => '?').join(', ');
          const updateClause = updateColumns.length
            ? updateColumns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ')
            : `\`${conflictColumn}\` = VALUES(\`${conflictColumn}\`)`;
          const sql = [
            `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders})`,
            `ON DUPLICATE KEY UPDATE ${updateClause}`,
          ].join(' ');

          await transaction.$executeRawUnsafe(
            sql,
            ...columns.map((column) => this.normalizeValue(data[column], column === 'value')),
          );
          const selected = await transaction.$queryRawUnsafe(
            `SELECT ${config.columns.map((column) => `\`${column}\``).join(', ')} FROM \`${table}\` WHERE \`${conflictColumn}\` = ?`,
            data[conflictColumn],
          );
          savedRows.push(this.jsonSafe(selected)[0] ?? null);
        }

        return Array.isArray(payload) ? savedRows : savedRows[0];
      });
    }
    const saved = [];

    for (const data of preparedRows) {
      if (!data.id) data.id = randomUUID();
      const columns = Object.keys(data);
      if (!columns.length) throw new BadRequestException('No writable fields provided');
      if (data[conflictColumn] === undefined) throw new BadRequestException(`Conflict column is required: ${conflictColumn}`);

      const updateColumns = columns.filter((column) => column !== 'id' && column !== conflictColumn);
      const placeholders = columns.map(() => '?').join(', ');
      const updateClause = updateColumns.length
        ? updateColumns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ')
        : `\`${conflictColumn}\` = VALUES(\`${conflictColumn}\`)`;
      const sql = [
        `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders})`,
        `ON DUPLICATE KEY UPDATE ${updateClause}`,
      ].join(' ');

      await (this.prisma as any).$executeRawUnsafe(
        sql,
        ...columns.map((column) => this.normalizeValue(data[column], table === 'site_data' && column === 'value')),
      );
      const [latest] = await this.list(table, { [conflictColumn]: data[conflictColumn] }) as any[];
      saved.push(latest);
    }

    return Array.isArray(payload) ? saved : saved[0];
  }

  async update(table: string, id: string, payload: Record<string, unknown>) {
    const data = this.pickWritable(table, payload);
    const columns = Object.keys(data);
    if (!columns.length) throw new BadRequestException('No writable fields provided');
    if (table === 'site_data') {
      const [existing] = await this.list('site_data', { id }) as Array<{ data_key: string; value: string | null }>;
      const key = String(data.data_key ?? existing?.data_key ?? '');
      if (CONFERENCE_TIME_KEYS.has(key)) {
        await this.validateConferenceTimes([{
          data_key: key,
          value: data.value === undefined ? existing?.value : data.value,
        }]);
      }
    }

    const setClause = columns.map((column) => `\`${column}\` = ?`).join(', ');
    await (this.prisma as any).$executeRawUnsafe(
      `UPDATE \`${table}\` SET ${setClause} WHERE \`id\` = ?`,
      ...columns.map((column) => this.normalizeValue(data[column], table === 'site_data' && column === 'value')),
      id,
    );
    const rows = await this.list(table, { id });
    return (rows as any[])[0] ?? null;
  }

  async updateAbstractSubmission(id: string, payload: Record<string, unknown>) {
    const data = this.pickWritable('abstract_submissions', payload);
    const columns = Object.keys(data);
    if (!columns.length) throw new BadRequestException('No writable fields provided');
    const newStatus = data.status === undefined ? undefined : String(data.status).toLowerCase();
    if (newStatus !== undefined && !['pending', 'approved', 'rejected', 'under_review'].includes(newStatus)) {
      throw new BadRequestException('Invalid abstract review status');
    }

    let notifications: EmailNotification[] = [];
    const updated = await (this.prisma as any).$transaction(async (transaction: RawExecutor) => {
      const existingRows = await transaction.$queryRawUnsafe(
        `SELECT ${TABLES.abstract_submissions.columns.map((column) => `\`${column}\``).join(', ')}
         FROM \`abstract_submissions\` WHERE \`id\` = ? LIMIT 1`,
        id,
      );
      const existing = this.jsonSafe(existingRows)[0] as Record<string, any> | undefined;
      if (!existing) return null;
      const oldStatus = String(existing.status || '').toLowerCase();
      const setClause = columns.map((column) => `\`${column}\` = ?`).join(', ');
      const affected = await transaction.$executeRawUnsafe(
        `UPDATE \`abstract_submissions\` SET ${setClause} WHERE \`id\` = ?${newStatus !== undefined ? ' AND LOWER(\`status\`) = ?' : ''}`,
        ...columns.map((column) => this.normalizeValue(data[column])),
        id,
        ...(newStatus !== undefined ? [oldStatus] : []),
      );
      if (Number(affected) !== 1 && newStatus !== oldStatus) {
        throw new ConflictException('Abstract submission changed while it was being updated');
      }
      const savedRows = await transaction.$queryRawUnsafe(
        `SELECT ${TABLES.abstract_submissions.columns.map((column) => `\`${column}\``).join(', ')}
         FROM \`abstract_submissions\` WHERE \`id\` = ? LIMIT 1`,
        id,
      );
      const saved = this.jsonSafe(savedRows)[0] as Record<string, any> | undefined;
      if (saved && newStatus && newStatus !== oldStatus && ['approved', 'rejected'].includes(newStatus)) {
        const recipient = String(saved.email || '');
        const notification: EmailNotification = {
          type: 'ABSTRACT_DECISION',
          dedupeKey: `ABSTRACT_DECISION:${id}:${randomUUID()}`,
          recipient,
          payload: {
            firstName: String(saved.full_name || '').split(/\s+/)[0],
            abstractTitle: String(saved.abstract_title || ''),
            status: newStatus,
          },
        };
        notifications = this.notificationPair(notification, {
          eventType: 'ABSTRACT_DECISION',
          submittedAt: String(saved.updated_at || new Date().toISOString()),
          referenceId: String(saved.id),
          fields: {
            Name: String(saved.full_name || ''),
            Email: recipient,
            'Abstract title': String(saved.abstract_title || ''),
            Decision: newStatus,
          },
        });
        for (const item of notifications) {
          if (isEmailAddress(item.recipient) || item.recipientRole === 'ADMIN') await this.insertEmailNotification(item, transaction);
        }
        if (!isEmailAddress(recipient)) {
          this.logger.warn(JSON.stringify({
            event: 'email.notification.skipped',
            type: 'ABSTRACT_DECISION',
            reason: 'invalid_or_missing_recipient',
          }));
        }
      }
      return saved;
    });
    for (const notification of notifications) {
      if (isEmailAddress(notification.recipient)) {
        await this.dispatchQueuedEmailBestEffort(notification.dedupeKey, notification.type);
      }
    }
    return updated;
  }

  async transitionOrderStatus(orderId: string, fromStatuses: string[], toStatus: string): Promise<boolean> {
    const expected = [...new Set(fromStatuses.map((status) => status.toUpperCase()))];
    if (!expected.length) return false;
    const placeholders = expected.map(() => '?').join(', ');
    const affected = await (this.prisma as any).$executeRawUnsafe(
      `UPDATE orders SET status = ? WHERE id = ? AND status IN (${placeholders})`,
      toStatus,
      orderId,
      ...expected,
    );
    return Number(affected) === 1;
  }

  async claimRegistrationCheckout(registrationId: string): Promise<boolean> {
    const affected = await (this.prisma as any).$executeRawUnsafe(
      "UPDATE registration_intents SET status = 'checkout_started' WHERE id = ? AND status = 'initiated' AND LOWER(payment_status) = 'pending'",
      registrationId,
    );
    return Number(affected) === 1;
  }

  async releaseRegistrationCheckoutClaim(registrationId: string) {
    await (this.prisma as any).$executeRawUnsafe(
      "UPDATE registration_intents SET status = 'initiated' WHERE id = ? AND status = 'checkout_started' AND LOWER(payment_status) = 'pending'",
      registrationId,
    );
  }

  async attachProviderOrder(orderId: string, providerOrderId: string) {
    await (this.prisma as any).$executeRawUnsafe(
      "UPDATE `orders` SET `provider_order_id` = ?, `status` = CASE WHEN `status` = 'CREATED' THEN 'PENDING' ELSE `status` END WHERE `id` = ?",
      providerOrderId,
      orderId,
    );
    const rows = (await this.list('orders', { id: orderId })) as Record<string, any>[];
    return rows[0] ?? null;
  }

  async claimOrderRefund(orderId: string): Promise<boolean> {
    const affected = await (this.prisma as any).$executeRawUnsafe(
      "UPDATE `orders` SET `status` = 'REFUND_PENDING' WHERE `id` = ? AND `status` = 'PAID'",
      orderId,
    );
    return Number(affected) === 1;
  }

  async releaseOrderRefundClaim(orderId: string) {
    await (this.prisma as any).$executeRawUnsafe(
      "UPDATE `orders` SET `status` = 'PAID' WHERE `id` = ? AND `status` = 'REFUND_PENDING'",
      orderId,
    );
  }

  async recordPaymentAudit(event: {
    orderId: string;
    actorUserId?: string | null;
    provider: string;
    action: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    amountMinor?: number | null;
    currency?: string | null;
    providerReference?: string | null;
  }) {
    await (this.prisma as any).$executeRawUnsafe(
      'INSERT INTO `payment_audit_logs` (`id`, `order_id`, `actor_user_id`, `provider`, `action`, `previous_status`, `new_status`, `amount_minor`, `currency`, `provider_reference`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      event.orderId,
      event.actorUserId || null,
      event.provider,
      event.action,
      event.previousStatus || null,
      event.newStatus || null,
      event.amountMinor ?? null,
      event.currency || null,
      event.providerReference || null,
    );
  }

  async listPaymentAudit(orderId: string) {
    const rows = await (this.prisma as any).$queryRawUnsafe(
      'SELECT `id`, `order_id`, `actor_user_id`, `provider`, `action`, `previous_status`, `new_status`, `amount_minor`, `currency`, `provider_reference`, `created_at` FROM `payment_audit_logs` WHERE `order_id` = ? ORDER BY `created_at` DESC',
      orderId,
    );
    return this.jsonSafe(rows);
  }

  async delete(table: string, id: string) {
    this.getTable(table);

    // Deleting a registration or an order must not leave orphaned child rows.
    // registration_intents -> orders -> payments is cleared bottom-up inside a
    // single transaction so a failure rolls the whole delete back. (#10)
    if (table === 'registration_intents') {
      await (this.prisma as any).$transaction(async (tx: any) => {
        const orderRows = (await tx.$queryRawUnsafe(
          'SELECT `id` FROM `orders` WHERE `registration_id` = ?',
          id,
        )) as Array<{ id: string }>;
        const orderIds = orderRows.map((row) => row.id);
        if (orderIds.length) {
          const placeholders = orderIds.map(() => '?').join(', ');
          await tx.$executeRawUnsafe(`DELETE FROM \`payments\` WHERE \`order_id\` IN (${placeholders})`, ...orderIds);
          await tx.$executeRawUnsafe(`DELETE FROM \`orders\` WHERE \`id\` IN (${placeholders})`, ...orderIds);
        }
        await tx.$executeRawUnsafe('DELETE FROM `registration_intents` WHERE `id` = ?', id);
      });
      return { id };
    }

    if (table === 'orders') {
      await (this.prisma as any).$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe('DELETE FROM `payments` WHERE `order_id` = ?', id);
        await tx.$executeRawUnsafe('DELETE FROM `orders` WHERE `id` = ?', id);
      });
      return { id };
    }

    if (table === 'abstract_submissions') {
      const rows = await this.list(table, { id }) as Array<Record<string, unknown>>;
      const submission = rows[0];
      if (submission) {
        let storedFiles: unknown = submission.file_paths;
        if (typeof storedFiles === 'string') {
          try { storedFiles = JSON.parse(storedFiles); } catch { storedFiles = []; }
        }
        const paths = [
          ...(Array.isArray(storedFiles) ? storedFiles.map((file: any) => typeof file === 'string' ? file : file?.path) : []),
          submission.voice_file_path,
        ].filter((path): path is string => typeof path === 'string' && path.length > 0);
        await Promise.all(paths.map((path) => this.cloudinaryService.deleteLocalFile(`abstract-assets/${path.replace(/^abstract-assets\//, '')}`)));
      }
    }
    await (this.prisma as any).$executeRawUnsafe(`DELETE FROM \`${table}\` WHERE \`id\` = ?`, id);
    return { id };
  }

  async createStripeCheckout(payload: Record<string, unknown>) {
    return this.createHostedCheckout('stripe', payload);
  }

  async createPayPalOrder(payload: Record<string, unknown>) {
    return this.createHostedCheckout('paypal', payload);
  }

  async capturePayPalOrder(payload: Record<string, unknown>) {
    const registrationId = String(payload.registrationId ?? payload.p_registration_id ?? payload.registration_id ?? '');
    const orderId = String(payload.orderId ?? payload.p_payment_order_id ?? payload.payment_order_id ?? '');

    if (!registrationId) throw new BadRequestException('Registration id is required');
    if (!orderId) throw new BadRequestException('PayPal order id is required');

    const order = await this.payPalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, 'POST', {});
    if (String(order.status).toUpperCase() !== 'COMPLETED') {
      throw new BadRequestException(`PayPal order is not complete (status: ${String(order.status || 'unknown')})`);
    }

    const capture = (order.purchase_units as any[])?.[0]?.payments?.captures?.[0];
    const result = await this.updateRegistrationPayment({
      p_registration_id: registrationId,
      p_payment_status: 'paid',
      p_payment_provider: 'paypal',
      p_payment_order_id: order.id || orderId,
      p_payment_reference: capture?.id || order.id || orderId,
      p_gateway_response: {
        provider: 'paypal',
        orderId,
        capturedAt: new Date().toISOString(),
        source: 'paypal-api-capture',
        order,
      },
    });

    return {
      status: 'paid',
      provider: 'paypal',
      registrationId,
      orderId,
      data: result,
    };
  }

  async validateCoupon(code: string, amountUsd = 0) {
    if (!code) return { valid: false, message: 'Coupon code is required' };
    const rows = await this.list('coupon_codes', { code: code.trim().toUpperCase(), is_active: true }) as any[];
    const coupon = rows[0];
    if (!coupon) return { valid: false, message: 'Invalid coupon code' };

    const now = Date.now();
    if (coupon.valid_from && new Date(coupon.valid_from).getTime() > now) return { valid: false, message: 'Coupon is not active yet' };
    if (coupon.valid_until && new Date(coupon.valid_until).getTime() < now) return { valid: false, message: 'Coupon has expired' };
    if (coupon.max_uses && Number(coupon.current_uses ?? 0) >= Number(coupon.max_uses)) return { valid: false, message: 'Coupon usage limit reached' };

    const percent = Number(coupon.discount_percent ?? 0);
    const amount = Number(coupon.discount_amount ?? 0);
    const discount = amount || Math.round((Number(amountUsd) * percent) / 100 * 100) / 100;
    const finalAmount = Math.max(0, Number(amountUsd) - discount);
    return {
      valid: true,
      coupon_id: coupon.id,
      code: coupon.code,
      coupon,
      discount_percent: coupon.discount_percent,
      discount_amount: discount,
      final_amount: Math.round(finalAmount * 100) / 100,
    };
  }

  // Consume one use of a coupon. Coupon usage is reserved atomically at order
  // creation (see reserveCoupon) and released on failure (releaseCoupon), so
  // there is no separate redeem-at-settlement step.

  // Reserve one use of a coupon at the moment an order is created, rather than
  // waiting for settlement. This is what actually enforces a usage cap: without
  // it, several orders created back-to-back (a user paying repeatedly "in a
  // single timestamp") would each pass validation while current_uses is still
  // below max_uses, and every one of them would get the discount. The atomic
  // conditional increment only succeeds while the limit has room, so the second
  // order for a 1-use coupon is refused here. Returns true when a use was taken.
  // An unlimited coupon (max_uses NULL) always succeeds. `releaseCoupon` gives
  // the use back if that order later fails, so a failed attempt never burns it.
  async reserveCoupon(code?: string | null): Promise<boolean> {
    const trimmed = String(code || '').trim().toUpperCase();
    if (!trimmed) return true;
    const affected = (await (this.prisma as any).$executeRawUnsafe(
      'UPDATE `coupon_codes` SET `current_uses` = COALESCE(`current_uses`, 0) + 1 ' +
        'WHERE `code` = ? AND (`max_uses` IS NULL OR COALESCE(`current_uses`, 0) < `max_uses`)',
      trimmed,
    )) as number;
    return Number(affected) > 0;
  }

  // Give back a use reserved by `reserveCoupon` when its order never gets paid
  // (payment failed, or the gateway order could not be created). Floors at zero
  // so it can never drive the counter negative.
  async releaseCoupon(code?: string | null) {
    const trimmed = String(code || '').trim().toUpperCase();
    if (!trimmed) return;
    await (this.prisma as any).$executeRawUnsafe(
      'UPDATE `coupon_codes` SET `current_uses` = GREATEST(COALESCE(`current_uses`, 0) - 1, 0) ' +
        'WHERE `code` = ?',
      trimmed,
    );
  }

  // Orders that were started but never reached a terminal state (CREATED /
  // PENDING) and are older than `olderThanMinutes`. Used by the stale-order
  // sweeper to reclaim coupon uses that a buyer reserved and then abandoned —
  // without this, a closed checkout tab would hold a capped coupon's use
  // forever. Returns the raw order rows so the caller can release each coupon
  // and mark the order CANCELLED.
  async findStaleOpenOrders(olderThanMinutes: number): Promise<Record<string, any>[]> {
    const minutes = Math.max(1, Math.floor(olderThanMinutes));
    const rows = (await (this.prisma as any).$queryRawUnsafe(
      "SELECT * FROM `orders` WHERE `status` IN ('CREATED','PENDING') " +
        'AND `created_at` < (NOW() - INTERVAL ? MINUTE)',
      minutes,
    )) as Record<string, any>[];
    return Array.isArray(rows) ? rows : [];
  }

  async updateRegistrationPayment(payload: Record<string, unknown>) {
    const id = String(payload.p_registration_id ?? payload.registrationId ?? '');
    if (!id) throw new BadRequestException('Registration id is required');

    const nextPaymentStatus = String(payload.p_payment_status ?? payload.payment_status ?? 'pending');
    const dataToUpdate: Record<string, unknown> = {
      payment_status: nextPaymentStatus,
      payment_provider: payload.p_payment_provider ?? payload.payment_provider,
      payment_reference: payload.p_payment_reference,
      payment_session_id: payload.p_payment_session_id,
      payment_order_id: payload.p_payment_order_id,
      gateway_response: payload.p_gateway_response ?? payload.gateway_response,
      status: payload.p_status ?? payload.status ?? (nextPaymentStatus === 'paid' ? 'confirmed' : 'pending'),
      notes: payload.p_notes ?? payload.notes,
    };

    if (nextPaymentStatus === 'paid') {
      dataToUpdate.completed_at = new Date().toISOString();
    }

    let updated: Record<string, unknown> | null;
    if (nextPaymentStatus.toLowerCase() === 'paid') {
      const writable = this.pickWritable('registration_intents', dataToUpdate);
      const columns = Object.keys(writable);
      const setClause = columns.map((column) => `${column} = ?`).join(', ');
      const affected = await (this.prisma as any).$transaction(async (tx: any) => {
        const changed = await tx.$executeRawUnsafe(
          `UPDATE registration_intents SET ${setClause} WHERE id = ? AND LOWER(payment_status) <> 'paid'`,
          ...columns.map((column) => this.normalizeValue(writable[column])),
          id,
        );
        if (Number(changed) === 1) {
          const row = ((await tx.$queryRawUnsafe(
            'SELECT `id`, `full_name`, `email`, `plan_name`, `amount_usd`, `currency`, `created_at` FROM `registration_intents` WHERE `id` = ? LIMIT 1',
            id,
          )) as Record<string, any>[])[0];
          if (row) {
            const notification: EmailNotification = {
              type: 'PAYMENT_CONFIRMED',
              dedupeKey: `PAYMENT_CONFIRMED:${id}`,
              recipient: String(row.email || ''),
              payload: { registrationId: id },
            };
            const paired = this.notificationPair(notification, {
              eventType: 'PAYMENT_CONFIRMED',
              submittedAt: new Date().toISOString(),
              referenceId: id,
              fields: { Registration: String(row.plan_name || ''), Status: 'paid' },
            });
            for (const item of paired) {
              if (isEmailAddress(item.recipient) || item.recipientRole === 'ADMIN') await this.insertEmailNotification(item, tx);
            }
          }
        }
        return Number(changed);
      });
      const rows = (await this.list('registration_intents', { id })) as Record<string, unknown>[];
      updated = rows[0] ?? null;
      if (Number(affected) === 1) {
        await this.dispatchQueuedEmailBestEffort(`PAYMENT_CONFIRMED:${id}`, 'PAYMENT_CONFIRMED');
        if (isEmailAddress(String(process.env.ADMIN_NOTIFICATION_EMAIL || '').trim())) {
          await this.dispatchQueuedEmailBestEffort(`PAYMENT_CONFIRMED:${id}:ADMIN`, 'PAYMENT_CONFIRMED');
        }
      }
    } else {
      updated = await this.update('registration_intents', id, dataToUpdate) as Record<string, unknown> | null;
    }

    return updated;
  }

  async deliverPaymentConfirmation(registrationId: string) {
    const user = await this.deliverEmailNotification(`PAYMENT_CONFIRMED:${registrationId}`);
    const admin = await this.deliverEmailNotification(`PAYMENT_CONFIRMED:${registrationId}:ADMIN`);
    return { user, admin };
  }

  async retryFailedPaymentNotifications(limit = 50) {
    return this.retryFailedEmailNotifications(limit);
  }

  async verifyPaymentWebhook(
    provider: string,
    payload: Record<string, unknown>,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const normalizedProvider = (provider || 'stripe').toLowerCase();
    if (!['stripe', 'paypal'].includes(normalizedProvider)) {
      throw new BadRequestException(`Unsupported payment webhook provider: ${normalizedProvider}`);
    }

    if (!rawBody?.length) throw new BadRequestException('Webhook body is missing');
    if (normalizedProvider === 'stripe') this.verifyStripeSignature(rawBody, this.header(headers, 'stripe-signature'));
    else await this.verifyPayPalWebhook(payload, headers);

    const providerReference = this.getProviderReference(payload, normalizedProvider);

    if (providerReference) {
      const existing = await this.list('registration_intents', { payment_reference: providerReference }) as any[];
      if (existing.length > 0) {
        return {
          received: true,
          duplicate: true,
          provider: normalizedProvider,
          message: 'Duplicate webhook event ignored.',
          registrationId: existing[0].id,
        };
      }
    }

    const registrationId = this.getWebhookRegistrationId(payload, normalizedProvider);
    if (registrationId) {
      const current = (await this.list('registration_intents', { id: registrationId }) as any[])[0];
      if (!current) throw new NotFoundException('Webhook references an unknown registration');

      const isPaid = normalizedProvider === 'stripe'
        ? ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded'].includes(String(payload.type))
        : String(payload.event_type) === 'PAYMENT.CAPTURE.COMPLETED';

      if (!isPaid) {
        return { received: true, provider: normalizedProvider, ignored: true, message: 'Webhook event does not confirm payment.' };
      }

      await this.updateRegistrationPayment({
        p_registration_id: registrationId,
        p_payment_status: 'paid',
        p_payment_provider: normalizedProvider,
        p_payment_reference: providerReference || `webhook-${normalizedProvider}-${Date.now()}`,
        p_gateway_response: {
          provider: normalizedProvider,
          event: payload,
          verifiedAt: new Date().toISOString(),
        },
      });
    }

    return {
      received: true,
      provider: normalizedProvider,
      message: 'Webhook verified successfully.',
    };
  }

  async getPaymentProviderStatus() {
    const production = String(process.env.NODE_ENV).toLowerCase() === 'production';
    const paymentMode = String(process.env.PAYMENT_MODE || 'sandbox').toLowerCase();
    const liveModeReady = !production || paymentMode === 'production';
    const httpsReady = !production || String(process.env.FRONTEND_URL || '').split(',').every((url) => url.trim().startsWith('https://'));
    const razorpayKeyId = String(process.env.RAZORPAY_KEY_ID || '');
    const razorpayKeyModeReady = (razorpayKeyId.startsWith('rzp_live_') && production && paymentMode === 'production') ||
      (razorpayKeyId.startsWith('rzp_test_') && paymentMode === 'sandbox');
    return {
      stripe: {
        configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && liveModeReady && httpsReady && (!production || process.env.STRIPE_SECRET_KEY.startsWith('sk_live_'))),
        mode: process.env.PAYMENT_MODE || 'sandbox',
      },
      paypal: {
        configured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_WEBHOOK_ID && liveModeReady && httpsReady),
        mode: process.env.PAYMENT_MODE || 'sandbox',
      },
      razorpay: {
        configured: Boolean(razorpayKeyModeReady && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET && httpsReady),
        mode: paymentMode,
      },
      phonepe: {
        configured: false,
        mode: process.env.PAYMENT_MODE || 'sandbox',
      },
    };
  }

  async generateReceipt(payload: Record<string, unknown>) {
    const registrationId = String(payload.registrationId ?? payload.p_registration_id ?? payload.registration_id ?? '');
    if (!registrationId) throw new BadRequestException('Registration id is required');

    const rows = await this.list('registration_intents', { id: registrationId }) as any[];
    const registration = rows[0];
    if (!registration) throw new NotFoundException('Registration not found');

    const requestedOrderId = String(payload.orderId ?? payload.order_id ?? '').trim();
    if (!requestedOrderId) throw new BadRequestException('An exact order id is required to generate a receipt');
    const orders = (await this.list('orders', { registration_id: registrationId })) as any[];
    const order = orders.find((o) => String(o.id) === requestedOrderId);
    if (!order) throw new NotFoundException('Order not found for this registration');
    let paymentRef: string | null = null;
    let paymentMethod: string | null = null;
    let paymentDate: string | null = null;
    let refunds: Record<string, any>[] = [];
    const hasFinalPaymentState = ['PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED']
      .includes(String(order.status).toUpperCase());
    if (!hasFinalPaymentState) throw new BadRequestException('A verified payment is required to generate this order receipt');
    const payments = (await this.list('payments', { order_id: order.id })) as any[];
    const successfulPayments = payments.filter((payment) =>
      String(payment.status).toUpperCase() === 'SUCCESS' &&
      String(payment.provider).toLowerCase() === String(order.provider).toLowerCase() &&
      Boolean(payment.provider_payment_id) &&
      String(payment.provider_order_id || '') === String(order.provider_order_id || '') &&
      Number(payment.amount) === Number(order.final_amount) &&
      String(payment.currency).toUpperCase() === String(order.currency).toUpperCase() &&
      Number(payment.gateway_amount) === Number(order.gateway_amount) &&
      String(payment.gateway_currency).toUpperCase() === String(order.gateway_currency).toUpperCase(),
    );
    if (successfulPayments.length !== 1) {
      throw new ServiceUnavailableException('Verified payment transaction is unavailable or inconsistent');
    }
    const successfulPayment = successfulPayments[0];
    paymentRef = successfulPayment.provider_payment_id;
    paymentMethod = successfulPayment.method || null;
    paymentDate = successfulPayment.created_at || null;
    refunds = (await this.list('refunds', { order_id: order.id })) as Record<string, any>[];

    const money = (value: unknown, currency: string) => `${currency} ${Number(value ?? 0).toFixed(2)}`;

    const doc = new PDFDocument({ size: 'A4', margin: 48 });

    doc.fontSize(22).text('Conference Registration Invoice', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Receipt Number: ${this.generateReceiptNumber(registrationId, order?.order_number)}`);
    doc.text(`Acknowledgement Number: ${this.generateAcknowledgementNumber(registrationId)}`);
    if (order?.order_number) doc.text(`Order Number: ${order.order_number}`);
    doc.text(`Registration ID: ${registration.id}`);
    doc.text(`Issued At: ${new Date().toLocaleString()}`);
    doc.moveDown(0.5);

    doc.fontSize(13).text('Attendee', { underline: true });
    doc.fontSize(12).text(`Name: ${registration.full_name || 'N/A'}`);
    doc.text(`Email: ${registration.email || 'N/A'}`);
    if (registration.phone && registration.phone !== 'Not provided') doc.text(`Phone: ${registration.phone}`);
    if (registration.affiliation) doc.text(`Affiliation: ${registration.affiliation}`);
    if (registration.country) doc.text(`Country: ${registration.country}`);
    doc.moveDown(0.5);

    doc.fontSize(13).text('Payment', { underline: true });
    doc.fontSize(12).text(`Plan: ${registration.plan_name || registration.plan_key || 'N/A'}`);
    doc.text(`Quantity: ${Number(order?.quantity ?? registration.quantity ?? 1)}`);
    if (order) {
      const cur = String(order.currency || 'USD');
      doc.text(`Base Amount: ${money(order.base_amount, cur)}`);
      if (Number(order.discount_amount) > 0) doc.text(`Discount: -${money(order.discount_amount, cur)}`);
      doc.text(`Tax/Service Charge: ${money(order.tax_amount, cur)}`);
      if (order.accommodation_option_id) {
        doc.text(`Accommodation: ${order.accommodation_name || 'Accommodation'}`);
        doc.text(`Stay: ${order.accommodation_check_in} to ${order.accommodation_check_out} (${Number(order.accommodation_nights)} night(s))`);
        doc.text(`Accommodation Total: ${money(order.accommodation_total, cur)}`);
      }
      doc.text(`Total: ${money(order.final_amount, cur)}`);
      doc.text(`Charged at gateway: ${String(successfulPayment.gateway_currency)} ${(Number(successfulPayment.gateway_amount) / 100).toFixed(2)}`);
    } else {
      doc.text(`Amount: ${money(registration.amount_usd ?? registration.amount, String(registration.currency || 'USD'))}`);
    }
    doc.text(`Payment Provider: ${order?.provider || registration.payment_provider || 'N/A'}`);
    if (paymentMethod) doc.text(`Payment Method: ${paymentMethod}`);
    if (paymentDate) doc.text(`Payment Date: ${new Date(paymentDate).toISOString()}`);
    if (paymentRef) doc.text(`Payment Reference: ${paymentRef}`);
    doc.text(`Status: ${order?.status || registration.payment_status || 'pending'}`);
    for (const refund of refunds) {
      doc.text(`Refund ${refund.provider_refund_id || refund.id}: ${String(refund.status).toUpperCase()} - ${String(refund.currency)} ${(Number(refund.amount_minor) / 100).toFixed(2)}`);
    }
    doc.moveDown();
    doc.text('Thank you for registering. Please keep this receipt for your records.');
    doc.end();

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const bufferChunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => bufferChunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(bufferChunks)));
      doc.on('error', reject);
    });

    return {
      registrationId,
      receiptNumber: this.generateReceiptNumber(registrationId, order?.order_number),
      acknowledgementNumber: this.generateAcknowledgementNumber(registrationId),
      pdfBase64: pdfBuffer.toString('base64'),
      mimeType: 'application/pdf',
      url: `/api/functions/receipt/${registrationId}`,
    };
  }

  async getReceipt(registrationId: string, orderId?: string) {
    if (!String(orderId || '').trim()) throw new BadRequestException('An exact order id is required to generate a receipt');
    const rows = await this.list('registration_intents', { id: registrationId }) as any[];
    const registration = rows[0];
    if (!registration) throw new NotFoundException('Registration not found');

    const result = await this.generateReceipt({ registrationId, orderId });
    return {
      registrationId,
      receiptNumber: result.receiptNumber,
      acknowledgementNumber: result.acknowledgementNumber,
      pdfBase64: result.pdfBase64,
      mimeType: result.mimeType,
    };
  }

  async sendPaymentSuccessNotification(registrationId: string, _registration: Record<string, unknown> | null) {
    const rows = await this.list('registration_intents', { id: registrationId }) as any[];
    const row = rows[0];
    if (!row || String(row.payment_status || '').toLowerCase() !== 'paid' || !isEmailAddress(String(row.email || ''))) {
      throw new ConflictException('A persisted paid registration with a valid recipient is required');
    }

    const gatewayResponse = row.gateway_response && typeof row.gateway_response === 'object' && !Array.isArray(row.gateway_response)
      ? row.gateway_response as Record<string, unknown>
      : {};
    const orderId = String(gatewayResponse.orderId || '');
    const orders = orderId
      ? await this.list('orders', { id: orderId, registration_id: registrationId }) as Record<string, any>[]
      : [];
    const order = orders[0];
    if (!order || !['PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(String(order.status || '').toUpperCase())) {
      throw new ConflictException('A persisted paid order is required before payment confirmation');
    }
    const payments = order ? await this.list('payments', { order_id: order.id, status: 'SUCCESS' }) as Record<string, any>[] : [];
    const payment = payments[0];
    if (!payment) throw new ConflictException('A verified successful payment is required before confirmation');
    const acknowledgementNumber = this.generateAcknowledgementNumber(registrationId);
    const receiptNumber = this.generateReceiptNumber(registrationId, order?.order_number);
    const currency = String(order?.gateway_currency || row.currency || 'USD');
    const amount = order
      ? (Number(order.gateway_amount) / 100).toFixed(2)
      : Number(row.amount_usd ?? row.amount ?? 0).toFixed(2);
    const provider = String(row.payment_provider ?? 'gateway');
    const receipt = order && payment?.provider_payment_id
      ? await this.generateReceipt({ registrationId, orderId: order.id })
      : null;
    const frontendUrl = String(process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
    const receiptUrl = order?.access_token
      ? `${frontendUrl}/?payment=success&order=${encodeURIComponent(String(order.access_token))}`
      : null;
    const accommodation = order.accommodation_option_id && order.accommodation_name
      ? {
        name: String(order.accommodation_name),
        checkIn: String(order.accommodation_check_in || ''),
        checkOut: String(order.accommodation_check_out || ''),
        nights: Number(order.accommodation_nights || 0),
        total: `${currency} ${Number(order.accommodation_total || 0).toFixed(2)}`,
      }
      : null;

    await this.emailService.sendPaymentConfirmation(
      String(row.email),
      {
        firstName: String(row.full_name || '').split(/\s+/)[0],
        registrationId: String(row.id ?? registrationId),
        acknowledgementNumber,
        receiptNumber,
        provider,
        amount: `${currency} ${amount}`,
        orderNumber: order.order_number ? String(order.order_number) : undefined,
        paymentId: payment.provider_payment_id ? String(payment.provider_payment_id) : undefined,
        receiptUrl,
        accommodation,
      },
      receipt ? [{
        filename: `receipt-${receipt.receiptNumber}.pdf`,
        content: receipt.pdfBase64,
      }] : [],
    );

    return {
      acknowledgementNumber,
      receiptNumber,
      emailSent: true,
    };
  }

  private async sendPaymentAdminNotification(registrationId: string, recipient: string) {
    const registration = ((await this.list('registration_intents', { id: registrationId })) as Record<string, any>[])[0];
    if (!registration || String(registration.payment_status || '').toLowerCase() !== 'paid') {
      throw new ConflictException('A persisted paid registration is required before admin notification');
    }
    const gatewayResponse = registration.gateway_response && typeof registration.gateway_response === 'object'
      ? registration.gateway_response as Record<string, unknown>
      : {};
    const orderId = String(gatewayResponse.orderId || '');
    const order = orderId
      ? ((await this.list('orders', { id: orderId, registration_id: registrationId })) as Record<string, any>[])[0]
      : undefined;
    if (!order || !['PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(String(order.status || '').toUpperCase())) {
      throw new ConflictException('A persisted paid order is required before admin notification');
    }
    const payments = (await this.list('payments', { order_id: order.id, status: 'SUCCESS' })) as Record<string, any>[];
    const verifiedPayments = payments.filter((payment) =>
      String(payment.provider).toLowerCase() === String(order.provider).toLowerCase() &&
      Boolean(payment.provider_payment_id) &&
      String(payment.provider_order_id || '') === String(order.provider_order_id || '') &&
      Number(payment.amount) === Number(order.final_amount) &&
      String(payment.currency).toUpperCase() === String(order.currency).toUpperCase() &&
      Number(payment.gateway_amount) === Number(order.gateway_amount) &&
      String(payment.gateway_currency).toUpperCase() === String(order.gateway_currency).toUpperCase(),
    );
    if (verifiedPayments.length !== 1) {
      throw new ConflictException('A verified successful payment is required before admin notification');
    }
    const payment = verifiedPayments[0];
    const accommodation = order.accommodation_option_id
      ? `${String(order.accommodation_name || 'Accommodation')}: ${String(order.accommodation_check_in || '')} to ${String(order.accommodation_check_out || '')}`
      : '';
    await this.emailService.sendAdminEventNotification(recipient, {
      eventType: 'PAYMENT_CONFIRMED',
      submittedAt: String(payment.created_at || new Date().toISOString()),
      referenceId: String(order.order_number || order.id),
      fields: {
        Name: String(registration.full_name || ''),
        Email: String(registration.email || ''),
        Registration: String(registration.plan_name || registration.plan_key || ''),
        Quantity: String(order.quantity || ''),
        'Order number': String(order.order_number || order.id),
        Provider: String(order.provider || ''),
        'Authoritative order amount': `${String(order.currency || 'USD')} ${Number(order.final_amount || 0).toFixed(2)}`,
        'Provider-confirmed charge': `${String(payment.gateway_currency || 'USD')} ${(Number(payment.gateway_amount || 0) / 100).toFixed(2)}`,
        Accommodation: accommodation,
      },
    });
  }

  private generateAcknowledgementNumber(registrationId: string) {
    const prefix = 'CONF';
    const suffix = String(registrationId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'PAY';
    return `${prefix}-${suffix}-${new Date().getFullYear()}`;
  }

  private generateReceiptNumber(registrationId: string, orderNumber?: string) {
    const source = orderNumber || registrationId;
    const suffix = String(source).replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase() || 'RECEIPT';
    return `RCPT-${suffix}-${new Date().getFullYear()}`;
  }

  private getProviderReference(payload: Record<string, unknown>, provider: string) {
    const data = payload.data as Record<string, unknown> | undefined;
    const event = payload.event as Record<string, unknown> | undefined;

    const candidates = [
      payload.reference,
      payload.payment_reference,
      payload.paymentReference,
      payload.id,
      payload.event_id,
      payload.session_id,
      payload.order_id,
      payload.orderId,
      payload.transaction_id,
      payload.transactionId,
      payload.paymentId,
      payload.payment_id,
      data?.payment_id,
      data?.id,
      event?.id,
    ];

    const value = candidates.find((item) => typeof item === 'string' && item.trim());
    if (!value) return '';

    return `${provider}:${String(value).trim()}`;
  }

  private getWebhookSecret(provider: string) {
    const configMap: Record<string, string> = {
      stripe: process.env.STRIPE_WEBHOOK_SECRET || '',
      razorpay: process.env.RAZORPAY_WEBHOOK_SECRET || '',
      paypal: process.env.PAYPAL_WEBHOOK_SECRET || '',
      phonepe: process.env.PHONEPE_WEBHOOK_SECRET || '',
    };
    return configMap[provider] || '';
  }

  private verifyStripeSignature(rawBody: Buffer, signatureHeader?: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Stripe webhook verification is not configured');
    if (!signatureHeader) throw new UnauthorizedException('Missing Stripe signature');

    const values = signatureHeader.split(',').reduce<Record<string, string[]>>((result, part) => {
      const [key, value] = part.split('=', 2);
      if (key && value) (result[key] ||= []).push(value);
      return result;
    }, {});
    const timestamp = values.t?.[0];
    const signatures = values.v1 || [];
    if (!timestamp || !signatures.length || !/^\d+$/.test(timestamp)) {
      throw new UnauthorizedException('Invalid Stripe signature header');
    }

    // Stripe recommends a five minute tolerance to reject replayed deliveries.
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) {
      throw new UnauthorizedException('Expired Stripe webhook signature');
    }
    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
    const verified = signatures.some((signature) => this.safeCompare(expected, signature));
    if (!verified) throw new UnauthorizedException('Invalid Stripe webhook signature');
  }

  private async verifyPayPalWebhook(payload: Record<string, unknown>, headers: Record<string, string | string[] | undefined>) {
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
    if (verification.verification_status !== 'SUCCESS') {
      throw new UnauthorizedException('Invalid PayPal webhook signature');
    }
  }

  private async createStripeCheckoutSession(registrationId: string, registration: Record<string, any>, amount: number, frontendUrl: string) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new ServiceUnavailableException('Stripe is not configured');

    const form = new URLSearchParams({
      mode: 'payment',
      success_url: `${frontendUrl}/registration/success?provider=stripe&registration_id=${encodeURIComponent(registrationId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/registration/cancel?provider=stripe&registration_id=${encodeURIComponent(registrationId)}`,
      client_reference_id: registrationId,
      'metadata[registration_id]': registrationId,
      'payment_intent_data[metadata][registration_id]': registrationId,
      'line_items[0][price_data][currency]': String(registration.currency || 'USD').toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
      'line_items[0][price_data][product_data][name]': String(registration.plan_name || 'Conference registration'),
      'line_items[0][quantity]': '1',
    });
    if (registration.email) form.set('customer_email', String(registration.email));

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `conference-checkout-${registrationId}`,
      },
      body: form.toString(),
    });
    const result = await response.json().catch(() => ({})) as any;
    if (!response.ok || !result.url) throw new BadRequestException(result?.error?.message || 'Stripe could not create a checkout session');
    return { url: String(result.url), reference: String(result.id) };
  }

  private async createPayPalCheckout(registrationId: string, registration: Record<string, any>, amount: number, frontendUrl: string) {
    const order = await this.payPalRequest('/v2/checkout/orders', 'POST', {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: registrationId,
        custom_id: registrationId,
        description: String(registration.plan_name || 'Conference registration'),
        amount: { currency_code: 'USD', value: amount.toFixed(2) },
      }],
      application_context: {
        return_url: `${frontendUrl}/registration/success?provider=paypal&registration_id=${encodeURIComponent(registrationId)}`,
        cancel_url: `${frontendUrl}/registration/cancel?provider=paypal&registration_id=${encodeURIComponent(registrationId)}`,
        user_action: 'PAY_NOW',
      },
    });
    const approvalUrl = (order.links as any[])?.find((link) => link.rel === 'approve')?.href;
    if (!approvalUrl) throw new BadRequestException('PayPal did not return an approval URL');
    return { url: String(approvalUrl), reference: String(order.id) };
  }

  private async payPalRequest(path: string, method: 'POST' | 'GET', body?: Record<string, unknown>) {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new ServiceUnavailableException('PayPal is not configured');
    const baseUrl = process.env.PAYMENT_MODE === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const token = await tokenResponse.json().catch(() => ({})) as any;
    if (!tokenResponse.ok || !token.access_token) throw new ServiceUnavailableException('Could not authenticate with PayPal');

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => ({})) as any;
    if (!response.ok) throw new BadRequestException(result?.message || 'PayPal request failed');
    return result as Record<string, any>;
  }

  private getWebhookRegistrationId(payload: Record<string, unknown>, provider: string) {
    const data = payload.data as Record<string, any> | undefined;
    const resource = payload.resource as Record<string, any> | undefined;
    if (provider === 'stripe') {
      return String(data?.object?.client_reference_id || data?.object?.metadata?.registration_id || data?.object?.payment_intent?.metadata?.registration_id || '');
    }
    return String(resource?.custom_id || resource?.purchase_units?.[0]?.custom_id || '');
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string) {
    const value = headers[name] || headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  private safeCompare(expected: string, actual: string) {
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(actual);
    return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
  }

  private async createHostedCheckout(provider: 'stripe' | 'paypal', payload: Record<string, unknown>) {
    const registrationId = String(payload.registrationId ?? payload.p_registration_id ?? payload.registration_id ?? '');
    if (!registrationId) throw new BadRequestException('Registration id is required');

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
    const registration = await this.list('registration_intents', { id: registrationId }) as any[];
    const registrationRow = registration[0] ?? {};
    const amount = Number(registrationRow.amount_usd ?? payload.amountUsd ?? payload.amount ?? 0);
    const email = String(registrationRow.email ?? payload.email ?? '');
    if (!registrationRow.id) throw new NotFoundException('Registration not found');
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Registration amount must be greater than zero');

    const checkout = provider === 'stripe'
      ? await this.createStripeCheckoutSession(registrationId, registrationRow, amount, frontendUrl)
      : await this.createPayPalCheckout(registrationId, registrationRow, amount, frontendUrl);

    await this.updateRegistrationPayment({
      p_registration_id: registrationId,
      p_payment_provider: provider,
      p_payment_status: 'pending',
      p_payment_reference: checkout.reference,
      ...(provider === 'stripe' ? { p_payment_session_id: checkout.reference } : { p_payment_order_id: checkout.reference }),
      p_gateway_response: {
        provider,
        registrationId,
        url: checkout.url,
        reference: checkout.reference,
        createdAt: new Date().toISOString(),
        mode: 'provider-api',
      },
    });

    return {
      provider,
      registrationId,
      url: checkout.url,
      status: 'pending',
      message: 'Payment session created successfully.',
    };
  }

  private appendPaymentParams(paymentUrl: string, params: Record<string, string | number | null | undefined>) {
    try {
      const url = new URL(paymentUrl);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && String(value).trim()) {
          url.searchParams.set(key, String(value));
        }
      });
      return url.toString();
    } catch {
      return paymentUrl;
    }
  }

  async resolveRegistrationPlan(planKey: string) {
    const match = /^(pre|early|mid|onspot)-(speaker|poster|student|delegate)$/.exec(planKey);
    if (!match) throw new BadRequestException('Invalid registration plan');
    const [, period, category] = match;
    await this.assertRegistrationPeriodOpen(period);
    const priceField: Record<string, string> = { pre: 'preEarly', early: 'earlyBird', mid: 'midterm', onspot: 'onSpot' };
    let amount = DEFAULT_PRICES[category][period];
    let label = category.charAt(0).toUpperCase() + category.slice(1);

    const settings = await this.list('site_data', { data_key: 'registration_pricing' }) as any[];
    if (settings[0]?.value) {
      try {
        const prices = JSON.parse(String(settings[0].value));
        const configured = Array.isArray(prices) ? prices.find((row) => row?.id === category) : undefined;
        if (configured && Number.isFinite(Number(configured[priceField[period]]))) {
          amount = Number(configured[priceField[period]]);
          label = String(configured.category || label);
        }
      } catch {
        // Defaults keep checkout available if a non-critical display setting is malformed.
      }
    }
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('This registration plan is unavailable');
    return { amount, label };
  }

  private async assertRegistrationPeriodOpen(period: string) {
    const settings = (await this.list('site_data', { data_key: 'important_dates' })) as any[];
    if (!settings[0]?.value) throw new ServiceUnavailableException('Registration dates are not configured');

    let windows: Array<Record<string, unknown>>;
    try {
      const parsed = JSON.parse(String(settings[0].value));
      if (!Array.isArray(parsed)) throw new Error('Expected an array');
      windows = parsed;
    } catch {
      throw new ServiceUnavailableException('Registration dates are invalid');
    }

    const window = windows.find((item) => item?.id === period);
    if (!window) throw new BadRequestException('This registration period is not available');

    const normalizeDate = (value: unknown) => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
    };
    const startDate = window.startDate == null || window.startDate === '' ? null : normalizeDate(window.startDate);
    const endDate = window.endDate == null || window.endDate === '' ? null : normalizeDate(window.endDate);
    if ((window.startDate && !startDate) || (window.endDate && !endDate) || (startDate && endDate && startDate > endDate)) {
      throw new ServiceUnavailableException('Registration dates are invalid');
    }

    const today = new Date().toISOString().slice(0, 10);
    if ((startDate && today < startDate) || (endDate && today > endDate)) {
      throw new BadRequestException('This registration period is closed');
    }
  }

  // Authoritative price calculation. The backend recomputes every figure from the
  // plan and coupon so the client-supplied amount is never trusted. Returns an
  // immutable snapshot (base/discount/tax/final) suitable for an order record.
  async computeRegistrationAmount(planKey: string, requestedCoupon?: string | null, quantity = 1) {
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      throw new BadRequestException('Quantity must be an integer between 1 and 100');
    }
    const plan = await this.resolveRegistrationPlan(String(planKey || '').trim().toLowerCase());
    let discount = 0;
    let couponCode: string | null = null;
    const base = Math.round(plan.amount * count * 100) / 100;

    const code = String(requestedCoupon || '').trim();
    if (code) {
      const coupon = await this.validateCoupon(code, base);
      if (!coupon.valid) throw new BadRequestException(coupon.message || 'Invalid coupon');
      discount = Math.min(Number(coupon.discount_amount) || 0, base);
      couponCode = String(coupon.code);
    }

    const discounted = Math.max(0, base - discount);
    const tax = Math.round(discounted * SERVICE_CHARGE_RATE * 100) / 100;
    const final = Math.round((discounted + tax) * 100) / 100;

    return {
      planKey: String(planKey).trim().toLowerCase(),
      planLabel: plan.label,
      baseAmount: base,
      discountAmount: Math.round(discount * 100) / 100,
      taxAmount: tax,
      finalAmount: final,
      currency: 'USD',
      couponCode,
    };
  }

  private getTable(table: string) {
    const config = TABLES[table];
    if (!config) throw new NotFoundException(`Unknown table: ${table}`);
    return config;
  }

  private buildWhere(config: TableConfig, filters: Record<string, unknown>) {
    const clauses: string[] = [];
    const values: unknown[] = [];

    Object.entries(filters).forEach(([column, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (!config.columns.includes(column)) throw new BadRequestException(`Unknown column: ${column}`);
      if (Array.isArray(value)) {
        if (!value.length) return;
        clauses.push(`\`${column}\` IN (${value.map(() => '?').join(', ')})`);
        values.push(...value);
        return;
      }
      clauses.push(`\`${column}\` = ?`);
      values.push(value);
    });

    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
  }

  private buildOrder(config: TableConfig, order: Sort[]) {
    const safe = order.filter((item) => config.columns.includes(item.column));
    if (!safe.length) return '';
    return `ORDER BY ${safe.map((item) => `\`${item.column}\` ${item.ascending === false ? 'DESC' : 'ASC'}`).join(', ')}`;
  }

  private pickWritable(table: string, payload: Record<string, unknown>, includeId = false) {
    const config = this.getTable(table);
    const data: Record<string, unknown> = {};
    if (includeId && payload.id !== undefined) data.id = payload.id;
    config.writable.forEach((column) => {
      if (payload[column] !== undefined) data[column] = payload[column];
    });
    return data;
  }

  private normalizeValue(value: unknown, preserveIsoDatetime = false) {
    if (value === undefined) return null;
    if (value instanceof Date) return this.toMysqlDateTime(value);
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    // MySQL DATETIME columns reject ISO-8601 strings that carry a 'T'/'Z'
    // (e.g. 2026-09-27T20:52:49.676Z), so a completed_at written with
    // Date.toISOString() throws "Incorrect datetime value" and leaves the
    // registration unsynced. Convert any top-level ISO datetime string to the
    // 'YYYY-MM-DD HH:MM:SS' form MySQL accepts. JSON payloads are stringified
    // above, so ISO timestamps embedded inside them are left untouched.
    if (!preserveIsoDatetime && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return this.toMysqlDateTime(parsed);
    }
    return value;
  }

  private toMysqlDateTime(date: Date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
}

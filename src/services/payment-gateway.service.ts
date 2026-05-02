/**
 * Payment Gateway Service
 *
 * Unified interface for Malaysian payment gateways:
 *   - Billplz v3 (FPX / online banking)
 *   - iPay88 (credit/debit card, e-wallet)
 *
 * Flow:
 *   1. Frontend calls POST /api/v1/payment/initiate  → gets payment_url
 *   2. Customer is redirected to gateway
 *   3. Gateway POSTs callback to /api/webhooks/billplz or /api/webhooks/ipay88
 *   4. Backend verifies signature, updates payment_session + deposit_transaction
 *   5. Customer is redirected to /booking/success or /booking/failed
 *
 * References:
 *   - Billplz API v3: https://www.billplz.com/api
 *   - iPay88 Technical Spec v1.6: https://www.ipay88.com.my
 *
 * Content was rephrased for compliance with licensing restrictions.
 */

import crypto from 'crypto';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GatewayType = 'billplz' | 'ipay88';

export interface GatewayConfig {
  enabled: boolean;
  activeGateway: GatewayType;
  billplz: {
    collectionId: string;
    apiKey: string;
    xSignatureKey: string;
    sandboxMode: boolean;
  };
  ipay88: {
    merchantCode: string;
    merchantKey: string;
    sandboxMode: boolean;
  };
}

export interface PaymentInitiateInput {
  reservationId: string;
  branchId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerIp: string;
  userAgent: string;
  browserInfo: BrowserInfo;
  amount: number;           // in RM (e.g. 50.00)
  description: string;      // e.g. "Deposit for booking KL01-2025-42"
  referenceNumber: string;  // reservation reference number
  idempotencyKey: string;
  callbackBaseUrl: string;  // e.g. https://yourdomain.com
  method?: 'fpx' | 'card' | 'ewallet';
}

export interface BrowserInfo {
  browser?: string;
  os?: string;
  device?: string;
  language?: string;
  timezone?: string;
  screenResolution?: string;
}

export interface PaymentInitiateResult {
  paymentSessionId: string;
  paymentUrl: string;       // redirect customer here
  gatewayBillId: string;    // Billplz bill ID or iPay88 RefNo
  gateway: GatewayType;
  amount: number;
  expiresAt: Date;
}

export interface WebhookVerifyResult {
  valid: boolean;
  paid: boolean;
  gatewayBillId: string;
  gatewayRef?: string;
  amount?: number;
  failedReason?: string;
  rawPayload: Record<string, string>;
}

// ─── Config loader ────────────────────────────────────────────────────────────

export async function loadGatewayConfig(): Promise<GatewayConfig> {
  const db = getDatabase();
  const result = await db.query(
    `SELECT key, value FROM app_config WHERE key IN (
      'payment_gateway_enabled','payment_active_gateway',
      'billplz_collection_id','billplz_api_key','billplz_x_signature_key','billplz_sandbox_mode',
      'ipay88_merchant_code','ipay88_merchant_key','ipay88_sandbox_mode'
    )`
  );

  const cfg: Record<string, string> = {};
  for (const row of result.rows) cfg[row.key] = row.value;

  // Decode base64-encoded secrets
  const decode = (v: string) => {
    if (!v) return '';
    try { return Buffer.from(v, 'base64').toString('utf-8'); } catch { return v; }
  };

  return {
    enabled: cfg['payment_gateway_enabled'] === 'true',
    activeGateway: (cfg['payment_active_gateway'] || 'billplz') as GatewayType,
    billplz: {
      collectionId: cfg['billplz_collection_id'] || '',
      apiKey: decode(cfg['billplz_api_key'] || ''),
      xSignatureKey: decode(cfg['billplz_x_signature_key'] || ''),
      sandboxMode: cfg['billplz_sandbox_mode'] !== 'false',
    },
    ipay88: {
      merchantCode: cfg['ipay88_merchant_code'] || '',
      merchantKey: decode(cfg['ipay88_merchant_key'] || ''),
      sandboxMode: cfg['ipay88_sandbox_mode'] !== 'false',
    },
  };
}

// ─── Billplz helpers ──────────────────────────────────────────────────────────

/**
 * Billplz API v3 — Create a bill (FPX payment request).
 *
 * POST https://www.billplz.com/api/v3/bills
 * Auth: Basic auth with API key as username, empty password.
 *
 * Amount is in sen (1 RM = 100 sen).
 * Callback URL receives POST with payment status.
 * X-Signature is HMAC-SHA256 of sorted key=value pairs.
 *
 * Reference: https://www.billplz.com/api (Content rephrased for compliance)
 */
async function billplzCreateBill(
  config: GatewayConfig['billplz'],
  input: PaymentInitiateInput
): Promise<{ billId: string; paymentUrl: string }> {
  const baseUrl = config.sandboxMode
    ? 'https://www.billplz-sandbox.com/api/v3'
    : 'https://www.billplz.com/api/v3';

  const amountInSen = Math.round(input.amount * 100); // RM → sen

  const body = new URLSearchParams({
    collection_id: config.collectionId,
    email: input.customerEmail,
    mobile: input.customerPhone.replace(/\D/g, '').replace(/^0/, '60'), // normalize to +60
    name: input.customerName,
    amount: String(amountInSen),
    description: input.description,
    callback_url: `${input.callbackBaseUrl}/api/webhooks/billplz/callback`,
    redirect_url: `${input.callbackBaseUrl}/booking/payment-result?ref=${input.referenceNumber}`,
    reference_1_label: 'Booking Ref',
    reference_1: input.referenceNumber,
    reference_2_label: 'Customer IP',
    reference_2: input.customerIp,
  });

  const credentials = Buffer.from(`${config.apiKey}:`).toString('base64');

  const response = await fetch(`${baseUrl}/bills`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Billplz bill creation failed: ${JSON.stringify(err)}`);
  }

  const data = await response.json() as { id: string; url: string };
  return { billId: data.id, paymentUrl: data.url };
}

/**
 * Billplz X-Signature verification.
 *
 * Signature is HMAC-SHA256 of all callback parameters sorted alphabetically
 * by key, joined as "key|value" pairs separated by "|".
 *
 * Reference: Billplz API docs (Content rephrased for compliance)
 */
export function billplzVerifySignature(
  params: Record<string, string>,
  xSignatureKey: string
): boolean {
  const { x_signature, ...rest } = params;
  if (!x_signature) return false;

  // Sort keys alphabetically, build pipe-delimited string
  const sortedKeys = Object.keys(rest).sort();
  const message = sortedKeys.map(k => `${k}${rest[k]}`).join('|');

  const expected = crypto
    .createHmac('sha256', xSignatureKey)
    .update(message)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(x_signature, 'hex')
  );
}

// ─── iPay88 helpers ───────────────────────────────────────────────────────────

/**
 * iPay88 signature generation.
 *
 * Signature = SHA256(MerchantKey + MerchantCode + RefNo + Amount + Currency)
 * Amount format: remove decimal point (e.g. "50.00" → "5000")
 *
 * Reference: iPay88 Technical Spec v1.6 (Content rephrased for compliance)
 */
export function ipay88GenerateSignature(
  merchantKey: string,
  merchantCode: string,
  refNo: string,
  amount: number,
  currency = 'MYR'
): string {
  // Amount: remove decimal point, no leading zeros
  const amountStr = amount.toFixed(2).replace('.', '');
  const message = `${merchantKey}${merchantCode}${refNo}${amountStr}${currency}`;
  return crypto.createHash('sha256').update(message).digest('base64');
}

/**
 * iPay88 response signature verification.
 *
 * Verify: SHA256(MerchantKey + MerchantCode + PaymentId + RefNo + Amount + Currency + Status)
 *
 * Reference: iPay88 Technical Spec v1.6 (Content rephrased for compliance)
 */
export function ipay88VerifySignature(
  merchantKey: string,
  params: {
    MerchantCode: string;
    PaymentId: string;
    RefNo: string;
    Amount: string;
    Currency: string;
    Status: string;
    Signature: string;
  }
): boolean {
  const amountStr = params.Amount.replace('.', '');
  const message = `${merchantKey}${params.MerchantCode}${params.PaymentId}${params.RefNo}${amountStr}${params.Currency}${params.Status}`;
  const expected = crypto.createHash('sha256').update(message).digest('base64');
  return expected === params.Signature;
}

/**
 * Build iPay88 payment form parameters.
 * iPay88 uses an HTML form POST redirect (not a REST API).
 *
 * PaymentId: 2 = FPX, 6 = Credit Card, 523 = TNG eWallet
 *
 * Reference: iPay88 Technical Spec v1.6 (Content rephrased for compliance)
 */
function ipay88BuildFormParams(
  config: GatewayConfig['ipay88'],
  input: PaymentInitiateInput
): Record<string, string> {
  const paymentId = input.method === 'card' ? '6' : '2'; // 2=FPX, 6=Card
  const signature = ipay88GenerateSignature(
    config.merchantKey,
    config.merchantCode,
    input.referenceNumber,
    input.amount
  );

  return {
    MerchantCode: config.merchantCode,
    PaymentId: paymentId,
    RefNo: input.referenceNumber,
    Amount: input.amount.toFixed(2),
    Currency: 'MYR',
    ProdDesc: input.description,
    UserName: input.customerName,
    UserEmail: input.customerEmail,
    UserContact: input.customerPhone.replace(/\D/g, ''),
    Remark: `IP:${input.customerIp}`,
    Lang: 'UTF-8',
    SignatureType: 'SHA256',
    Signature: signature,
    ResponseURL: `${input.callbackBaseUrl}/api/webhooks/ipay88/response`,
    BackendURL: `${input.callbackBaseUrl}/api/webhooks/ipay88/callback`,
  };
}

// ─── Main service ─────────────────────────────────────────────────────────────

export class PaymentGatewayService {

  /**
   * Initiate a payment session.
   *
   * For Billplz: creates a bill via REST API, returns redirect URL.
   * For iPay88: builds form params, returns a data URL for form-post redirect.
   *
   * Records a payment_session row with full audit context:
   * customer IP, user agent, browser info, login details.
   */
  static async initiatePayment(input: PaymentInitiateInput): Promise<PaymentInitiateResult> {
    const config = await loadGatewayConfig();

    if (!config.enabled) {
      throw new Error('Payment gateway is not enabled. Configure it in Admin Settings → Payment Gateway.');
    }

    const db = getDatabase();
    const gateway = config.activeGateway;
    let gatewayBillId = '';
    let paymentUrl = '';

    // ── Call gateway API ──────────────────────────────────────────────────────
    if (gateway === 'billplz') {
      if (!config.billplz.apiKey || !config.billplz.collectionId) {
        throw new Error('Billplz is not configured. Add API key and Collection ID in Admin Settings.');
      }
      const bill = await billplzCreateBill(config.billplz, input);
      gatewayBillId = bill.billId;
      paymentUrl = bill.paymentUrl;

    } else if (gateway === 'ipay88') {
      if (!config.ipay88.merchantCode || !config.ipay88.merchantKey) {
        throw new Error('iPay88 is not configured. Add Merchant Code and Key in Admin Settings.');
      }
      const formParams = ipay88BuildFormParams(config.ipay88, input);
      gatewayBillId = input.referenceNumber; // iPay88 uses our RefNo as identifier
      const baseUrl = config.ipay88.sandboxMode
        ? 'https://sandbox.ipay88.com.my/ePayment/entry.asp'
        : 'https://payment.ipay88.com.my/ePayment/entry.asp';
      // Encode form params as query string for frontend to POST
      paymentUrl = `${baseUrl}?${new URLSearchParams(formParams).toString()}`;
    }

    // ── Record payment session with full audit trail ───────────────────────────
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

    const sessionResult = await db.query(
      `INSERT INTO payment_sessions (
        branch_id, reservation_id, gateway, method, amount, currency,
        status, gateway_bill_id, payment_url,
        customer_id, customer_name, customer_email, customer_phone,
        customer_ip, user_agent, browser_info,
        idempotency_key, initiated_at
      ) VALUES ($1,$2,$3,$4,$5,'MYR','initiated',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
      ON CONFLICT (idempotency_key) DO UPDATE
        SET status = payment_sessions.status
      RETURNING id`,
      [
        input.branchId,
        input.reservationId,
        gateway,
        input.method || (gateway === 'billplz' ? 'fpx' : 'card'),
        input.amount,
        gatewayBillId,
        paymentUrl,
        input.customerId,
        input.customerName,
        input.customerEmail,
        input.customerPhone,
        input.customerIp,
        input.userAgent,
        JSON.stringify(input.browserInfo),
        input.idempotencyKey,
      ]
    );

    // Update deposit_transaction with gateway info
    await db.query(
      `UPDATE deposit_transactions
       SET gateway = $1, gateway_bill_id = $2, payment_url = $3,
           customer_ip = $4, user_agent = $5, status = 'pending', updated_at = NOW()
       WHERE reservation_id = $6 AND is_refund = false`,
      [gateway, gatewayBillId, paymentUrl, input.customerIp, input.userAgent, input.reservationId]
    );

    logger.info({
      event: 'payment_initiated',
      gateway,
      reservation_id: input.reservationId,
      customer_id: input.customerId,
      customer_email: input.customerEmail,
      customer_ip: input.customerIp,
      amount: input.amount,
      gateway_bill_id: gatewayBillId,
    }, 'Payment session initiated');

    return {
      paymentSessionId: sessionResult.rows[0].id,
      paymentUrl,
      gatewayBillId,
      gateway,
      amount: input.amount,
      expiresAt,
    };
  }

  /**
   * Handle Billplz webhook callback.
   *
   * Verifies X-Signature, updates payment_session and deposit_transaction.
   * Called by POST /api/webhooks/billplz/callback
   */
  static async handleBillplzCallback(
    params: Record<string, string>
  ): Promise<WebhookVerifyResult> {
    const config = await loadGatewayConfig();

    // Verify signature
    const valid = billplzVerifySignature(params, config.billplz.xSignatureKey);
    if (!valid) {
      logger.warn({ params }, 'Billplz callback: invalid X-Signature');
      return { valid: false, paid: false, gatewayBillId: params['id'] || '', rawPayload: params };
    }

    const billId = params['id'];
    const paid = params['paid'] === 'true';
    const paidAt = params['paid_at'];
    const transactionId = params['transaction_id'] || '';

    await PaymentGatewayService._updateSessionFromCallback({
      gatewayBillId: billId,
      paid,
      gatewayRef: transactionId,
      paidAt: paidAt ? new Date(paidAt) : undefined,
      callbackPayload: params,
      failedReason: paid ? undefined : 'Payment not completed',
    });

    return {
      valid: true,
      paid,
      gatewayBillId: billId,
      gatewayRef: transactionId,
      rawPayload: params,
    };
  }

  /**
   * Handle iPay88 backend callback.
   *
   * Verifies SHA256 signature, updates payment_session and deposit_transaction.
   * Called by POST /api/webhooks/ipay88/callback
   */
  static async handleIpay88Callback(
    params: Record<string, string>
  ): Promise<WebhookVerifyResult> {
    const config = await loadGatewayConfig();

    const verifyParams = {
      MerchantCode: params['MerchantCode'] || '',
      PaymentId: params['PaymentId'] || '',
      RefNo: params['RefNo'] || '',
      Amount: params['Amount'] || '',
      Currency: params['Currency'] || 'MYR',
      Status: params['Status'] || '',
      Signature: params['Signature'] || '',
    };

    const valid = ipay88VerifySignature(config.ipay88.merchantKey, verifyParams);
    if (!valid) {
      logger.warn({ params }, 'iPay88 callback: invalid signature');
      return { valid: false, paid: false, gatewayBillId: params['RefNo'] || '', rawPayload: params };
    }

    const paid = params['Status'] === '1'; // 1 = success
    const refNo = params['RefNo'];
    const transactionId = params['TransId'] || '';

    await PaymentGatewayService._updateSessionFromCallback({
      gatewayBillId: refNo,
      paid,
      gatewayRef: transactionId,
      paidAt: paid ? new Date() : undefined,
      callbackPayload: params,
      failedReason: paid ? undefined : (params['ErrDesc'] || 'Payment failed'),
    });

    return {
      valid: true,
      paid,
      gatewayBillId: refNo,
      gatewayRef: transactionId,
      rawPayload: params,
    };
  }

  /**
   * Shared: update payment_session + deposit_transaction after callback.
   */
  private static async _updateSessionFromCallback(opts: {
    gatewayBillId: string;
    paid: boolean;
    gatewayRef?: string;
    paidAt?: Date;
    callbackPayload: Record<string, string>;
    failedReason?: string;
  }): Promise<void> {
    const db = getDatabase();
    const newStatus = opts.paid ? 'paid' : 'failed';

    // Update payment_session
    await db.query(
      `UPDATE payment_sessions
       SET status = $1,
           gateway_ref = $2,
           callback_at = NOW(),
           paid_at = $3,
           failed_at = $4,
           callback_payload = $5,
           updated_at = NOW()
       WHERE gateway_bill_id = $6`,
      [
        newStatus,
        opts.gatewayRef || null,
        opts.paid ? (opts.paidAt || new Date()) : null,
        opts.paid ? null : new Date(),
        JSON.stringify(opts.callbackPayload),
        opts.gatewayBillId,
      ]
    );

    // Update deposit_transaction
    const depositStatus = opts.paid ? 'confirmed' : 'failed';
    await db.query(
      `UPDATE deposit_transactions
       SET status = $1,
           gateway_ref = $2,
           paid_at = $3,
           failed_reason = $4,
           updated_at = NOW()
       WHERE gateway_bill_id = $5 AND is_refund = false`,
      [
        depositStatus,
        opts.gatewayRef || null,
        opts.paid ? (opts.paidAt || new Date()) : null,
        opts.failedReason || null,
        opts.gatewayBillId,
      ]
    );

    // If paid: update reservation deposit_paid amount
    if (opts.paid) {
      await db.query(
        `UPDATE reservations r
         SET deposit_paid = dt.amount + dt.decoration_amount,
             updated_at = NOW()
         FROM deposit_transactions dt
         WHERE dt.gateway_bill_id = $1
           AND dt.reservation_id = r.id
           AND dt.is_refund = false`,
        [opts.gatewayBillId]
      );
    }

    logger.info({
      event: opts.paid ? 'payment_confirmed' : 'payment_failed',
      gateway_bill_id: opts.gatewayBillId,
      gateway_ref: opts.gatewayRef,
      paid: opts.paid,
      failed_reason: opts.failedReason,
    }, `Payment ${opts.paid ? 'confirmed' : 'failed'} via gateway callback`);
  }

  /**
   * Get payment session status by reservation ID.
   */
  static async getPaymentStatus(reservationId: string): Promise<{
    status: string;
    gateway: string;
    amount: number;
    paidAt: Date | null;
    gatewayRef: string | null;
  } | null> {
    const db = getDatabase();
    const result = await db.query(
      `SELECT status, gateway, amount, paid_at, gateway_ref
       FROM payment_sessions
       WHERE reservation_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [reservationId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      status: row.status,
      gateway: row.gateway,
      amount: Number(row.amount),
      paidAt: row.paid_at,
      gatewayRef: row.gateway_ref,
    };
  }
}

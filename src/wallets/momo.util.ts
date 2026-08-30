import * as crypto from 'crypto';

export interface MomoCreatePaymentParams {
  amount: number;
  orderId: string;
  orderInfo: string;
  requestId: string;
  redirectUrl: string;
  ipnUrl: string;
  extraData?: string;
}

export interface MomoPaymentResponse {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  responseTime: number;
  message: string;
  resultCode: number;
  payUrl: string;
  shortLink?: string;
  qrCodeUrl?: string;
  deeplink?: string;
  signature: string;
}

export function getMomoCredentials() {
  const partnerCode = process.env.MOMO_PARTNER_CODE || 'MOMO';
  const accessKey = process.env.MOMO_ACCESS_KEY || 'F8BBA842ECF85';
  const secretKey = process.env.MOMO_SECRET_KEY || 'K951B6PE1wa8ngT4bik1BC7ungHuR8m1';
  const endpoint = process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create';
  const ipnUrl = process.env.MOMO_IPN_URL || 'https://muaban-backend.onrender.com/wallet/momo/ipn';

  return { partnerCode, accessKey, secretKey, endpoint, ipnUrl };
}

export function createMomoSignature(rawSignature: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');
}

export async function requestMomoPaymentUrl(params: MomoCreatePaymentParams): Promise<MomoPaymentResponse> {
  const { partnerCode, accessKey, secretKey, endpoint } = getMomoCredentials();
  const requestType = 'captureWallet';
  const extraData = params.extraData || '';

  // Order of fields for create signature in MoMo API v2:
  // accessKey=$accessKey&amount=$amount&extraData=$extraData&ipnUrl=$ipnUrl&orderId=$orderId&orderInfo=$orderInfo&partnerCode=$partnerCode&redirectUrl=$redirectUrl&requestId=$requestId&requestType=$requestType
  const rawSignature = `accessKey=${accessKey}&amount=${params.amount}&extraData=${extraData}&ipnUrl=${params.ipnUrl}&orderId=${params.orderId}&orderInfo=${params.orderInfo}&partnerCode=${partnerCode}&redirectUrl=${params.redirectUrl}&requestId=${params.requestId}&requestType=${requestType}`;
  const signature = createMomoSignature(rawSignature, secretKey);

  const requestBody = {
    partnerCode,
    partnerName: 'Sàn Đấu Giá Bazaar',
    storeId: 'BazaarStore',
    requestId: params.requestId,
    amount: params.amount,
    orderId: params.orderId,
    orderInfo: params.orderInfo,
    redirectUrl: params.redirectUrl,
    ipnUrl: params.ipnUrl,
    lang: 'vi',
    extraData,
    requestType,
    signature,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MoMo Gateway Error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as MomoPaymentResponse;
  return data;
}

export function verifyMomoReturnSignature(params: Record<string, any>): boolean {
  const { accessKey, secretKey, partnerCode } = getMomoCredentials();

  const rawPartnerCode = params['partnerCode'] || partnerCode;
  const orderId = params['orderId'] || '';
  const requestId = params['requestId'] || '';
  const amount = params['amount'] || '0';
  const orderInfo = params['orderInfo'] || '';
  const orderType = params['orderType'] || '';
  const transId = params['transId'] || '';
  const resultCode = params['resultCode'] ?? '';
  const message = params['message'] || '';
  const payType = params['payType'] || '';
  const responseTime = params['responseTime'] || '';
  const extraData = params['extraData'] || '';
  const receivedSignature = params['signature'] || '';

  // Order of fields for return signature in MoMo API v2:
  // accessKey=$accessKey&amount=$amount&extraData=$extraData&message=$message&orderId=$orderId&orderInfo=$orderInfo&orderType=$orderType&partnerCode=$partnerCode&payType=$payType&requestId=$requestId&responseTime=$responseTime&resultCode=$resultCode&transId=$transId
  const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${rawPartnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;
  const calculatedSignature = createMomoSignature(rawSignature, secretKey);

  return calculatedSignature.toLowerCase() === String(receivedSignature).toLowerCase();
}

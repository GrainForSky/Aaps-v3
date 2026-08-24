import { NextRequest, NextResponse } from 'next/server';
import { registerDevice, checkRateLimit } from '@/lib/store';
import { isValidPhone, isValidDeviceId } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, deviceId, appVersion } = body;

    // 参数验证
    if (!phone || !deviceId || !appVersion) {
      return NextResponse.json(
        { success: false, message: '缺少必填参数' },
        { status: 400 }
      );
    }

    if (!isValidPhone(phone)) {
      return NextResponse.json(
        { success: false, message: '手机号格式不正确' },
        { status: 400 }
      );
    }

    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json(
        { success: false, message: '设备ID格式不正确' },
        { status: 400 }
      );
    }

    // 速率限制：5次/分钟
    const rateLimitKey = `register:${phone}`;
    if (!checkRateLimit(rateLimitKey, 5, 60000)) {
      return NextResponse.json(
        { success: false, message: '请求过于频繁，请稍后再试' },
        { status: 429 }
      );
    }

    // 注册设备
    const result = registerDevice(phone, deviceId, appVersion);

    return NextResponse.json({
      success: true,
      message: result.message,
      deviceToken: result.deviceToken,
    });
  } catch (error) {
    console.error('Device register error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

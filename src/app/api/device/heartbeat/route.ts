import { NextRequest, NextResponse } from 'next/server';
import { updateHeartbeat, authenticateDevice } from '@/lib/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, deviceId, deviceToken } = body;

    if (!phone || !deviceId || !deviceToken) {
      return NextResponse.json(
        { success: false, message: '缺少必填参数' },
        { status: 400 }
      );
    }

    // 验证设备身份
    if (!authenticateDevice(phone, deviceId, deviceToken)) {
      return NextResponse.json(
        { success: false, message: '设备认证失败，请重新注册' },
        { status: 401 }
      );
    }

    // 更新心跳
    const success = updateHeartbeat(phone, deviceId, deviceToken);
    if (!success) {
      return NextResponse.json(
        { success: false, message: '心跳更新失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      status: 'online',
      lastHeartbeat: Date.now(),
    });
  } catch (error) {
    console.error('Device heartbeat error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

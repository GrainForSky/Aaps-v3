import { NextRequest, NextResponse } from 'next/server';
import { getPendingCommands, authenticateDevice } from '@/lib/store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const deviceId = searchParams.get('deviceId');
    const deviceToken = searchParams.get('deviceToken');

    if (!phone || !deviceId || !deviceToken) {
      return NextResponse.json(
        { success: false, message: '缺少必填参数' },
        { status: 400 }
      );
    }

    // 验证设备身份
    if (!authenticateDevice(phone, deviceId, deviceToken)) {
      return NextResponse.json(
        { success: false, message: '设备认证失败' },
        { status: 401 }
      );
    }

    // 获取待执行命令
    const commands = getPendingCommands(phone);

    return NextResponse.json({
      success: true,
      commands,
    });
  } catch (error) {
    console.error('Device commands error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

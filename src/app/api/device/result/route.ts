import { NextRequest, NextResponse } from 'next/server';
import { updateCommandStatus } from '@/lib/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { commandId, phone, deviceId, deviceToken, success, message } = body;

    if (!commandId || !phone || !deviceId || !deviceToken) {
      return NextResponse.json(
        { success: false, message: '缺少必填参数' },
        { status: 400 }
      );
    }

    // 更新命令状态
    const command = updateCommandStatus(
      commandId,
      phone,
      deviceId,
      deviceToken,
      success,
      message
    );

    if (!command) {
      return NextResponse.json(
        { success: false, message: '命令不存在或设备认证失败' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '结果上报成功',
      command,
    });
  } catch (error) {
    console.error('Report result error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

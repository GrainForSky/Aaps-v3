import { NextRequest, NextResponse } from 'next/server';
import { getDeviceStatus, getDevice, isAuthenticated } from '@/lib/store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const userPhone = request.headers.get('x-user-phone');

    if (!phone) {
      return NextResponse.json(
        { success: false, message: '缺少手机号参数' },
        { status: 400 }
      );
    }

    // 验证用户身份
    if (!userPhone || !isAuthenticated(userPhone)) {
      return NextResponse.json(
        { success: false, message: '未登录，请先登录' },
        { status: 401 }
      );
    }

    // 验证用户只能查询自己的设备
    if (userPhone !== phone) {
      return NextResponse.json(
        { success: false, message: '无权查询其他用户的设备状态' },
        { status: 403 }
      );
    }

    const status = getDeviceStatus(phone);
    const device = getDevice(phone);

    return NextResponse.json({
      success: true,
      phone,
      status,
      lastHeartbeat: device?.lastHeartbeat,
    });
  } catch (error) {
    console.error('Device status error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createCommand, isAuthenticated, checkRateLimit, getDevice } from '@/lib/store';
import { SAFETY_RULES } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, type, insulin, carbs } = body;
    const userPhone = request.headers.get('x-user-phone');

    // 验证用户登录
    if (!userPhone || !isAuthenticated(userPhone)) {
      return NextResponse.json(
        { success: false, commandId: '', message: '未登录，请先登录' },
        { status: 401 }
      );
    }

    // 验证用户只能操作自己的设备
    if (userPhone !== phone) {
      return NextResponse.json(
        { success: false, commandId: '', message: '无权操作其他用户的设备' },
        { status: 403 }
      );
    }

    // 参数验证
    if (!phone || !type) {
      return NextResponse.json(
        { success: false, commandId: '', message: '缺少必填参数' },
        { status: 400 }
      );
    }

    if (!['bolus', 'carbs'].includes(type)) {
      return NextResponse.json(
        { success: false, commandId: '', message: '命令类型无效' },
        { status: 400 }
      );
    }

    // 验证设备已注册
    const device = getDevice(phone);
    if (!device) {
      return NextResponse.json(
        { success: false, commandId: '', message: '设备未注册' },
        { status: 404 }
      );
    }

    // 剂量验证
    if (type === 'bolus') {
      if (!insulin || insulin <= 0 || insulin > SAFETY_RULES.MAX_BOLUS_UNITS) {
        return NextResponse.json(
          { success: false, commandId: '', message: `胰岛素剂量必须在 0-${SAFETY_RULES.MAX_BOLUS_UNITS}U 之间` },
          { status: 400 }
        );
      }
    } else if (type === 'carbs') {
      if (!carbs || carbs <= 0 || carbs > SAFETY_RULES.MAX_CARBS_GRAMS) {
        return NextResponse.json(
          { success: false, commandId: '', message: `碳水剂量必须在 0-${SAFETY_RULES.MAX_CARBS_GRAMS}g 之间` },
          { status: 400 }
        );
      }
    }

    // 速率限制
    const rateLimitKey = `command:${userPhone}`;
    if (!checkRateLimit(rateLimitKey, 10, 60000)) {
      return NextResponse.json(
        { success: false, commandId: '', message: '请求过于频繁，请稍后再试' },
        { status: 429 }
      );
    }

    // 创建命令
    const command = createCommand(phone, type, insulin, carbs);

    return NextResponse.json({
      success: true,
      commandId: command.id,
      message: '命令已创建，等待设备执行',
    });
  } catch (error) {
    console.error('Command create error:', error);
    return NextResponse.json(
      { success: false, commandId: '', message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

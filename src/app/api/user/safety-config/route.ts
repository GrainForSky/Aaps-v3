import { NextRequest, NextResponse } from 'next/server';
import { getSafetyConfig, saveSafetyConfig, isAuthenticated } from '@/lib/store';

// GET /api/user/safety-config - 获取当前用户的安全规则配置
export async function GET(request: NextRequest) {
  try {
    const userPhone = request.headers.get('x-user-phone');
    if (!userPhone || !isAuthenticated(userPhone)) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    const config = getSafetyConfig(userPhone);
    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('Get safety config error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// POST /api/user/safety-config - 保存当前用户的安全规则配置
export async function POST(request: NextRequest) {
  try {
    const userPhone = request.headers.get('x-user-phone');
    if (!userPhone || !isAuthenticated(userPhone)) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { maxBolusUnits, maxCarbsGrams, insulinLockMinutes, carbsLockMinutes, commandTimeoutMinutes } = body;

    // 参数验证
    if (typeof maxBolusUnits !== 'number' || maxBolusUnits < 1 || maxBolusUnits > 100) {
      return NextResponse.json(
        { success: false, message: '最大胰岛素剂量无效' },
        { status: 400 }
      );
    }
    if (typeof maxCarbsGrams !== 'number' || maxCarbsGrams < 1 || maxCarbsGrams > 500) {
      return NextResponse.json(
        { success: false, message: '最大碳水剂量无效' },
        { status: 400 }
      );
    }

    saveSafetyConfig(userPhone, {
      maxBolusUnits,
      maxCarbsGrams,
      insulinLockMinutes: insulinLockMinutes ?? 15,
      carbsLockMinutes: carbsLockMinutes ?? 1,
      commandTimeoutMinutes: commandTimeoutMinutes ?? 5,
    });

    return NextResponse.json({
      success: true,
      message: '安全规则已保存',
    });
  } catch (error) {
    console.error('Save safety config error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

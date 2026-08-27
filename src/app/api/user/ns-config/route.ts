import { NextRequest, NextResponse } from 'next/server';
import { getNsConfig, saveNsConfig, isAuthenticated } from '@/lib/store';

// GET /api/user/ns-config - 获取当前用户的 Nightscout 配置
export async function GET(request: NextRequest) {
  try {
    const userPhone = request.headers.get('x-user-phone');
    if (!userPhone || !isAuthenticated(userPhone)) {
      return NextResponse.json(
        { success: false, message: '未登录' },
        { status: 401 }
      );
    }

    const config = getNsConfig(userPhone);
    return NextResponse.json({
      success: true,
      data: { url: config.url, apiSecret: config.apiSecret },
    });
  } catch (error) {
    console.error('Get NS config error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// POST /api/user/ns-config - 保存当前用户的 Nightscout 配置
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
    const { url, apiSecret } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, message: 'URL 不能为空' },
        { status: 400 }
      );
    }

    saveNsConfig(userPhone, url, apiSecret || '');
    return NextResponse.json({
      success: true,
      message: 'Nightscout 配置已保存',
    });
  } catch (error) {
    console.error('Save NS config error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

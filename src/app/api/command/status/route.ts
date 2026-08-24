import { NextRequest, NextResponse } from 'next/server';
import { getCommand, isAuthenticated } from '@/lib/store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const phone = searchParams.get('phone');
    const userPhone = request.headers.get('x-user-phone');

    if (!id || !phone) {
      return NextResponse.json(
        { success: false, command: null, message: '缺少必填参数' },
        { status: 400 }
      );
    }

    // 验证用户登录
    if (!userPhone || !isAuthenticated(userPhone)) {
      return NextResponse.json(
        { success: false, command: null, message: '未登录，请先登录' },
        { status: 401 }
      );
    }

    // 验证用户只能查询自己的命令
    if (userPhone !== phone) {
      return NextResponse.json(
        { success: false, command: null, message: '无权查询其他用户的命令' },
        { status: 403 }
      );
    }

    const command = getCommand(id, phone);

    return NextResponse.json({
      success: true,
      command,
    });
  } catch (error) {
    console.error('Command status error:', error);
    return NextResponse.json(
      { success: false, command: null, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

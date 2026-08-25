import { NextRequest, NextResponse } from 'next/server';
import { loginUser, verifyUser, getUser, checkRateLimit } from '@/lib/store';
import { isValidPhone } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, pin } = body;

    if (!phone || !isValidPhone(phone)) {
      return NextResponse.json(
        { success: false, message: '请输入正确的手机号' },
        { status: 400 }
      );
    }

    if (!pin || pin.length < 4) {
      return NextResponse.json(
        { success: false, message: 'PIN 码至少 4 位' },
        { status: 400 }
      );
    }

    // 速率限制
    const rateLimitKey = `login:${phone}`;
    if (!checkRateLimit(rateLimitKey, 5, 60000)) {
      return NextResponse.json(
        { success: false, message: '请求过于频繁，请稍后再试' },
        { status: 429 }
      );
    }

    // 检查用户是否已注册（首次登录自动注册）
    const existingUser = getUser(phone);
    if (existingUser) {
      // 已有账户，验证 PIN
      if (!verifyUser(phone, pin)) {
        return NextResponse.json(
          { success: false, message: 'PIN 码错误' },
          { status: 401 }
        );
      }
      // PIN 正确，更新登录状态
      loginUser(phone, pin);
    } else {
      // 首次登录，自动创建账户
      loginUser(phone, pin);
    }

    return NextResponse.json({
      success: true,
      message: existingUser ? '登录成功' : '账户已创建，登录成功',
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

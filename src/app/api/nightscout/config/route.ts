import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, apiSecret } = body;

    if (!url || !apiSecret) {
      return NextResponse.json(
        { success: false, message: '缺少必填参数' },
        { status: 400 }
      );
    }

    // 测试 Nightscout 连接
    const baseUrl = url.replace(/\/$/, '');
    const headers: Record<string, string> = {
      'api-secret': apiSecret,
    };

    // 依次尝试多个端点
    const endpoints = [
      `${baseUrl}/api/v1/status.json`,
      `${baseUrl}/api/v1/entries.json?count=1`,
      `${baseUrl}/api/v1/treatments.json?count=1`,
    ];

    let connected = false;
    let lastError = '';

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          connected = true;
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : '未知错误';
      }
    }

    if (connected) {
      return NextResponse.json({
        success: true,
        message: 'Nightscout 连接成功',
      });
    }

    return NextResponse.json({
      success: false,
      message: `Nightscout 连接失败: ${lastError}`,
    });
  } catch (error) {
    console.error('Nightscout config error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const apiSecret = searchParams.get('apiSecret');
    const count = searchParams.get('count') || '288';

    if (!url || !apiSecret) {
      return NextResponse.json(
        { success: false, message: '缺少必填参数' },
        { status: 400 }
      );
    }

    const baseUrl = url.replace(/\/$/, '');
    const response = await fetch(
      `${baseUrl}/api/v1/entries.json?count=${count}`,
      {
        headers: { 'api-secret': apiSecret },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: `Nightscout 返回错误: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Nightscout entries error:', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, apiSecret } = body;

    if (!url || !apiSecret) {
      return NextResponse.json(
        { success: false, message: '缺少必填参数：url 和 apiSecret' },
        { status: 400 }
      );
    }

    // 规范化 URL
    let baseUrl = url.trim().replace(/\/+$/, '');
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }

    // Nightscout 需要 SHA1 哈希的 API Secret
    const hashedSecret = createHash('sha1').update(apiSecret).digest('hex');

    const headers: Record<string, string> = {
      'api-secret': hashedSecret,
      'Accept': 'application/json',
    };

    // 依次尝试多个端点
    const endpoints = [
      { url: `${baseUrl}/api/v1/status.json`, name: '状态接口' },
      { url: `${baseUrl}/api/v1/entries.json?count=1`, name: 'CGM 数据接口' },
      { url: `${baseUrl}/api/v1/treatments.json?count=1`, name: '治疗记录接口' },
      { url: `${baseUrl}/api/v2/authorization/verify`, name: '认证接口' },
    ];

    let connected = false;
    let lastError = '';
    let successEndpoint = '';

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, {
          headers,
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          connected = true;
          successEndpoint = endpoint.name;
          break;
        } else {
          lastError = `${endpoint.name}返回 ${response.status}`;
        }
      } catch (error) {
        lastError = `${endpoint.name}: ${error instanceof Error ? error.message : '未知错误'}`;
      }
    }

    if (connected) {
      return NextResponse.json({
        success: true,
        message: `Nightscout 连接成功（通过${successEndpoint}）`,
      });
    }

    return NextResponse.json({
      success: false,
      message: `Nightscout 连接失败。最后尝试的错误：${lastError}`,
      debug: {
        baseUrl,
        endpointsTested: endpoints.map(e => e.url),
      },
    });
  } catch (error) {
    console.error('Nightscout config error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: '服务器内部错误',
        error: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}

import { NextRequest } from 'next/server';

// next.config.ts의 /api rewrites는 SSE 스트림을 버퍼링해 이벤트가 브라우저까지 전달되지 않는다
// (연결은 열리지만 이벤트가 도착하지 않음). 이 엔드포인트만 별도 라우트로 빼서 백엔드 응답을
// 그대로(버퍼링 없이) 스트리밍한다. Next.js는 파일 기반 라우트를 rewrites보다 먼저 매칭하므로
// 이 파일이 next.config.ts의 일반 /api/:path* 규칙보다 우선한다.
export const dynamic = 'force-dynamic';

const BACKEND_ORIGIN = 'http://localhost:8080';

export async function GET(request: NextRequest) {
    const backendResponse = await fetch(`${BACKEND_ORIGIN}/api/notifications/stream`, {
        headers: {
            cookie: request.headers.get('cookie') ?? '',
        },
        // @ts-expect-error Node fetch 전용 옵션: undici가 응답을 버퍼링하지 않도록 명시
        duplex: 'half',
    });

    return new Response(backendResponse.body, {
        status: backendResponse.status,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}

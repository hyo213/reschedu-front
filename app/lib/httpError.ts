import axios from 'axios';

interface ErrorResponseBody {
    message?: string;
    [key: string]: unknown;
}

/**
 * axios 에러 응답 바디에서 서버가 보낸 메시지를 꺼낸다. 없으면 fallback을 반환한다.
 * 백엔드가 에러 바디로 { message } 객체를 보내는 게 기본이지만, 일부 엔드포인트는
 * 아직 순수 문자열을 그대로 보내기도 해서 두 형태를 모두 처리한다.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
    if (!axios.isAxiosError(error)) return fallback;

    const data = error.response?.data as ErrorResponseBody | string | undefined;
    if (typeof data === 'string') return data.trim() || fallback;
    return data?.message || fallback;
}

/** axios 에러의 HTTP status가 주어진 값과 일치하는지 확인한다. */
export function isErrorStatus(error: unknown, status: number): boolean {
    return axios.isAxiosError(error) && error.response?.status === status;
}

/** axios 에러 응답 바디를 그대로 꺼낸다(부가 필드까지 읽어야 할 때 사용). */
export function getErrorData<T = unknown>(error: unknown): T | undefined {
    if (!axios.isAxiosError(error)) return undefined;
    return error.response?.data as T | undefined;
}

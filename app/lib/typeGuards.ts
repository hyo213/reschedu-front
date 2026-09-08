/**
 * API 응답을 배열로 신뢰하고 바로 as 캐스팅하는 대신, 실제로 배열인지 최소한으로 검증한다.
 * 배열이 아니면(백엔드 응답 형태가 바뀌었거나 에러 바디가 섞여 온 경우) 빈 배열로 대체해
 * 이어지는 .filter/.find/.slice 호출이 조용히 크래시하지 않게 한다.
 */
export function asArray<T>(data: unknown): T[] {
    return Array.isArray(data) ? (data as T[]) : [];
}

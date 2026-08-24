'use client';

import { useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

// 로그인 토큰이 httpOnly 쿠키로 발급되므로, 모든 axios 요청이 쿠키를 함께 보내도록 전역 설정한다.
// (레이아웃에 마운트되는 이 모듈이 로드되는 시점에 한 번만 실행되면 되므로 컴포넌트 바깥에 둔다.)
axios.defaults.withCredentials = true;

export default function AxiosInterceptorProvider() {
    const router = useRouter();

    useEffect(() => {
        // 여러 API 호출이 동시에 401/403을 받아도 알림+이동은 단 한 번만 실행되도록 방지
        let sessionExpiredHandled = false;

        const interceptorId = axios.interceptors.response.use(
            (response) => {
                // 재로그인 후 정상 응답이 오면 다음 세션 만료도 다시 알릴 수 있도록 재무장
                sessionExpiredHandled = false;
                return response;
            },
            (error) => {
                const status = error?.response?.status;
                if ((status === 401 || status === 403) && !sessionExpiredHandled) {
                    sessionExpiredHandled = true;
                    sessionStorage.clear();
                    alert('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
                    router.push('/');
                }
                return Promise.reject(error);
            }
        );

        return () => {
            axios.interceptors.response.eject(interceptorId);
        };
    }, [router]);

    return null;
}

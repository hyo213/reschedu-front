'use client';

import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    try {
      const response = await axios.post('http://localhost:8080/api/members/login', {
        loginId,
        password,
      }, { withCredentials: true });

      // 🚨 accessToken은 더 이상 응답 바디로 내려오지 않는다 — 서버가 httpOnly 쿠키로 발급하므로
      // JS(sessionStorage)에서는 애초에 값을 읽을 수도, 저장할 수도 없다(XSS로부터 토큰 보호).
      sessionStorage.setItem('userName', response.data.name);
      sessionStorage.setItem('userRole', response.data.role);
      sessionStorage.setItem('academyId', response.data.academyId);
      sessionStorage.setItem('userUuid', response.data.uuid);

      router.push('/dashboard');

    } catch (error: any) {
      if (error.response && error.response.data) {
        setErrorMessage(error.response.data.message || '로그인에 실패했습니다.');
      } else {
        setErrorMessage('서버와 통신 중 오류가 발생했습니다.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4">
      <div className="w-full sm:max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl text-ink">ReschEdu</h1>
          <p className="text-ink-soft text-sm mt-1">학원 보강 관리 시스템에 로그인하세요</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6 bg-paper-raised border border-line rounded-lg p-8">
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-2">아이디 (이메일 또는 연락처)</label>
            <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full px-4 py-3 border border-line rounded-md focus:ring-2 focus:ring-accent/40 focus:border-accent outline-none text-ink bg-paper-raised"
                placeholder="이메일 주소 또는 휴대폰 번호 입력"
                required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-2">비밀번호</label>
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-line rounded-md focus:ring-2 focus:ring-accent/40 focus:border-accent outline-none text-ink bg-paper-raised"
                placeholder="••••••••"
                required
            />
          </div>

          {errorMessage && (
              <p className="text-danger text-sm font-medium">{errorMessage}</p>
          )}

          <button
              type="submit"
              className="w-full bg-accent hover:bg-accent-hover text-paper-raised font-semibold py-3 rounded-md transition duration-200"
          >
            로그인
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-ink-faint">처음이신가요? </span>
          <button
              onClick={() => router.push('/signup')}
              className="text-accent font-semibold hover:underline"
          >
            회원가입
          </button>
        </div>
      </div>
    </div>
  );
}

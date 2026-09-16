'use client';

import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from './lib/httpError';

type DemoRole = 'ADMIN' | 'TEACHER' | 'PARENT';

const DEMO_ROLE_LABEL: Record<DemoRole, string> = {
  ADMIN: '원장으로 체험하기',
  TEACHER: '강사로 체험하기',
  PARENT: '학부모로 체험하기',
};

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [demoLoadingRole, setDemoLoadingRole] = useState<DemoRole | null>(null);

  const applyLoginResponse = (data: { name: string; role: string; academyId: number; uuid: string }) => {
    // accessToken은 httpOnly 쿠키로만 발급되어 JS에서 접근 불가 — sessionStorage엔 표시용 값만 저장
    sessionStorage.setItem('userName', data.name);
    sessionStorage.setItem('userRole', data.role);
    sessionStorage.setItem('academyId', String(data.academyId));
    sessionStorage.setItem('userUuid', data.uuid);
    router.push('/dashboard');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    try {
      const response = await axios.post('/api/members/login', {
        loginId,
        password,
      }, { withCredentials: true });

      applyLoginResponse(response.data);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '로그인에 실패했습니다.'));
    }
  };

  const handleDemoLogin = async (role: DemoRole) => {
    setErrorMessage('');
    setDemoLoadingRole(role);

    try {
      const response = await axios.post('/api/members/demo-login', { role }, { withCredentials: true });
      applyLoginResponse(response.data);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '체험 로그인에 실패했습니다.'));
    } finally {
      setDemoLoadingRole(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4">
      <div className="w-full sm:max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl text-ink">ReschEdu</h1>
          <p className="text-ink-soft text-sm mt-1">학원 보강 관리 시스템에 로그인하세요</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6 bg-paper-raised border border-line rounded-lg p-8" suppressHydrationWarning>
          <div>
            <label htmlFor="loginId" className="block text-sm font-medium text-ink-soft mb-2">아이디 (이메일 또는 연락처)</label>
            <input
                id="loginId"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full px-4 py-3 border border-line rounded-md focus:ring-2 focus:ring-accent/40 focus:border-accent outline-none text-ink bg-paper-raised"
                placeholder="이메일 주소 또는 휴대폰 번호 입력"
                required
                suppressHydrationWarning
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink-soft mb-2">비밀번호</label>
            <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-line rounded-md focus:ring-2 focus:ring-accent/40 focus:border-accent outline-none text-ink bg-paper-raised"
                placeholder="••••••••"
                required
                suppressHydrationWarning
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

        <div className="mt-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="text-xs text-ink-faint">아이디 없이 둘러보기</span>
            <div className="h-px flex-1 bg-line" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(Object.keys(DEMO_ROLE_LABEL) as DemoRole[]).map((role) => (
                <button
                    key={role}
                    type="button"
                    onClick={() => handleDemoLogin(role)}
                    disabled={demoLoadingRole !== null}
                    className="px-2 py-2.5 text-sm border border-line rounded-md text-ink-soft hover:border-accent hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {demoLoadingRole === role ? '접속 중...' : DEMO_ROLE_LABEL[role]}
                </button>
            ))}
          </div>
        </div>

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

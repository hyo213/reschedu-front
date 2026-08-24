'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import axios from 'axios';

// 대기 인원 계산을 위한 회원 객체 타입 명세
interface MemberData {
    uuid: string;
    isApproved: boolean;
}

interface CommonMenuBarProps {
    children: ReactNode; // 각 페이지의 알맹이 본문 내용이 이 자리로 전달됩니다.
}

export default function CommonMenuBar({ children }: CommonMenuBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [userName, setUserName] = useState('');
    const [userRole, setUserRole] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // ⏳ 가입 승인 대기 카운트 상태값
    const [pendingTeacherCount, setPendingTeacherCount] = useState<number>(0);
    const [pendingStudentCount, setPendingStudentCount] = useState<number>(0);
    // ⏳ 보강 신청 대기 카운트 (원장/강사 전용)
    const [pendingMakeupRequestCount, setPendingMakeupRequestCount] = useState<number>(0);

    useEffect(() => {
        const name = sessionStorage.getItem('userName');
        const role = sessionStorage.getItem('userRole');

        // 🚨 accessToken은 httpOnly 쿠키로만 존재하므로 JS에서는 값을 확인할 수 없다.
        // 여기서는 UI 표시용 정보만 확인하고, 실제 인증 여부는 각 API 호출이 401/403을 받으면
        // AxiosInterceptorProvider가 감지해 로그인 페이지로 돌려보낸다.
        if (!name || !role) {
            router.push('/');
            return;
        }

        setUserName(name);
        setUserRole(role);
        setIsLoading(false);

        // 권한별 대기자 카운트 세팅
        if (role === 'ADMIN') {
            fetchPendingTeachersCount();
            fetchPendingStudentsCount(role);
        }
        if (role === 'TEACHER') {
            fetchPendingStudentsCount(role);
        }
        if (role === 'ADMIN' || role === 'TEACHER') {
            fetchPendingMakeupRequestCount();
        }
    }, [router, pathname]); // 페이지를 이동할 때마다 메뉴바의 배지 숫자가 자동으로 갱신됩니다.

    // 🔄 백엔드 강사 목록 API 호출 및 대기자 카운트 연산
    const fetchPendingTeachersCount = async () => {
        try {
            const academyId = sessionStorage.getItem('academyId');

            const response = await axios.get(`http://localhost:8080/api/members/teachers?academyId=${academyId}`);

            const pendingList = response.data.filter((teacher: MemberData) => !teacher.isApproved);
            setPendingTeacherCount(pendingList.length);
        } catch (error) {
            console.error('메뉴바 강사 카운트 로딩 실패:', error);
        }
    };

    // 🔄 백엔드 수강생 목록 API 호출 (🚨 보안 원칙에 맞춘 UUID 식별자 기반 필터링 완벽 싱크 적용)
    const fetchPendingStudentsCount = async (role: string) => {
        try {
            const academyId = sessionStorage.getItem('academyId');

            // 🚨 [수정] 외부 식별자 원칙에 맞게 userUuid를 스토리지에서 꺼내옵니다.
            const teacherUuid = sessionStorage.getItem('userUuid');

            let url = `http://localhost:8080/api/members/students?academyId=${academyId}`;

            // 🚨 [수정] 강사 로그인 상태이고 UUID 식별자가 안전하게 존재할 때만 teacherUuid 파라미터 결합
            if (role === 'TEACHER' && teacherUuid && teacherUuid.trim() !== '') {
                url += `&teacherUuid=${teacherUuid}`;
            }

            const response = await axios.get(url);

            const pendingList = response.data.filter((student: MemberData) => !student.isApproved);
            setPendingStudentCount(pendingList.length);
        } catch (error) {
            console.error('메뉴바 수강생 카운트 로딩 실패:', error);
        }
    };

    // 🔄 보강 매칭 센터 메뉴 배지용: 대기 중인 보강 신청 개수
    const fetchPendingMakeupRequestCount = async () => {
        try {
            const academyId = sessionStorage.getItem('academyId');
            const response = await axios.get(`http://localhost:8080/api/makeup-requests/pending?academyId=${academyId}`);
            setPendingMakeupRequestCount(response.data.length);
        } catch (error) {
            console.error('메뉴바 보강 신청 대기 카운트 로딩 실패:', error);
        }
    };

    const handleLogout = async () => {
        try {
            // 쿠키(httpOnly access_token)를 함께 보내야 서버가 어떤 토큰을 만료시킬지 알 수 있고,
            // 로그아웃 응답의 Set-Cookie로 만료된 쿠키를 내려받아야 브라우저에서 실제로 삭제된다.
            await fetch('http://localhost:8080/api/members/logout', {
                method: 'POST',
                credentials: 'include',
            });
        } catch (error) {
            console.error('로그아웃 API 호출 오류:', error);
        } finally {
            sessionStorage.clear();
            router.replace('/');
        }
    };

    const getRoleLabel = (role: string) => {
        if (role === 'ADMIN') return '원장님';
        if (role === 'TEACHER') return '선생님';
        return '학생';
    };

    const getWelcomeMessage = (name: string, role: string) => {
        if (role === 'ADMIN') return `${name} 원장님`;
        if (role === 'TEACHER') return `${name} 선생님`;
        return `${name}님`;
    };

    const shouldShowMenu = (allowedRoles: string[]) => {
        return allowedRoles.includes(userRole);
    };

    // 현재 활성화된 메뉴 하이라이트 스타일 유틸
    const getMenuClass = (targetPath: string) => {
        const baseClass = "w-full flex items-center justify-between px-4 py-3 text-sm font-semibold rounded-md transition text-left ";
        return pathname === targetPath
            ? baseClass + "bg-accent text-paper-raised"
            : baseClass + "text-ink-soft hover:bg-line-soft";
    };

    if (isLoading) {
        return <div className="min-h-screen bg-paper" />;
    }

    const NavigationLinks = () => (
        <nav className="space-y-1.5">
            {shouldShowMenu(['ADMIN']) && (
                <button
                    onClick={() => { router.push('/dashboard/teachers'); setIsMobileMenuOpen(false); }}
                    className={getMenuClass('/dashboard/teachers')}
                >
                    <div className="flex items-center gap-3">
                        <span>👨‍🏫</span> 강사 관리
                    </div>
                    {pendingTeacherCount > 0 && (
                        <span className={`${pathname === '/dashboard/teachers' ? 'bg-paper-raised text-accent' : 'bg-warning text-paper-raised'} text-[11px] font-bold px-2 py-0.5 rounded-full animate-bounce`}>
                            {pendingTeacherCount}
                        </span>
                    )}
                </button>
            )}
            {shouldShowMenu(['ADMIN', 'TEACHER']) && (
                <button
                    onClick={() => { router.push('/dashboard/students'); setIsMobileMenuOpen(false); }}
                    className={getMenuClass('/dashboard/students')}
                >
                    <div className="flex items-center gap-3">
                        <span>🎒</span> 수강생 관리
                    </div>
                    {pendingStudentCount > 0 && (
                        <span className={`${pathname === '/dashboard/students' ? 'bg-paper-raised text-accent' : 'bg-warning text-paper-raised'} text-[11px] font-bold px-2 py-0.5 rounded-full animate-bounce`}>
                            {pendingStudentCount}
                        </span>
                    )}
                </button>
            )}
            {shouldShowMenu(['ADMIN', 'TEACHER', 'PARENT']) && (
                <button
                    onClick={() => { router.push('/dashboard/regular-classes'); setIsMobileMenuOpen(false); }}
                    className={getMenuClass('/dashboard/regular-classes')}
                >
                    <div className="flex items-center gap-3">
                        <span>🏫</span> {userRole === 'PARENT' ? '자녀 시간표 조회' : '정규 수업 관리'}
                    </div>
                </button>
            )}
            {shouldShowMenu(['ADMIN', 'TEACHER', 'PARENT']) && (
                <button
                    onClick={() => { router.push('/dashboard/notices'); setIsMobileMenuOpen(false); }}
                    className={getMenuClass('/dashboard/notices')}
                >
                    <div className="flex items-center gap-3">
                        <span>📢</span> 공지사항
                    </div>
                </button>
            )}
            {shouldShowMenu(['ADMIN', 'TEACHER']) && (
                <button
                    onClick={() => { router.push('/dashboard/makeup-center'); setIsMobileMenuOpen(false); }}
                    className={getMenuClass('/dashboard/makeup-center')}
                >
                    <div className="flex items-center gap-3">
                        <span>🎟️</span> 보강권 관리
                    </div>
                    {pendingMakeupRequestCount > 0 && (
                        <span className={`${pathname === '/dashboard/makeup-center' ? 'bg-paper-raised text-accent' : 'bg-warning text-paper-raised'} text-[11px] font-bold px-2 py-0.5 rounded-full animate-bounce`}>
                            {pendingMakeupRequestCount}
                        </span>
                    )}
                </button>
            )}
            {shouldShowMenu(['ADMIN', 'TEACHER']) && (
                <button
                    onClick={() => { router.push('/dashboard/makeup-match'); setIsMobileMenuOpen(false); }}
                    className={getMenuClass('/dashboard/makeup-match')}
                >
                    <div className="flex items-center gap-3">
                        <span>🧩</span> 보강 매칭
                    </div>
                </button>
            )}
            {shouldShowMenu(['PARENT']) && (
                <button
                    onClick={() => { router.push('/dashboard/makeup-apply'); setIsMobileMenuOpen(false); }}
                    className={getMenuClass('/dashboard/makeup-apply')}
                >
                    <div className="flex items-center gap-3">
                        <span>📝</span> 보강 신청
                    </div>
                </button>
            )}
        </nav>
    );

    return (
        <div className="min-h-screen bg-paper flex w-full">
            {/* 💻 PC 레이아웃 사이드바 */}
            <aside className="hidden sm:flex flex-col justify-between w-64 bg-paper-raised border-r border-line h-screen sticky top-0 p-6">
                <div className="space-y-6">
                    <h2 onClick={() => router.push('/dashboard')} className="font-display text-xl text-accent tracking-tight px-4 cursor-pointer">ReschEdu</h2>
                    <NavigationLinks />
                </div>
                <div className="border-t border-line-soft pt-4">
                    <button
                        onClick={() => router.push('/dashboard/my-profile')}
                        className={getMenuClass('/dashboard/my-profile')}
                    >
                        <div className="flex items-center gap-3">
                            <span>⚙️</span> 내 계정 정보 설정
                        </div>
                    </button>
                </div>
            </aside>

            {/* 📱 모바일 메뉴 서랍 레이아웃 */}
            {isMobileMenuOpen && (
                <div className="sm:hidden fixed inset-0 z-50 bg-paper-raised w-full h-full p-6 flex flex-col justify-between animate-fade-in">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 onClick={() => { router.push('/dashboard'); setIsMobileMenuOpen(false); }} className="font-display text-xl text-accent tracking-tight cursor-pointer">ReschEdu</h2>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="text-ink-faint hover:text-ink p-1">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                        <NavigationLinks />
                    </div>
                    <div className="border-t border-line-soft pt-4">
                        <button
                            onClick={() => { router.push('/dashboard/my-profile'); setIsMobileMenuOpen(false); }}
                            className={getMenuClass('/dashboard/my-profile')}
                        >
                            <div className="flex items-center gap-3">
                                <span>⚙️</span> 내 계정 정보 설정
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* 메인 우측 콘텐츠 영역 외부 박스 */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="bg-paper-raised border-b border-line px-4 sm:px-6 h-16 flex justify-between items-center sticky top-0 z-40">
                    <div className="flex items-center gap-3.5 h-full">
                        <button onClick={() => setIsMobileMenuOpen(true)} className="sm:hidden text-ink-soft hover:text-ink focus:outline-none p-1.5 rounded-md hover:bg-line-soft flex items-center justify-center transition">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                        </button>
                        <span className="bg-accent-soft text-accent text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex items-center justify-center leading-none">
                            {getRoleLabel(userRole)}
                        </span>
                    </div>

                    <div className="flex items-center gap-4 h-full">
                        <span className="text-sm font-medium text-ink-soft whitespace-nowrap flex items-center leading-none">
                            <strong className="text-ink font-bold mr-1">{getWelcomeMessage(userName, userRole)}</strong> 환영합니다
                        </span>
                        <button onClick={handleLogout} className="inline-flex text-xs font-semibold text-ink-faint hover:text-danger border border-line rounded-md px-3 py-1.5 hover:border-danger/40 transition whitespace-nowrap items-center justify-center leading-none">
                            로그아웃
                        </button>
                    </div>
                </header>

                {/* 💡 개별 페이지들의 알맹이 코드가 이 아래 자리에 정갈하게 렌더링됩니다. */}
                <div className="flex-1 w-full overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
}
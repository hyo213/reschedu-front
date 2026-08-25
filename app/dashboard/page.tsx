'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import CommonMenuBar from './components/commonMenuBar';

interface ApprovableItem {
    isApproved: boolean;
}

interface NoticeSummary {
    uuid: string;
    academyId: number;
    academyName: string;
    title: string;
    createdAt: string;
}

interface NextClassItem {
    classUuid: string;
    title: string | null;
    teacherName: string;
    roomNumber: string | null;
    date: string;
    startTime: string;
    endTime: string;
    currentCount: number;
    maxCapacity: number;
    studentNames: string[];
}

export default function DashboardPage() {
    const router = useRouter();
    const [myRole, setMyRole] = useState<string>('');

    const [pendingStudentCount, setPendingStudentCount] = useState<number>(0);
    const [pendingTeacherCount, setPendingTeacherCount] = useState<number>(0);
    const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);

    // 최신순 최대 3건만 미리보기로 노출
    const [recentNotices, setRecentNotices] = useState<NoticeSummary[]>([]);

    const [nextClass, setNextClass] = useState<NextClassItem | null>(null);
    const [isLoadingNextClass, setIsLoadingNextClass] = useState(false);

    useEffect(() => {
        const role = sessionStorage.getItem('userRole') || '';
        setMyRole(role);

        if (role === 'ADMIN' || role === 'TEACHER') {
            fetchPendingApprovals(role);
        }
        fetchNextClass(role);
        fetchRecentNotices(role);
    }, []);

    // 학부모는 자녀가 다니는 모든 학원의 공지를 통합해서 받아온다.
    const fetchRecentNotices = async (role: string) => {
        try {
            const url = role === 'PARENT'
                ? 'http://localhost:8080/api/notices/my-children-active'
                : `http://localhost:8080/api/notices/active?academyId=${sessionStorage.getItem('academyId')}`;
            const res = await axios.get(url);
            setRecentNotices((res.data as NoticeSummary[]).slice(0, 3));
        } catch (error) {
            console.error('대시보드 공지사항 조회 실패:', error);
        }
    };

    const fetchNextClass = async (role: string) => {
        setIsLoadingNextClass(true);
        try {
            let url: string;

            if (role === 'PARENT') {
                url = 'http://localhost:8080/api/regular-classes/my-children/next';
            } else {
                const academyId = sessionStorage.getItem('academyId');
                const teacherUuid = sessionStorage.getItem('userUuid');
                url = `http://localhost:8080/api/regular-classes/next?academyId=${academyId}`;
                if (role === 'TEACHER' && teacherUuid && teacherUuid.trim() !== '') {
                    url += `&teacherUuid=${teacherUuid}`;
                }
            }

            const res = await axios.get(url);
            setNextClass(res.data);
        } catch (error) {
            console.error('다음 수업 조회 실패:', error);
        } finally {
            setIsLoadingNextClass(false);
        }
    };

    // 원장은 수강생+강사, 강사는 본인 담당 수강생만 승인 대기 카운트 조회
    const fetchPendingApprovals = async (role: string) => {
        setIsLoadingAlerts(true);
        try {
            const academyId = sessionStorage.getItem('academyId');
            const teacherUuid = sessionStorage.getItem('userUuid');

            let studentsUrl = `http://localhost:8080/api/members/students?academyId=${academyId}`;
            if (role === 'TEACHER' && teacherUuid && teacherUuid.trim() !== '') {
                studentsUrl += `&teacherUuid=${teacherUuid}`;
            }

            const requests = [axios.get(studentsUrl)];
            if (role === 'ADMIN') {
                requests.push(axios.get(`http://localhost:8080/api/members/teachers?academyId=${academyId}`));
            }

            const [studentsRes, teachersRes] = await Promise.all(requests);

            const pendingStudents = (studentsRes.data as ApprovableItem[]).filter((s) => !s.isApproved).length;
            setPendingStudentCount(pendingStudents);

            if (teachersRes) {
                const pendingTeachers = (teachersRes.data as ApprovableItem[]).filter((t) => !t.isApproved).length;
                setPendingTeacherCount(pendingTeachers);
            }
        } catch (error) {
            console.error('대시보드 승인 대기 알림 로딩 실패:', error);
        } finally {
            setIsLoadingAlerts(false);
        }
    };

    return (
        <CommonMenuBar>
            <main className="p-6 max-w-7xl w-full mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">

                <div className="bg-paper-raised p-6 rounded-lg border border-line shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-ink mb-2">📅 다음 수업</h3>
                        <p className="text-ink-faint text-sm mb-4">
                            {myRole === 'PARENT' ? '자녀에게 가장 가까운 다가오는 수업 정보입니다.' : '현재 배정된 정규 수업 중 가장 가까운 회차입니다.'}
                        </p>

                        {isLoadingNextClass ? (
                            <div className="p-4 bg-line-soft rounded-lg text-center text-xs text-ink-faint font-medium mb-4">불러오는 중..</div>
                        ) : !nextClass ? (
                            <div className="p-4 bg-line-soft rounded-lg text-center text-xs text-ink-faint font-medium mb-4">
                                예정된 수업이 없습니다.
                            </div>
                        ) : (
                            <div className="p-4 bg-accent-soft/50 border border-accent-soft rounded-lg mb-4">
                                {nextClass.title && (
                                    <span className="text-xs font-bold text-accent bg-accent-soft/80 px-2 py-0.5 rounded mb-2 inline-block">
                                        {nextClass.title}
                                    </span>
                                )}
                                <div className="text-ink font-semibold text-sm tracking-wide">
                                    🕒 {nextClass.date} {nextClass.startTime.slice(0, 5)}~{nextClass.endTime.slice(0, 5)}
                                </div>
                                <div className="text-ink-faint text-xs mt-1 font-medium">
                                    {nextClass.teacherName} 선생님{nextClass.roomNumber && ` · ${nextClass.roomNumber}`}
                                </div>
                                <div className="text-ink-soft text-xs mt-1 font-medium mb-2">
                                    👥 정원 {nextClass.currentCount}/{nextClass.maxCapacity}명
                                </div>

                                {nextClass.studentNames.length > 0 && (
                                    <div className="mt-3 pt-2.5 border-t border-accent-soft/70">
                                        <div className="text-[11px] font-bold text-accent mb-1.5">수강생 목록</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {nextClass.studentNames.map((student, idx) => (
                                                <span key={idx} className="bg-paper-raised border border-accent-soft text-ink-soft text-[11px] px-2 py-0.5 rounded-md font-medium shadow-sm">
                                                    {student}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => router.push('/dashboard/regular-classes')}
                        className="w-full text-center text-sm font-semibold text-accent bg-accent-soft hover:bg-accent-soft py-2.5 rounded-lg transition mt-4"
                    >
                        전체 스케줄 조회
                    </button>
                </div>

                <div className="bg-paper-raised p-6 rounded-lg border border-line shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-ink mb-2">💼 원내 명부 / 신청 Center</h3>
                        <p className="text-ink-faint text-sm mb-4">
                            {myRole === 'PARENT'
                                ? '소속 학원 정보 및 자녀의 인적 사항을 확인합니다.'
                                : '등록된 원생 인적 사항 및 가입 요청을 관리합니다.'}
                        </p>

                        {myRole !== 'PARENT' ? (
                            <div className="space-y-2.5">
                                <div className="p-3.5 border border-line-soft rounded-lg hover:bg-line-soft transition cursor-pointer flex justify-between items-center shadow-sm"
                                     onClick={() => router.push('/dashboard/students')}>
                                    <span className="text-xs font-bold text-ink-soft">🎒 소속 수강생 명부 관리</span>
                                    <span className="text-ink-faint text-xs">&gt;</span>
                                </div>
                                <div className="p-3.5 border border-line-soft rounded-lg hover:bg-line-soft transition cursor-pointer flex justify-between items-center shadow-sm"
                                     onClick={() => router.push('/dashboard/students')}>
                                    <span className="text-xs font-bold text-success">➕ 신규 수강생 직접 등록</span>
                                    <span className="text-success text-xs">&gt;</span>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-line-soft rounded-lg text-center text-xs text-ink-faint font-medium">
                                현재 연동된 정식 학원 멤버십 허가가 활성화되어 있습니다.
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => myRole !== 'PARENT' ? router.push('/dashboard/students') : null}
                        className="w-full text-center text-sm font-semibold text-paper-raised bg-accent hover:bg-accent-hover py-2.5 rounded-lg transition mt-4"
                    >
                        {myRole === 'PARENT' ? '학원 연동 현황 확인' : '수강생 명부 진입'}
                    </button>
                </div>

                <div className="bg-paper-raised p-6 rounded-lg border border-line shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-ink mb-2">🔔 주요 알림</h3>
                        <p className="text-ink-faint text-sm mb-4">학원 시스템 공지 및 개인 알림 사항입니다.</p>

                        <div className="space-y-3">
                            {recentNotices.map((notice) => (
                                <div
                                    key={notice.uuid}
                                    onClick={() => router.push(`/dashboard/notices/${notice.uuid}?academyId=${notice.academyId}`)}
                                    className="text-xs p-3.5 bg-accent-soft/40 text-ink border border-accent-soft rounded-lg font-medium flex items-center justify-between gap-2 cursor-pointer hover:bg-accent-soft/60 transition"
                                >
                                    <span className="flex items-center gap-2 truncate">
                                        📢 <span className="font-semibold truncate">
                                            {myRole === 'PARENT' && `(${notice.academyName}) `}{notice.title}
                                        </span>
                                    </span>
                                    <span className="text-ink-faint shrink-0">&gt;</span>
                                </div>
                            ))}

                            {(myRole === 'ADMIN' || myRole === 'TEACHER') && !isLoadingAlerts && pendingStudentCount > 0 && (
                                <div
                                    onClick={() => router.push('/dashboard/students')}
                                    className="text-xs p-3.5 bg-warning-soft text-warning border border-warning-soft rounded-lg font-semibold flex items-center justify-between gap-2 cursor-pointer hover:bg-warning-soft transition animate-pulse"
                                >
                                    <span className="flex items-center gap-2">⏳ 수강생 가입 승인 대기 중인 원생이 <strong>{pendingStudentCount}명</strong> 있습니다</span>
                                    <span className="text-warning">&gt;</span>
                                </div>
                            )}

                            {myRole === 'ADMIN' && !isLoadingAlerts && pendingTeacherCount > 0 && (
                                <div
                                    onClick={() => router.push('/dashboard/teachers')}
                                    className="text-xs p-3.5 bg-warning-soft text-warning border border-warning-soft rounded-lg font-semibold flex items-center justify-between gap-2 cursor-pointer hover:bg-warning-soft transition animate-pulse"
                                >
                                    <span className="flex items-center gap-2">⏳ 가입 승인 대기 중인 강사가 <strong>{pendingTeacherCount}명</strong> 있습니다</span>
                                    <span className="text-warning">&gt;</span>
                                </div>
                            )}

                            {recentNotices.length === 0 && (myRole === 'PARENT' || isLoadingAlerts || (pendingStudentCount === 0 && pendingTeacherCount === 0)) && (
                                <div className="text-xs p-3.5 bg-line-soft text-ink-faint rounded-lg font-medium text-center">
                                    표시할 알림이 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => router.push('/dashboard/notices')}
                        className="w-full text-center text-sm font-semibold text-ink-soft bg-line-soft hover:bg-line-soft py-2.5 rounded-lg transition mt-4"
                    >
                        알림 전체보기
                    </button>
                </div>

            </main>
        </CommonMenuBar>
    );
}
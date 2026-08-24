'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import CommonMenuBar from '../components/commonMenuBar';

interface ScheduleSummary {
    dayOfWeek: string;
    startTime: string;
}

interface StudentMember {
    uuid: string;         // 수강생(Student)의 고유 고유 식별자 UUID
    name: string;         // 학생 본명
    managementName: string; // 원 내에서 식별하기 위한 관리용 이름
    birthDate: string;    // 생년월일
    gender: string;       // 성별 (MALE / FEMALE)
    phone: string;        // 학생 본인 연락처
    parentPhone: string;  // 학부모(Member)의 공통 연락처 (phone 필드 매핑)
    shuttlePickupLocation: string;
    shuttleDropoffLocation: string;
    isApproved: boolean;  // 🚨 계정(학부모)의 승인 상태와 원생 등록 매핑 상태 결합
    // 🎯 수강 기간(수강료 납부 기간) — 이 화면에서 직접 관리
    enrollmentStartDate: string | null;
    enrollmentEndDate: string | null;
    paidForUpcomingMonth: boolean;
    expired: boolean;
    // 🎯 오늘 기준 활성 반 배정 요약 (예: 월3수4금5 형태로 압축 표시)
    schedules: ScheduleSummary[];
    // 🎯 주당 희망 수강 횟수 — schedules(실제 배정 개수)와 다를 수 있어 목록에서 바로 비교할 수 있게 노출
    weeklyFrequency: number | null;
}

const DAY_LABELS: Record<string, string> = {
    MONDAY: '월', TUESDAY: '화', WEDNESDAY: '수', THURSDAY: '목',
    FRIDAY: '금', SATURDAY: '토', SUNDAY: '일',
};
const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

// 24시간제 시각을 학원에서 흔히 쓰는 표현("오후 3시" → "3")으로 압축한다.
function formatHour(startTime: string): string {
    const hour = parseInt(startTime.slice(0, 2), 10);
    const compact = hour % 12 === 0 ? 12 : hour % 12;
    return String(compact);
}

// 학생의 활성 반 배정들을 요일 순서로 펼쳐 "월3수4금5" 형태의 압축 문자열로 만든다.
function formatScheduleSummary(schedules: ScheduleSummary[]): string {
    if (!schedules || schedules.length === 0) return '미배정';

    const sorted = [...schedules].sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek));
    return sorted.map((s) => `${DAY_LABELS[s.dayOfWeek] || s.dayOfWeek}${formatHour(s.startTime)}`).join('');
}

// 🎯 희망 주당 횟수(weeklyFrequency)와 실제 배정된 반 개수(schedules.length)가 다르면 눈에 띄게 표시한다.
function formatWeeklyFrequencyBadge(student: StudentMember): { label: string; mismatch: boolean } | null {
    if (student.weeklyFrequency == null) return null;
    const assignedCount = student.schedules?.length || 0;
    return {
        label: `주${student.weeklyFrequency}회 희망 (배정 ${assignedCount}개)`,
        mismatch: assignedCount !== student.weeklyFrequency,
    };
}

type PaymentBadge = { label: string; className: string };

function getPaymentBadge(student: StudentMember): PaymentBadge {
    if (!student.enrollmentEndDate) {
        return { label: '기간 미설정', className: 'bg-line-soft text-ink-faint' };
    }
    if (student.expired) {
        return { label: '수강기간 만료', className: 'bg-line text-ink-soft' };
    }
    if (!student.paidForUpcomingMonth) {
        return { label: '미결제', className: 'bg-danger-soft text-danger' };
    }
    return { label: '결제완료', className: 'bg-success-soft text-success' };
}

interface TeacherOption {
    uuid: string;
    name: string;
}

// 🎯 원장/강사가 수강생을 오프라인 회원가입 절차 없이 즉시 승인 완료 상태로 등록하는 폼의 초기값
const initialManualForm = {
    parentName: '',
    parentPhone: '',
    temporaryPassword: '',
    name: '',
    birthDate: '',
    gender: 'MALE',
    childPhone: '',
    managementName: '',
    teacherUuid: '',
    schoolName: '',
    shuttlePickupLocation: '',
    shuttleDropoffLocation: '',
    discountType: '',
    memo: '',
    enrollmentStartDate: '',
    enrollmentEndDate: '',
};

export default function StudentsManagementPage() {
    const router = useRouter();
    const [studentsList, setStudentsList] = useState<StudentMember[]>([]);
    const [isFetchingData, setIsFetchingData] = useState(false);

    const [myRole, setMyRole] = useState('');
    const [teachersOptions, setTeachersOptions] = useState<TeacherOption[]>([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [manualForm, setManualForm] = useState(initialManualForm);
    const today = new Date().toISOString().split('T')[0];

    // 🎯 미결제(+수강기간 만료) 학생만 보기 필터
    const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);

    // 🎯 수강 기간(수강료 납부 기간) 등록/연장 모달
    const [periodTarget, setPeriodTarget] = useState<StudentMember | null>(null);
    const [periodForm, setPeriodForm] = useState({ enrollmentStartDate: '', enrollmentEndDate: '' });
    const [isSubmittingPeriod, setIsSubmittingPeriod] = useState(false);

    useEffect(() => {
        fetchStudents();

        const role = sessionStorage.getItem('userRole') || '';
        setMyRole(role);
        if (role === 'ADMIN') {
            fetchTeachersOptions();
        }
    }, []);

    const fetchStudents = async () => {
        setIsFetchingData(true);
        try {
            const academyId = sessionStorage.getItem('academyId');
            const role = sessionStorage.getItem('userRole');
            const teacherUuid = sessionStorage.getItem('userUuid');

            let url = `http://localhost:8080/api/members/students?academyId=${academyId}`;

            if (role === 'TEACHER' && teacherUuid && teacherUuid.trim() !== '') {
                url += `&teacherUuid=${teacherUuid}`;
            }

            const response = await axios.get(url);

            // 백엔드 StudentListResponse의 필드 구조를 프론트 뷰 규격에 완벽 바인딩
            setStudentsList(response.data);
        } catch (error: any) {
            console.error('수강ens 리스트 패치 오류:', error);
        } finally {
            setIsFetchingData(false);
        }
    };

    // 🔄 원장 전용: 담당 강사 배정 셀렉트박스를 채우기 위한 강사 목록 조회
    const fetchTeachersOptions = async () => {
        try {
            const academyId = sessionStorage.getItem('academyId');

            const response = await axios.get(`http://localhost:8080/api/members/teachers?academyId=${academyId}`);

            setTeachersOptions(response.data || []);
        } catch (error) {
            console.error('강사 목록 조회 실패:', error);
        }
    };

    const openAddModal = () => {
        const teacherUuid = sessionStorage.getItem('userUuid') || '';
        // 강사가 직접 등록하는 경우 본인을 담당 강사로 자동 배정
        setManualForm({ ...initialManualForm, teacherUuid: myRole === 'TEACHER' ? teacherUuid : '' });
        setIsAddModalOpen(true);
    };

    const handleManualFormChange = (field: keyof typeof initialManualForm, value: string) => {
        setManualForm((prev) => ({ ...prev, [field]: value }));
    };

    // 🎯 [핵심 신규 기능] 수강생 수동 등록: 별도 가입 승인 절차 없이 등록 즉시 승인 완료 상태로 생성됨
    const handleManualRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            setIsSubmitting(true);
            const academyId = sessionStorage.getItem('academyId');

            const requestBody = {
                parentName: manualForm.parentName.trim(),
                parentPhone: manualForm.parentPhone.trim(),
                temporaryPassword: manualForm.temporaryPassword.trim(),
                name: manualForm.name.trim(),
                birthDate: manualForm.birthDate,
                gender: manualForm.gender,
                childPhone: manualForm.childPhone.trim() || null,
                managementName: manualForm.managementName.trim() || null,
                teacherUuid: manualForm.teacherUuid || null,
                schoolName: manualForm.schoolName.trim(),
                shuttlePickupLocation: manualForm.shuttlePickupLocation.trim() || null,
                shuttleDropoffLocation: manualForm.shuttleDropoffLocation.trim() || null,
                discountType: manualForm.discountType.trim() || null,
                memo: manualForm.memo.trim() || null,
                enrollmentStartDate: manualForm.enrollmentStartDate || null,
                enrollmentEndDate: manualForm.enrollmentEndDate || null,
            };

            await axios.post(`http://localhost:8080/api/members/students/manual?academyId=${academyId}`, requestBody);

            alert('수강생이 승인 완료 상태로 등록되었습니다.');
            setIsAddModalOpen(false);
            setManualForm(initialManualForm);
            fetchStudents();
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || '수강생 등록 중 오류가 발생했습니다.';
            alert(`[에러] ${errorMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApproveStudent = async (targetUuid: string) => {
        if (!confirm('해당 수강생(및 보호자 계정)의 가입을 승인하시겠습니까?')) return;

        try {
            // 🚨 백엔드 MemberController의 @PatchMapping("/{uuid}/approve") 주소와 바인딩
            await axios.patch(`http://localhost:8080/api/members/${targetUuid}/approve`, {});
            alert('승인이 완료되었습니다.');
            fetchStudents(); // 목록 새로고침
        } catch (error) {
            alert('승인 처리 중 오류가 발생했습니다.');
        }
    };

    // ─── 수강 기간(수강료 납부 기간) 관리 ────────────────────────────────────

    const openPeriodModal = (student: StudentMember) => {
        setPeriodForm({
            enrollmentStartDate: student.enrollmentStartDate || '',
            enrollmentEndDate: student.enrollmentEndDate || '',
        });
        setPeriodTarget(student);
    };

    const handleSubmitPeriod = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!periodTarget) return;

        try {
            setIsSubmittingPeriod(true);
            const academyId = sessionStorage.getItem('academyId');
            await axios.patch(
                `http://localhost:8080/api/members/students/${periodTarget.uuid}/enrollment-period?academyId=${academyId}`,
                {
                    enrollmentStartDate: periodForm.enrollmentStartDate || null,
                    enrollmentEndDate: periodForm.enrollmentEndDate || null,
                }
            );
            alert('수강 기간이 저장되었습니다.');
            setPeriodTarget(null);
            fetchStudents();
        } catch (error: any) {
            const msg = error.response?.data?.message || '수강 기간 저장 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmittingPeriod(false);
        }
    };

    // 🎯 [미결제] 뱃지 원클릭 연장: 확인 후 "다음 달 말일"까지 수강 종료일을 자동으로 늘린다.
    const handleQuickExtend = async (student: StudentMember) => {
        if (!confirm('수강기간을 연장하시겠습니까?')) return;

        const today = new Date();
        // new Date(y, m+2, 0) === "m+1월(0-indexed)의 0일" === 다음 달의 마지막 날
        const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
        const newEndDate = [
            nextMonthEnd.getFullYear(),
            String(nextMonthEnd.getMonth() + 1).padStart(2, '0'),
            String(nextMonthEnd.getDate()).padStart(2, '0'),
        ].join('-');

        try {
            const academyId = sessionStorage.getItem('academyId');
            await axios.patch(
                `http://localhost:8080/api/members/students/${student.uuid}/enrollment-period?academyId=${academyId}`,
                {
                    enrollmentStartDate: student.enrollmentStartDate || null,
                    enrollmentEndDate: newEndDate,
                }
            );
            alert(`수강기간이 ${newEndDate}까지 연장되었습니다.`);
            fetchStudents();
        } catch (error: any) {
            const msg = error.response?.data?.message || '수강기간 연장 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        }
    };

    const calculateAge = (birthDateString: string) => {
        if (!birthDateString) return '-';
        const birthYear = new Date(birthDateString).getFullYear();
        const currentYear = new Date().getFullYear();
        return `${currentYear - birthYear + 1}세`;
    };

    const getGenderLabel = (gender: string) => {
        if (gender === 'MALE') return '남';
        if (gender === 'FEMALE') return '여';
        return '-';
    };

    // 미결제(수강기간 만료 포함)만 필터링. 기간이 아예 설정되지 않은 학생은 추적 대상이 아니므로 제외한다.
    // 🎯 수강기간이 만료된 학생은 화면 맨 아래로 자동 정렬한다(그 외 학생들의 상대 순서는 그대로 유지 — stable sort).
    const displayedStudents = useMemo(() => {
        const base = showUnpaidOnly
            ? studentsList.filter((s) => s.enrollmentEndDate && !s.paidForUpcomingMonth)
            : studentsList;
        return [...base].sort((a, b) => Number(a.expired) - Number(b.expired));
    }, [studentsList, showUnpaidOnly]);

    return (
        <CommonMenuBar>
            <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
                <div className="bg-paper-raised p-4 sm:p-6 rounded-lg border border-line shadow-sm">

                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
                        <div className="space-y-1">
                            <h3 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                                <span>🎒</span> 소속 수강생 정보 관리
                            </h3>
                            <p className="text-ink-faint text-xs leading-relaxed max-w-md">
                                등록된 원생 인적 사항 및 차량 픽업 정보를 한눈에 관리하며, 신규 대기 유저를 승인합니다.
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <button
                                type="button"
                                onClick={() => setShowUnpaidOnly((prev) => !prev)}
                                className={`w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-bold rounded-lg border shadow-sm transition flex items-center justify-center gap-1.5 active:scale-98 ${
                                    showUnpaidOnly
                                        ? 'bg-danger hover:bg-danger-hover text-paper-raised border-danger'
                                        : 'bg-paper-raised hover:bg-line-soft text-ink-soft border-line'
                                }`}
                            >
                                <span>💳</span>
                                <span>{showUnpaidOnly ? '미결제만 보는 중' : '미결제만 보기'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={openAddModal}
                                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 active:scale-98"
                            >
                                <span>➕</span>
                                <span>수강생 수동 등록</span>
                            </button>
                            <button
                                type="button"
                                onClick={fetchStudents}
                                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-bold bg-line-soft hover:bg-line-soft text-ink-soft rounded-lg border border-line shadow-sm transition flex items-center justify-center gap-1.5 active:scale-98"
                            >
                                <span>{isFetchingData ? '⌛' : '🔄'}</span>
                                <span>{isFetchingData ? '새로고침 중..' : '리스트 새로고침'}</span>
                            </button>
                        </div>
                    </div>

                    {/* 데스크톱 대형 뷰포트 테이블 테이블 테이블 */}
                    <div className="hidden sm:block border border-line-soft rounded-lg overflow-x-auto">
                        <table className="min-w-full bg-paper-raised divide-y divide-line text-sm whitespace-nowrap">
                            <thead className="bg-line-soft text-ink-faint font-semibold text-xs uppercase tracking-wider text-left">
                            <tr>
                                <th className="p-4">관리용 이름(실명)</th>
                                <th className="p-4 text-center">성별</th>
                                <th className="p-4 text-center">나이</th>
                                <th className="p-4">학부모 연락처</th>
                                <th className="p-4">시간표</th>
                                <th className="p-4">차량 승하차 위치</th>
                                <th className="p-4">현재 승인 상태</th>
                                <th className="p-4">수강료 납부</th>
                                <th className="p-4 text-center">작업 관리</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-line text-ink-soft">
                            {displayedStudents.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-ink-faint font-medium">
                                        {showUnpaidOnly ? '미결제 수강생이 없습니다.' : '소속된 수강생 데이터가 존재하지 않습니다.'}
                                    </td>
                                </tr>
                            ) : (
                                displayedStudents.map((student) => {
                                    const badge = getPaymentBadge(student);
                                    return (
                                        <tr
                                            key={student.uuid}
                                            onClick={() => { if (student.expired) openPeriodModal(student); }}
                                            className={`transition ${student.expired ? 'bg-line-soft text-ink-faint cursor-pointer hover:bg-line-soft' : 'hover:bg-line-soft/70'}`}
                                        >
                                            <td
                                                onClick={(e) => {
                                                    if (student.expired) return; // 만료 행은 상세 이동 대신 행 클릭으로 기간 관리 모달이 열린다
                                                    e.stopPropagation();
                                                    router.push(`/dashboard/students/detail/${student.uuid}`);
                                                }}
                                                className={`p-4 font-bold select-none transition ${student.expired ? '' : 'text-ink cursor-pointer hover:text-accent hover:underline'}`}
                                            >
                                                {student.managementName || student.name}
                                                {student.managementName && student.managementName !== student.name && (
                                                    <span className={`text-xs font-normal ml-1 ${student.expired ? 'text-ink-faint' : 'text-ink-faint'}`}>({student.name})</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center font-medium">{getGenderLabel(student.gender)}</td>
                                            <td className="p-4 text-center font-medium">{calculateAge(student.birthDate)}</td>
                                            {/* 🚨 교정: parentPhone 혹은 phone 필드가 유연하게 연동되도록 안전 가드 처리 */}
                                            <td className="p-4 font-medium">{student.parentPhone || student.phone || '-'}</td>
                                            <td className="p-4 font-semibold">
                                                {formatScheduleSummary(student.schedules)}
                                                {(() => {
                                                    const badge = formatWeeklyFrequencyBadge(student);
                                                    if (!badge) return null;
                                                    return (
                                                        <div className={`text-[11px] font-normal mt-0.5 ${badge.mismatch ? 'text-warning font-semibold' : 'text-ink-faint'}`}>
                                                            {badge.mismatch && '⚠️ '}{badge.label}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td className="p-4 text-xs font-medium">
                                                {student.shuttlePickupLocation ? (
                                                    <div>
                                                        <span className="font-bold mr-1">🔺승차:</span>{student.shuttlePickupLocation}
                                                        {student.shuttleDropoffLocation && (
                                                            <div className="text-[11px] mt-0.5 opacity-80"><span className="font-bold mr-1">🔻하차:</span>{student.shuttleDropoffLocation}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="font-normal opacity-70">-</span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                {student.isApproved ? (
                                                    <span className="inline-flex px-2.5 py-1 text-xs font-semibold bg-success-soft text-success rounded-full">정식 원생</span>
                                                ) : (
                                                    <span className="inline-flex px-2.5 py-1 text-xs font-bold bg-warning-soft text-warning rounded-full animate-pulse">⏳ 대기유저</span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                {badge.label === '미결제' ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleQuickExtend(student); }}
                                                        className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full transition hover:brightness-95 active:scale-95 cursor-pointer ${badge.className}`}
                                                        title="클릭하면 다음 달 말일까지 수강기간을 연장합니다"
                                                    >
                                                        {badge.label} ↗
                                                    </button>
                                                ) : (
                                                    <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${badge.className}`}>{badge.label}</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {!student.isApproved && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleApproveStudent(student.uuid); }}
                                                            className="px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition active:scale-95"
                                                        >
                                                            가입 승인
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); openPeriodModal(student); }}
                                                        className="px-3 py-1.5 text-xs font-bold bg-paper-raised hover:bg-line-soft text-ink-soft border border-line rounded-lg shadow-sm transition active:scale-95"
                                                    >
                                                        📅 기간 관리
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                            </tbody>
                        </table>
                    </div>

                    {/* 모바일 장치 대응을 위한 모바일 모바일 뷰 */}
                    <div className="block sm:hidden space-y-3.5">
                        {displayedStudents.length === 0 ? (
                            <div className="p-8 text-center text-ink-faint font-medium border border-line-soft rounded-lg bg-line-soft/50">
                                {showUnpaidOnly ? '미결제 수강생이 없습니다.' : '소속된 수강생 데이터가 존재하지 않습니다.'}
                            </div>
                        ) : (
                            displayedStudents.map((student) => {
                                const badge = getPaymentBadge(student);
                                return (
                                    <div
                                        key={student.uuid}
                                        onClick={() => { if (student.expired) openPeriodModal(student); }}
                                        className={`p-4 border rounded-lg shadow-sm flex flex-col gap-3 ${
                                            student.expired ? 'bg-line-soft border-line cursor-pointer' : 'bg-paper-raised border-line'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between border-b border-line-soft pb-2 select-none">
                                            <div className="flex items-baseline gap-1.5">
                                                <span
                                                    onClick={(e) => {
                                                        if (student.expired) return;
                                                        e.stopPropagation();
                                                        router.push(`/dashboard/students/detail/${student.uuid}`);
                                                    }}
                                                    className={`font-bold text-base ${student.expired ? 'text-ink-faint' : 'text-accent underline cursor-pointer active:text-accent-hover'}`}
                                                >
                                                    {student.managementName || student.name}
                                                </span>
                                                <span className="text-xs text-ink-faint font-medium">({getGenderLabel(student.gender)} / {calculateAge(student.birthDate)})</span>
                                            </div>
                                            {student.isApproved ? (
                                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-success-soft text-success rounded-md border border-success-soft">정식 원생</span>
                                            ) : (
                                                <span className="px-2 py-0.5 text-[10px] font-bold bg-warning-soft text-warning rounded-md border border-warning-soft animate-pulse">⏳ 대기</span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-xs">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[10px] text-ink-faint font-bold">📞 연락처</span>
                                                <span className="font-semibold text-ink-soft">{student.parentPhone || student.phone || '-'}</span>
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[10px] text-ink-faint font-bold">🗓️ 시간표</span>
                                                <span className="font-semibold text-ink-soft">{formatScheduleSummary(student.schedules)}</span>
                                                {(() => {
                                                    const badge = formatWeeklyFrequencyBadge(student);
                                                    if (!badge) return null;
                                                    return (
                                                        <span className={`text-[11px] font-medium ${badge.mismatch ? 'text-warning font-semibold' : 'text-ink-faint'}`}>
                                                            {badge.mismatch && '⚠️ '}{badge.label}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[10px] text-ink-faint font-bold">💳 수강료 납부</span>
                                                {badge.label === '미결제' ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleQuickExtend(student); }}
                                                        className={`inline-flex w-fit px-2 py-0.5 text-[10px] font-semibold rounded-full transition active:scale-95 ${badge.className}`}
                                                    >
                                                        {badge.label} ↗
                                                    </button>
                                                ) : (
                                                    <span className={`inline-flex w-fit px-2 py-0.5 text-[10px] font-semibold rounded-full ${badge.className}`}>{badge.label}</span>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-0.5 col-span-2">
                                                <span className="text-[10px] text-ink-faint font-bold">🚌 차량 셔틀 위치</span>
                                                <span className="font-medium text-ink-soft text-xs">
                                                    {student.shuttlePickupLocation
                                                        ? `🔺승차: ${student.shuttlePickupLocation} / 🔻하차: ${student.shuttleDropoffLocation || '-'}`
                                                        : '셔틀 미이용 원생'
                                                    }
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 pt-2 border-t border-line-soft/70 mt-1">
                                            {!student.isApproved && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); handleApproveStudent(student.uuid); }}
                                                    className="flex-1 py-2.5 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition"
                                                >
                                                    가입 승인하기
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); openPeriodModal(student); }}
                                                className="flex-1 py-2.5 text-xs font-bold bg-paper-raised hover:bg-line-soft text-ink-soft border border-line rounded-lg shadow-sm transition"
                                            >
                                                📅 기간 관리
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                </div>

                {/* 🎯 수강생 수동 등록 모달: 별도 가입 승인 절차 없이 등록 즉시 '승인 완료' 상태로 생성된다 */}
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-paper-raised w-full max-w-2xl rounded-lg shadow-lg my-8 animate-fade-in">
                            <form onSubmit={handleManualRegisterSubmit}>
                                <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold text-ink">🎒 수강생 수동 등록</h3>
                                        <p className="text-xs text-ink-faint mt-1">
                                            학부모 회원가입 및 별도 승인 절차 없이, 등록 즉시 <strong className="text-accent">승인 완료</strong> 상태로 등록됩니다.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddModalOpen(false)}
                                        className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                </div>

                                <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
                                    <div className="space-y-3.5">
                                        <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5">👪 학부모 계정 정보</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">학부모 이름 *</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={manualForm.parentName}
                                                    onChange={(e) => handleManualFormChange('parentName', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">학부모 연락처 (로그인 ID) *</label>
                                                <input
                                                    type="tel"
                                                    required
                                                    value={manualForm.parentPhone}
                                                    onChange={(e) => handleManualFormChange('parentPhone', e.target.value)}
                                                    placeholder="010-0000-0000"
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1">임시 비밀번호 (8자 이상) *</label>
                                            <input
                                                type="text"
                                                required
                                                minLength={8}
                                                value={manualForm.temporaryPassword}
                                                onChange={(e) => handleManualFormChange('temporaryPassword', e.target.value)}
                                                placeholder="이미 등록된 학부모라면 무시되고 기존 계정에 자녀만 추가됩니다"
                                                className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3.5 pt-2">
                                        <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5">📝 수강생 세부 인적 사항</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">수강생 이름 *</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={manualForm.name}
                                                    onChange={(e) => handleManualFormChange('name', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">관리용 이름 (동명이인 구분용)</label>
                                                <input
                                                    type="text"
                                                    value={manualForm.managementName}
                                                    onChange={(e) => handleManualFormChange('managementName', e.target.value)}
                                                    placeholder="홍길동1"
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">성별 *</label>
                                                <select
                                                    required
                                                    value={manualForm.gender}
                                                    onChange={(e) => handleManualFormChange('gender', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                >
                                                    <option value="MALE">남학생 (MALE)</option>
                                                    <option value="FEMALE">여학생 (FEMALE)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">생년월일 *</label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={manualForm.birthDate}
                                                    onChange={(e) => handleManualFormChange('birthDate', e.target.value)}
                                                    max={today}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">소속 학교명 *</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={manualForm.schoolName}
                                                    onChange={(e) => handleManualFormChange('schoolName', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">원생 본인 연락처 (선택)</label>
                                                <input
                                                    type="tel"
                                                    value={manualForm.childPhone}
                                                    onChange={(e) => handleManualFormChange('childPhone', e.target.value)}
                                                    placeholder="010-0000-0000"
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1">담당 배정 선생님</label>
                                            {myRole === 'ADMIN' ? (
                                                <select
                                                    value={manualForm.teacherUuid}
                                                    onChange={(e) => handleManualFormChange('teacherUuid', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                >
                                                    <option value="">담당 강사 미배정</option>
                                                    {teachersOptions.map((t) => (
                                                        <option key={t.uuid} value={t.uuid}>{t.name} 선생님</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value="본인 담당으로 자동 배정됩니다"
                                                    disabled
                                                    className="w-full px-3 py-2.5 text-sm border border-line bg-line-soft rounded-lg text-ink-faint outline-none cursor-not-allowed"
                                                />
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3.5 pt-2">
                                        <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5">🚌 셔틀 및 기타 (선택)</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">🔺 등원 승차 위치</label>
                                                <input
                                                    type="text"
                                                    value={manualForm.shuttlePickupLocation}
                                                    onChange={(e) => handleManualFormChange('shuttlePickupLocation', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">🔻 하원 하차 위치</label>
                                                <input
                                                    type="text"
                                                    value={manualForm.shuttleDropoffLocation}
                                                    onChange={(e) => handleManualFormChange('shuttleDropoffLocation', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1">수강 할인 종류</label>
                                            <input
                                                type="text"
                                                value={manualForm.discountType}
                                                onChange={(e) => handleManualFormChange('discountType', e.target.value)}
                                                placeholder="형제 할인 10% 등"
                                                className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1">학원 전용 비공개 메모</label>
                                            <textarea
                                                rows={3}
                                                value={manualForm.memo}
                                                onChange={(e) => handleManualFormChange('memo', e.target.value)}
                                                className="w-full p-3 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3.5 pt-2">
                                        <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5">📅 수강 기간 *</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">수강 시작일 *</label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={manualForm.enrollmentStartDate}
                                                    onChange={(e) => handleManualFormChange('enrollmentStartDate', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-ink-soft mb-1">수강 종료일(납부 완료일) *</label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={manualForm.enrollmentEndDate}
                                                    onChange={(e) => handleManualFormChange('enrollmentEndDate', e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-ink-faint">
                                            💡 나중에 [수강생 관리] 목록에서 언제든 연장/변경할 수 있습니다.
                                        </p>
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddModalOpen(false)}
                                        className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="px-5 py-2 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                    >
                                        {isSubmitting ? '등록 중..' : '✨ 승인 완료 상태로 등록'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* 🎯 수강 기간(수강료 납부 기간) 등록/연장 모달 */}
                {periodTarget && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-paper-raised w-full max-w-sm rounded-lg shadow-lg my-8 animate-fade-in">
                            <form onSubmit={handleSubmitPeriod}>
                                <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold text-ink">📅 수강 기간 관리</h3>
                                        <p className="text-xs text-ink-faint mt-1">
                                            {periodTarget.managementName || periodTarget.name}의 수강료 납부 기간을 등록하거나 연장합니다.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setPeriodTarget(null)}
                                        className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                </div>

                                <div className="p-6 space-y-4">
                                    {periodTarget.expired && (
                                        <div className="p-3 text-xs font-semibold text-ink-soft bg-line-soft border border-line rounded-lg">
                                            ⚠️ 수강 기간이 지나 만료된 상태입니다. 종료일을 연장해주세요.
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-semibold text-ink-soft mb-1">수강 시작일</label>
                                        <input
                                            type="date"
                                            value={periodForm.enrollmentStartDate}
                                            onChange={(e) => setPeriodForm({ ...periodForm, enrollmentStartDate: e.target.value })}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-ink-soft mb-1">
                                            수강 종료일 (= 수강료 납부 완료일)
                                        </label>
                                        <input
                                            type="date"
                                            value={periodForm.enrollmentEndDate}
                                            onChange={(e) => setPeriodForm({ ...periodForm, enrollmentEndDate: e.target.value })}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                        />
                                    </div>
                                    <p className="text-[11px] text-ink-faint">
                                        💡 매달 20일을 기준으로, 다음 달분 수강료가 이 종료일 안에 포함되어 있지 않으면 목록에 &apos;미결제&apos;로 표시됩니다.
                                    </p>
                                </div>

                                <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPeriodTarget(null)}
                                        className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmittingPeriod}
                                        className="px-5 py-2 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                    >
                                        {isSubmittingPeriod ? '저장 중..' : '✨ 저장'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </CommonMenuBar>
    );
}
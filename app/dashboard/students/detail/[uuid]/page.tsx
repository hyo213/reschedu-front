'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import CommonMenuBar from '../../../components/commonMenuBar';

const API_BASE = 'http://localhost:8080/api';

interface TeacherOption {
    uuid: string;
    name: string;
}

interface TimeSlot {
    dayOfWeek: string;
    startTime: string;
    endTime: string;
}

interface ScheduleHistoryEntry {
    regularClassUuid: string;
    title: string | null;
    teacherUuid: string;
    teacherName: string;
    roomNumber: string | null;
    timeSlots: TimeSlot[]; // 요일별 시간대, 요일 순 정렬되어 옴
    startDate: string | null;
    endDate: string | null;
    active: boolean;
}

interface EnrollmentPeriodHistoryEntry {
    changedAt: string;
    changedByName: string | null;
    previousStartDate: string | null;
    previousEndDate: string | null;
    newStartDate: string | null;
    newEndDate: string | null;
}

const DAY_LABELS: Record<string, string> = {
    MONDAY: '월', TUESDAY: '화', WEDNESDAY: '수', THURSDAY: '목',
    FRIDAY: '금', SATURDAY: '토', SUNDAY: '일',
};
const ALL_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function formatClassLabel(cls: { title: string | null; teacherName: string; timeSlots: TimeSlot[] }): string {
    const schedule = cls.timeSlots
        .map((s) => `${DAY_LABELS[s.dayOfWeek] || s.dayOfWeek} ${s.startTime.slice(0, 5)}~${s.endTime.slice(0, 5)}`)
        .join(', ');
    const title = cls.title ? `${cls.title} · ` : '';
    return `${title}${schedule} (${cls.teacherName})`;
}

export default function StudentDetailPage({ params }: { params: Promise<{ uuid: string }> }) {
    const router = useRouter();
    const { uuid } = use(params);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [myRole, setMyRole] = useState('');
    const [teachersOptions, setTeachersOptions] = useState<TeacherOption[]>([]);

    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [managementName, setManagementName] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [gender, setGender] = useState('');
    const [phone, setPhone] = useState('');
    const [childPhone, setChildPhone] = useState('');
    const [schoolName, setSchoolName] = useState('');
    const [shuttlePickupLocation, setShuttlePickupLocation] = useState('');
    const [shuttleDropoffLocation, setShuttleDropoffLocation] = useState('');
    const [discountType, setDiscountType] = useState('');
    const [memo, setMemo] = useState('');
    const [weeklyFrequency, setWeeklyFrequency] = useState(''); // 희망 횟수, 실제 배정 개수와 별개
    const [teacherUuid, setTeacherUuid] = useState('');
    // 최초 로드 시점의 담당 강사 배정 여부 — 편집 가능 여부 판단 기준(select로 바로 안 바뀌게)
    const [originalTeacherUuid, setOriginalTeacherUuid] = useState<string | null>(null);
    const [teacherName, setTeacherName] = useState('');
    const [previousTeacherName, setPreviousTeacherName] = useState<string | null>(null);
    const [teacherHandoverEffectiveFrom, setTeacherHandoverEffectiveFrom] = useState<string | null>(null);
    const [isTeacherHandoverModalOpen, setIsTeacherHandoverModalOpen] = useState(false);
    const [handoverForm, setHandoverForm] = useState({ newTeacherUuid: '', effectiveFrom: '' });
    const [isSubmittingHandover, setIsSubmittingHandover] = useState(false);
    // toISOString()은 UTC 기준이라 KST 자정~오전 9시 사이 "오늘"이 어제로 밀리는 문제가 있어 로컬 기준으로 직접 조립
    const formatLocalDateISO = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    const today = formatLocalDateISO(new Date());
    // 스케줄 적용 시작일 기본값은 이번 달 1일 (등록/변경이 보통 월 단위로 이뤄짐)
    const firstDayOfThisMonth = (() => {
        const d = new Date();
        return formatLocalDateISO(new Date(d.getFullYear(), d.getMonth(), 1));
    })();

    // [시간표 관리]의 수업 추가 폼과 동일한 필드 구성
    const initialScheduleForm = {
        fromRegularClassUuid: '',
        title: '',
        teacherUuid: '',
        roomNumber: '',
        maxCapacity: 10,
        timeSlots: [] as TimeSlot[],
        effectiveFrom: firstDayOfThisMonth,
    };
    const [scheduleHistory, setScheduleHistory] = useState<ScheduleHistoryEntry[]>([]);
    const [enrollmentPeriodHistory, setEnrollmentPeriodHistory] = useState<EnrollmentPeriodHistoryEntry[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [scheduleForm, setScheduleForm] = useState(initialScheduleForm);
    const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    useEffect(() => {
        if (uuid && uuid !== 'undefined' && uuid !== '[object Object]') {
            loadInitialData();
            fetchScheduleHistory();
        }
    }, [uuid]);

    const fetchScheduleHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.get(`${API_BASE}/members/students/${uuid}/history?academyId=${academyId}`);
            setScheduleHistory(res.data?.scheduleHistory || []);
            setEnrollmentPeriodHistory(res.data?.enrollmentPeriodHistory || []);
        } catch (error) {
            console.error('수강 히스토리 조회 실패:', error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    // 요일 변경 시 "종료할 기존 반" 후보 (현재 활성 배정만)
    const activeScheduleEntries = scheduleHistory.filter((h) => h.active);

    const DEFAULT_SLOT_START = '15:00';
    const DEFAULT_SLOT_END = '16:00';

    // 요일을 켜면 그 요일의 시간 입력 행이 추가되고(직전에 입력한 시간을 기본값으로 이어받는다),
    // 끄면 그 요일의 시간 입력 행이 사라진다 — [시간표 관리]와 동일한 동작이다.
    const toggleScheduleDay = (day: string) => {
        setScheduleForm((prev) => {
            if (prev.timeSlots.some((s) => s.dayOfWeek === day)) {
                return { ...prev, timeSlots: prev.timeSlots.filter((s) => s.dayOfWeek !== day) };
            }
            const lastSlot = prev.timeSlots[prev.timeSlots.length - 1];
            const newSlot = {
                dayOfWeek: day,
                startTime: lastSlot?.startTime || DEFAULT_SLOT_START,
                endTime: lastSlot?.endTime || DEFAULT_SLOT_END,
            };
            const nextSlots = [...prev.timeSlots, newSlot]
                .sort((a, b) => ALL_DAYS.indexOf(a.dayOfWeek) - ALL_DAYS.indexOf(b.dayOfWeek));
            return { ...prev, timeSlots: nextSlots };
        });
    };

    const updateScheduleSlotTime = (day: string, field: 'startTime' | 'endTime', value: string) => {
        setScheduleForm((prev) => ({
            ...prev,
            timeSlots: prev.timeSlots.map((s) => (s.dayOfWeek === day ? { ...s, [field]: value } : s)),
        }));
    };

    // "이 반에서 요일 변경" 클릭 시 기존 반의 요일/시간/강의실을 폼에 미리 채움
    const selectFromEntry = (entry: ScheduleHistoryEntry) => {
        setScheduleForm((prev) => ({
            ...prev,
            fromRegularClassUuid: entry.regularClassUuid,
            title: entry.title || '',
            teacherUuid: myRole === 'TEACHER' ? prev.teacherUuid : entry.teacherUuid,
            roomNumber: entry.roomNumber || '',
            timeSlots: entry.timeSlots.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime.slice(0, 5),
                endTime: s.endTime.slice(0, 5),
            })),
        }));
    };

    // [시간표 관리]와 동일한 로직: 새 정규 수업 생성 후 그 수업에 기간을 지정해 학생 배정
    const handleScheduleChangeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (scheduleForm.timeSlots.length === 0) {
            alert('수업 요일을 최소 1개 이상 선택해주세요.');
            return;
        }
        if (!scheduleForm.teacherUuid) {
            alert('담당 강사를 선택해주세요.');
            return;
        }
        const invalidSlot = scheduleForm.timeSlots.find((s) => s.startTime >= s.endTime);
        if (invalidSlot) {
            alert(`${DAY_LABELS[invalidSlot.dayOfWeek]}요일의 종료 시간은 시작 시간보다 이후여야 합니다.`);
            return;
        }
        if (!confirm(`${scheduleForm.effectiveFrom}부터 적용되도록 새 스케줄로 배정하시겠습니까?`)) return;

        try {
            setIsSubmittingSchedule(true);
            const academyId = sessionStorage.getItem('academyId');

            // 스마트 배정: 같은 강사가 이미 같은 요일·시간에 진행 중인 반이 있으면 그 반에 합류, 아니면 새 반 생성
            await axios.post(
                `${API_BASE}/regular-classes/schedule-smart-assign?academyId=${academyId}`,
                {
                    studentUuid: uuid,
                    teacherUuid: scheduleForm.teacherUuid,
                    title: scheduleForm.title.trim() || null,
                    roomNumber: scheduleForm.roomNumber.trim() || null,
                    maxCapacity: Number(scheduleForm.maxCapacity),
                    timeSlots: scheduleForm.timeSlots,
                    effectiveFrom: scheduleForm.effectiveFrom,
                    fromRegularClassUuid: scheduleForm.fromRegularClassUuid || null,
                }
            );

            alert('수업 스케줄이 변경되었습니다. 같은 강사님의 같은 요일·시간에 이미 진행 중인 반이 있었다면 그 반에 합류되었습니다. [시간표 관리] 화면에도 즉시 반영됩니다.');
            setScheduleForm({ ...initialScheduleForm, teacherUuid: myRole === 'TEACHER' ? scheduleForm.teacherUuid : '' });
            fetchScheduleHistory();
        } catch (error: any) {
            const msg = error.response?.data?.message || '스케줄 변경 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmittingSchedule(false);
        }
    };

    const loadInitialData = async () => {
        setIsLoading(true);
        try {
            const academyId = sessionStorage.getItem('academyId');
            const role = sessionStorage.getItem('userRole') || '';
            setMyRole(role);

            const teachersRes = await axios.get(`${API_BASE}/members/teachers?academyId=${academyId}`);
            setTeachersOptions(teachersRes.data || []);

            if (role === 'TEACHER') {
                const teacherUuidSelf = sessionStorage.getItem('userUuid') || '';
                setScheduleForm((prev) => ({ ...prev, teacherUuid: teacherUuidSelf }));
            }

            const studentRes = await axios.get(`${API_BASE}/members/students/${uuid}?academyId=${academyId}`);

            const s = studentRes.data;
            if (s) {
                setEmail(s.email || '');
                setName(s.name || '');
                setManagementName(s.managementName || '');
                setBirthDate(s.birthDate || '');
                setGender(s.gender || '');
                setPhone(s.parentPhone || s.phone || '');
                setChildPhone(s.childPhone || '');
                setSchoolName(s.schoolName || '');
                setShuttlePickupLocation(s.shuttlePickupLocation || '');
                setShuttleDropoffLocation(s.shuttleDropoffLocation || '');
                setDiscountType(s.discountType || '');
                setMemo(s.memo || '');
                setWeeklyFrequency(s.weeklyFrequency != null ? String(s.weeklyFrequency) : '');
                setTeacherUuid(s.teacherUuid || '');
                setOriginalTeacherUuid(s.teacherUuid || '');
                setTeacherName(s.teacherName || '배정 없음');
                setPreviousTeacherName(s.previousTeacherName || null);
                setTeacherHandoverEffectiveFrom(s.teacherHandoverEffectiveFrom || null);
            }

        } catch (error) {
            console.error('상세정보 조회 실패:', error);
            alert('데이터를 가져오는데 실패했습니다.');
            router.push('/dashboard/students');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!confirm('수정된 인적사항 정보를 저장하시겠습니까?')) return;

        setIsSaving(true);
        try {
            const academyId = sessionStorage.getItem('academyId');

            const requestBody: any = {
                managementName: managementName.trim() || null,
                birthDate,
                gender,
                phone: phone.trim(),
                childPhone: childPhone.trim() || null,
                schoolName,
                shuttlePickupLocation: shuttlePickupLocation.trim() || null,
                shuttleDropoffLocation: shuttleDropoffLocation.trim() || null,
                discountType: discountType.trim() || null,
                memo: memo.trim() || null,
                weeklyFrequency: weeklyFrequency.trim() !== '' ? Number(weeklyFrequency) : null,
            };

            await axios.put(`${API_BASE}/members/students/${uuid}?academyId=${academyId}`, requestBody);

            alert('수강생 정보가 성공적으로 변경되었습니다.');
            await loadInitialData();
        } catch (error) {
            alert('정보 수정 중 서버 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    // ─── 담당 강사 인계(효력일 지정) ───
    // 미배정 상태에서 처음 지정하면 즉시(오늘부터) 배정, 이미 배정된 상태면 모달에서 효력일 지정
    const openTeacherHandoverModal = () => {
        setHandoverForm({ newTeacherUuid: '', effectiveFrom: today });
        setIsTeacherHandoverModalOpen(true);
    };

    const submitTeacherHandover = async (newTeacherUuid: string, effectiveFrom: string) => {
        const academyId = sessionStorage.getItem('academyId');
        setIsSubmittingHandover(true);
        try {
            await axios.post(
                `${API_BASE}/members/students/${uuid}/teacher-handover?academyId=${academyId}`,
                { newTeacherUuid, effectiveFrom }
            );
            setIsTeacherHandoverModalOpen(false);
            await loadInitialData();
        } catch (error: any) {
            const msg = error.response?.data?.message || '담당 강사 변경 중 오류가 발생했습니다.';
            alert(msg);
        } finally {
            setIsSubmittingHandover(false);
        }
    };

    const handleAssignUnassignedTeacher = async (newTeacherUuid: string) => {
        if (!newTeacherUuid) return;
        await submitTeacherHandover(newTeacherUuid, today);
    };

    const handleTeacherHandoverSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!handoverForm.newTeacherUuid) {
            alert('새 담당 강사를 선택해주세요.');
            return;
        }
        if (!confirm(`${handoverForm.effectiveFrom}부터 담당 강사를 변경하시겠습니까?`)) return;
        await submitTeacherHandover(handoverForm.newTeacherUuid, handoverForm.effectiveFrom);
    };

    if (isLoading) return <CommonMenuBar><div className="p-8 text-center text-sm text-ink-faint">수강생 정보를 로딩하고 있습니다..</div></CommonMenuBar>;

    return (
        <CommonMenuBar>
            <main className="p-4 sm:p-6 max-w-3xl w-full mx-auto space-y-6 animate-fade-in">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-ink-faint font-medium">
                        <span className="cursor-pointer hover:underline" onClick={() => router.push('/dashboard/students')}>수강생 목록</span>
                        <span>&gt;</span>
                        <span className="text-ink font-semibold">원생 상세 정보 설정</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => router.push('/dashboard/students')}
                        className="shrink-0 px-3 py-1.5 text-xs font-bold text-ink-soft bg-paper-raised border border-line rounded-lg shadow-sm hover:bg-line-soft transition"
                    >
                        📋 목록으로
                    </button>
                </div>

                <form onSubmit={handleUpdateSubmit} className="bg-paper-raised border border-line rounded-lg shadow-sm overflow-hidden">
                    <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft flex items-center justify-between">
                        <div>
                            <div className="flex items-baseline gap-2">
                                <h2 className="text-xl font-bold text-ink">{name}</h2>
                                {email && <span className="text-xs text-ink-faint font-mono">({email})</span>}
                            </div>
                            <p className="text-xs text-ink-faint mt-1">원생의 기본 고유 정보 및 원내 인적사항을 변경합니다.</p>
                        </div>
                    </div>

                    <div className="p-6 space-y-5">
                        <div className="space-y-3.5">
                            <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5">📌 원내 관리 기본 데이터</h4>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="managementNameInput" className="block text-xs font-semibold text-ink-soft mb-1">관리용 이름 (동명이인 구분용)</label>
                                    <input
                                        id="managementNameInput"
                                        type="text"
                                        value={managementName}
                                        onChange={(e) => setManagementName(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink font-medium"
                                        placeholder="홍길동1"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="teacherSelect" className="block text-xs font-semibold text-ink-soft mb-1">담당 배정 선생님</label>
                                    {!originalTeacherUuid ? (
                                        // 미배정 상태: 선택 즉시 오늘 날짜로 배정 (모달 불필요)
                                        <select
                                            id="teacherSelect"
                                            value={teacherUuid}
                                            onChange={(e) => {
                                                setTeacherUuid(e.target.value);
                                                handleAssignUnassignedTeacher(e.target.value);
                                            }}
                                            disabled={isSubmittingHandover}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink font-medium disabled:opacity-50"
                                        >
                                            <option value="">담당 강사 미배정</option>
                                            {teachersOptions.map((t) => (
                                                <option key={t.uuid} value={t.uuid}>{t.name} 선생님</option>
                                            ))}
                                        </select>
                                    ) : (
                                        // 배정된 상태: "변경"으로 효력일을 지정해 인계 (즉시 덮어쓰지 않음)
                                        <div className="flex items-center gap-2">
                                            <input
                                                id="teacherSelect"
                                                type="text"
                                                value={`${teacherName} 선생님`}
                                                disabled
                                                className="flex-1 px-3 py-2.5 text-sm border border-line bg-line-soft rounded-lg text-ink-faint font-medium outline-none cursor-not-allowed"
                                            />
                                            <button
                                                type="button"
                                                onClick={openTeacherHandoverModal}
                                                className="shrink-0 px-3 py-2.5 text-xs font-bold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition"
                                            >
                                                변경
                                            </button>
                                        </div>
                                    )}
                                    {previousTeacherName && (
                                        <p className="mt-1 text-[11px] text-ink-faint">
                                            🔁 {previousTeacherName} 선생님 → {teacherName} 선생님
                                            {teacherHandoverEffectiveFrom &&
                                                ` (${teacherHandoverEffectiveFrom.replaceAll('-', '.')}부터)`}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3.5 pt-2">
                            <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5">📝 학생 세부 인적 사항</h4>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="genderSelect" className="block text-xs font-semibold text-ink-soft mb-1">성별 *</label>
                                    <select
                                        id="genderSelect"
                                        value={gender}
                                        onChange={(e) => setGender(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        required
                                    >
                                        <option value="MALE">남학생 (MALE)</option>
                                        <option value="FEMALE">여학생 (FEMALE)</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="birthDateInput" className="block text-xs font-semibold text-ink-soft mb-1">생년월일 *</label>
                                    <input
                                        id="birthDateInput"
                                        type="date"
                                        value={birthDate}
                                        onChange={(e) => setBirthDate(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        required
                                        autoComplete="off"
                                        max={today}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                <div>
                                    <label htmlFor="parentPhoneInput" className="block text-xs font-semibold text-ink-soft mb-1">학부모 연락처 *</label>
                                    <input
                                        id="parentPhoneInput"
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink font-medium"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="childPhoneInput" className="block text-xs font-semibold text-ink-soft mb-1">원생 본인 연락처 (선택)</label>
                                    <input
                                        id="childPhoneInput"
                                        type="tel"
                                        value={childPhone}
                                        onChange={(e) => setChildPhone(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        placeholder="010-0000-0000"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div>
                                    <label htmlFor="schoolNameInput" className="block text-xs font-semibold text-ink-soft mb-1">소속 학교명 *</label>
                                    <input
                                        id="schoolNameInput"
                                        type="text"
                                        value={schoolName}
                                        onChange={(e) => setSchoolName(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="discountTypeInput" className="block text-xs font-semibold text-ink-soft mb-1">수강 할인 종류</label>
                                    <input
                                        type="text"
                                        id="discountTypeInput"
                                        value={discountType}
                                        onChange={(e) => setDiscountType(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        placeholder="형제 할인 10% 등"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="weeklyFrequencyInput" className="block text-xs font-semibold text-ink-soft mb-1">주당 희망 수강 횟수</label>
                                    <select
                                        id="weeklyFrequencyInput"
                                        value={weeklyFrequency}
                                        onChange={(e) => setWeeklyFrequency(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink font-medium"
                                    >
                                        <option value="">미입력</option>
                                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                                            <option key={n} value={n}>주{n}회</option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-[11px] text-ink-faint">
                                        실제 정규 수업 배정 개수와 다를 수 있습니다(아래 [반 배정 이력]에서 실제 배정을 확인하세요).
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3.5 pt-2">
                            <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5">🚌 셔틀 차량 승하차 설정</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="shuttlePickupInput" className="block text-xs font-semibold text-ink-soft mb-1">🔺 등원 승차 위치</label>
                                    <input
                                        id="shuttlePickupInput"
                                        type="text"
                                        value={shuttlePickupLocation}
                                        onChange={(e) => setShuttlePickupLocation(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink text-xs"
                                        placeholder="OO아파트 정문 앞 단지 정류장"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="shuttleDropoffInput" className="block text-xs font-semibold text-ink-soft mb-1">🔻 하원 하차 위치</label>
                                    <input
                                        id="shuttleDropoffInput"
                                        type="text"
                                        value={shuttleDropoffLocation}
                                        onChange={(e) => setShuttleDropoffLocation(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink text-xs"
                                        placeholder="OO아파트 정문 앞 (동일한 경우 생략 가능)"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 pt-2">
                            <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5">🔒 학원 관리 전용 특이사항 메모 (비공개)</h4>
                            <textarea
                                id="memoInput"
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                                rows={4}
                                className="w-full p-3 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink font-medium leading-relaxed"
                                placeholder="진도 현황, 아이의 성향 및 주의사항, 학부모 상담 이력 등을 자유롭게 기재하세요."
                            />
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-line-soft border-t border-line-soft flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => router.push('/dashboard/students')}
                            className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                        >
                            변경 취소
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-5 py-2 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                        >
                            {isSaving ? '저장 중..' : '✨ 인적사항 수정 완료'}
                        </button>
                    </div>
                </form>

                {/* 수업 스케줄 배정 / 요일 변경 — 시간표 관리 화면과 데이터 공유 */}
                <div className="bg-paper-raised border border-line rounded-lg shadow-sm overflow-hidden">
                    <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-ink">📚 수업 스케줄</h3>
                            <p className="text-xs text-ink-faint mt-1">
                                이 화면에서 요일/시간대를 변경하면 [시간표 관리] 화면에도 즉시 그대로 반영됩니다.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsHistoryModalOpen(true)}
                            className="px-3.5 py-2 text-xs font-bold bg-paper-raised hover:bg-line-soft text-ink-soft border border-line rounded-lg shadow-sm transition whitespace-nowrap"
                        >
                            🕒 수강 히스토리 보기
                        </button>
                    </div>

                    <div className="p-6 space-y-5">
                        <div>
                            <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5 mb-3">
                                현재 배정된 반
                            </h4>
                            {isLoadingHistory ? (
                                <p className="text-xs text-ink-faint">불러오는 중..</p>
                            ) : activeScheduleEntries.length === 0 ? (
                                <p className="text-xs text-ink-faint">현재 배정된 반이 없습니다. 아래에서 새로 배정해주세요.</p>
                            ) : (
                                <div className="space-y-2">
                                    {activeScheduleEntries.map((entry) => (
                                        <div
                                            key={`${entry.regularClassUuid}-${entry.startDate}`}
                                            className="flex items-center justify-between gap-3 p-3 border border-line rounded-lg bg-line-soft/50"
                                        >
                                            <div className="text-sm">
                                                <span className="font-bold text-ink">{formatClassLabel(entry)}</span>
                                                {entry.roomNumber && <span className="text-ink-faint text-xs ml-1.5">· {entry.roomNumber}</span>}
                                                <div className="text-[11px] text-ink-faint mt-0.5">
                                                    {entry.startDate || '제한 없음'} ~ {entry.endDate || '제한 없음'}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => selectFromEntry(entry)}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg border shadow-sm transition whitespace-nowrap ${
                                                    scheduleForm.fromRegularClassUuid === entry.regularClassUuid
                                                        ? 'bg-accent text-paper-raised border-accent'
                                                        : 'bg-paper-raised text-ink-soft border-line hover:bg-line-soft'
                                                }`}
                                            >
                                                {scheduleForm.fromRegularClassUuid === entry.regularClassUuid ? '변경 대상으로 선택됨' : '이 반에서 요일 변경'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleScheduleChangeSubmit} className="space-y-3.5 pt-2 border-t border-line-soft">
                            <h4 className="text-xs font-bold text-accent uppercase tracking-wider pt-3">
                                {scheduleForm.fromRegularClassUuid ? '요일 변경 (새 요일/시간으로 이동)' : '새로 수업 배정하기'}
                            </h4>
                            <p className="text-[11px] text-ink-faint -mt-2">
                                [시간표 관리]에서 수업을 추가할 때와 동일하게, 요일·시간·강의실을 직접 선택해 이 학생만의 새 수업을 만듭니다.
                                예: 8월까지 월·수·금반이었다가 9월 1일부터 월·목반으로 옮기려면, 위에서 기존 반을 "요일 변경 대상"으로 선택한 뒤
                                아래에서 새 요일/시간과 적용 시작일(9월 1일)을 지정하세요. 기존 반은 자동으로 전날까지로 종료 처리됩니다.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">수업명 (선택)</label>
                                    <input
                                        type="text"
                                        value={scheduleForm.title}
                                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, title: e.target.value }))}
                                        placeholder="어린이 수영 A반"
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">강의실 호수 (선택)</label>
                                    <input
                                        type="text"
                                        value={scheduleForm.roomNumber}
                                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, roomNumber: e.target.value }))}
                                        placeholder="3강의실"
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">담당 강사 *</label>
                                    {myRole === 'ADMIN' ? (
                                        <select
                                            required
                                            value={scheduleForm.teacherUuid}
                                            onChange={(e) => setScheduleForm((prev) => ({ ...prev, teacherUuid: e.target.value }))}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        >
                                            <option value="">강사 선택</option>
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
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">정원 *</label>
                                    <input
                                        type="number"
                                        required
                                        min={1}
                                        value={scheduleForm.maxCapacity}
                                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, maxCapacity: Number(e.target.value) }))}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-ink-soft mb-1.5">수업 요일 *</label>
                                <p className="text-[11px] text-ink-faint -mt-0.5 mb-2">
                                    요일을 켜면 그 요일의 시간을 따로 입력할 수 있습니다(예: 월 15시, 수 17시, 금 20시).
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {ALL_DAYS.map((day) => (
                                        <button
                                            type="button"
                                            key={day}
                                            onClick={() => toggleScheduleDay(day)}
                                            className={`w-10 h-10 rounded-full text-xs font-bold border transition ${
                                                scheduleForm.timeSlots.some((s) => s.dayOfWeek === day)
                                                    ? 'bg-accent border-accent text-paper-raised'
                                                    : 'bg-paper-raised border-line text-ink-soft hover:bg-line-soft'
                                            }`}
                                        >
                                            {DAY_LABELS[day]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {scheduleForm.timeSlots.length > 0 && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">요일별 시간 *</label>
                                    {scheduleForm.timeSlots.map((slot) => (
                                        <div key={slot.dayOfWeek} className="flex items-center gap-2">
                                            <span className="w-8 flex-shrink-0 text-center text-xs font-bold text-ink-soft bg-line-soft rounded-lg py-2">
                                                {DAY_LABELS[slot.dayOfWeek]}
                                            </span>
                                            <input
                                                type="time"
                                                required
                                                value={slot.startTime}
                                                onChange={(e) => updateScheduleSlotTime(slot.dayOfWeek, 'startTime', e.target.value)}
                                                className="flex-1 px-3 py-2 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                            />
                                            <span className="text-ink-faint text-xs">~</span>
                                            <input
                                                type="time"
                                                required
                                                value={slot.endTime}
                                                onChange={(e) => updateScheduleSlotTime(slot.dayOfWeek, 'endTime', e.target.value)}
                                                className="flex-1 px-3 py-2 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-ink-soft mb-1">적용 시작일 *</label>
                                <input
                                    type="date"
                                    required
                                    value={scheduleForm.effectiveFrom}
                                    onChange={(e) => setScheduleForm((prev) => ({ ...prev, effectiveFrom: e.target.value }))}
                                    className="w-full sm:w-1/2 px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                />
                            </div>

                            <div className="flex items-center justify-between gap-3 pt-1">
                                {scheduleForm.fromRegularClassUuid ? (
                                    <button
                                        type="button"
                                        onClick={() => setScheduleForm((prev) => ({ ...initialScheduleForm, teacherUuid: myRole === 'TEACHER' ? prev.teacherUuid : '' }))}
                                        className="text-xs font-semibold text-ink-faint hover:text-ink-soft"
                                    >
                                        선택 취소 (새로 배정만 하기)
                                    </button>
                                ) : <span />}
                                <button
                                    type="submit"
                                    disabled={isSubmittingSchedule}
                                    className="px-5 py-2.5 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                >
                                    {isSubmittingSchedule ? '저장 중..' : (scheduleForm.fromRegularClassUuid ? '✨ 요일 변경하기' : '✨ 반 배정하기')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </main>

            {/* 👨‍🏫 담당 강사 변경(효력일 지정) 모달 */}
            {isTeacherHandoverModalOpen && (
                <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-paper-raised w-full max-w-sm rounded-lg shadow-lg my-8 animate-fade-in">
                        <form onSubmit={handleTeacherHandoverSubmit}>
                            <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                <h3 className="text-lg font-bold text-ink">👨‍🏫 담당 강사 변경</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsTeacherHandoverModalOpen(false)}
                                    className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <p className="text-xs text-ink-faint leading-relaxed">
                                    새 담당 강사는 지금부터 [수강생 관리] 목록에 보이고, 기존 담당 강사는 지정한 날짜
                                    전날까지 계속 보입니다.
                                </p>
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">새 담당 강사 *</label>
                                    <select
                                        required
                                        value={handoverForm.newTeacherUuid}
                                        onChange={(e) => setHandoverForm({ ...handoverForm, newTeacherUuid: e.target.value })}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    >
                                        <option value="">강사 선택</option>
                                        {teachersOptions
                                            .filter((t) => t.uuid !== originalTeacherUuid)
                                            .map((t) => (
                                                <option key={t.uuid} value={t.uuid}>{t.name} 선생님</option>
                                            ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">적용 시작일 *</label>
                                    <input
                                        type="date"
                                        required
                                        value={handoverForm.effectiveFrom}
                                        onChange={(e) => setHandoverForm({ ...handoverForm, effectiveFrom: e.target.value })}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    />
                                </div>
                            </div>

                            <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsTeacherHandoverModalOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingHandover}
                                    className="px-4 py-2 text-xs font-bold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition disabled:opacity-50"
                                >
                                    {isSubmittingHandover ? '변경 중..' : '변경'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 수강 히스토리 모달: 반 배정(요일) 이력 + 수강 기간 변경 이력 */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-paper-raised w-full max-w-xl rounded-lg shadow-lg my-8 animate-fade-in">
                        <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-ink">🕒 수강 히스토리</h3>
                                <p className="text-xs text-ink-faint mt-1">{name}의 반 배정 이력과 수강 기간 변경 이력입니다.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsHistoryModalOpen(false)}
                                className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">
                            <div>
                                <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5 mb-3">
                                    📚 반 배정(요일) 이력
                                </h4>
                                {scheduleHistory.length === 0 ? (
                                    <p className="text-xs text-ink-faint">배정 이력이 없습니다.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {scheduleHistory.map((entry) => (
                                            <div key={`${entry.regularClassUuid}-${entry.startDate}-${entry.endDate}`} className="p-3 border border-line rounded-lg">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-bold text-ink">{formatClassLabel(entry)}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                        entry.active
                                                            ? 'bg-success-soft text-success'
                                                            : (entry.startDate && entry.startDate > today)
                                                                ? 'bg-accent-soft text-accent-hover'
                                                                : 'bg-line-soft text-ink-faint'
                                                    }`}>
                                                        {entry.active ? '진행 중' : (entry.startDate && entry.startDate > today) ? '예정' : '종료'}
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-ink-faint mt-1">
                                                    {entry.startDate || '제한 없음'} ~ {entry.endDate || '제한 없음'}
                                                    {entry.roomNumber && ` · ${entry.roomNumber}`}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <h4 className="text-xs font-bold text-accent uppercase tracking-wider border-b border-line-soft pb-1.5 mb-3">
                                    💳 수강 기간(수강료 납부) 변경 이력
                                </h4>
                                {enrollmentPeriodHistory.length === 0 ? (
                                    <p className="text-xs text-ink-faint">변경 이력이 없습니다.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {enrollmentPeriodHistory.map((h, idx) => (
                                            <div key={idx} className="p-3 border border-line rounded-lg text-xs">
                                                <div className="flex items-center justify-between text-ink-faint">
                                                    <span>{h.changedAt?.slice(0, 16).replace('T', ' ')}</span>
                                                    {h.changedByName && <span className="font-semibold">{h.changedByName}</span>}
                                                </div>
                                                <div className="mt-1 text-ink-soft">
                                                    <span className="text-ink-faint line-through">{h.previousStartDate || '-'} ~ {h.previousEndDate || '-'}</span>
                                                    <span className="mx-1.5">→</span>
                                                    <span className="font-bold">{h.newStartDate || '-'} ~ {h.newEndDate || '-'}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end">
                            <button
                                type="button"
                                onClick={() => setIsHistoryModalOpen(false)}
                                className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </CommonMenuBar>
    );
}
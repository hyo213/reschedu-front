'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import CommonMenuBar from '../components/commonMenuBar';

const DAY_LABELS: Record<string, string> = {
    MONDAY: '월', TUESDAY: '화', WEDNESDAY: '수', THURSDAY: '목',
    FRIDAY: '금', SATURDAY: '토', SUNDAY: '일',
};
// 폼 선택지는 일~토, 그리드 표시는 월~토만
const ALL_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const GRID_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// 상태색과 겹치지 않는 블록 전용 팔레트
const BLOCK_COLORS = [
    'bg-cat-1', 'bg-cat-2', 'bg-cat-3', 'bg-cat-4', 'bg-cat-5', 'bg-cat-6',
];

// uuid 해시로 항상 같은 블록 색을 배정
function colorForClass(uuid: string) {
    let hash = 0;
    for (let i = 0; i < uuid.length; i++) {
        hash = (hash * 31 + uuid.charCodeAt(i)) >>> 0;
    }
    return BLOCK_COLORS[hash % BLOCK_COLORS.length];
}

function toMinutes(hhmm: string) {
    if (!hhmm) return 0;
    const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10));
    return h * 60 + (m || 0);
}

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────

function formatDateISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getMonday(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay(); // 0=일 ... 6=토
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

function addDays(d: Date, amount: number): Date {
    const date = new Date(d);
    date.setDate(date.getDate() + amount);
    return date;
}

function formatDateLabel(d: Date): string {
    const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}(${dow})`;
}

// YYYY-MM-DD 문자열은 사전순 비교로도 날짜 순서가 유지된다
function isEnrollmentActiveOn(student: { enrollmentStartDate: string | null; enrollmentEndDate: string | null }, date: string): boolean {
    if (student.enrollmentStartDate && date < student.enrollmentStartDate) return false;
    if (student.enrollmentEndDate && date > student.enrollmentEndDate) return false;
    return true;
}

const HOUR_HEIGHT = 64; // px

interface RosterStudent {
    uuid: string;
    name: string;
    managementName: string;
    // 수강 기간(표시/필터링용, 관리는 [수강생 관리] 화면)
    enrollmentStartDate: string | null;
    enrollmentEndDate: string | null;
    // 정규 편성이 아닌 보강 매칭으로 들어온 수강생인지 여부
    viaMakeup: boolean;
}

interface TimeSlot {
    dayOfWeek: string;
    startTime: string;
    endTime: string;
}

interface WeeklyOccurrence {
    date: string;
    dayOfWeek: string;
    // 회차별 스냅샷 시각 — 블록 렌더링에 항상 이 값을 사용 (템플릿 timeSlots로 추정 금지)
    startTime: string;
    endTime: string;
    holidayCancelled: boolean;
    // 회차별 정원 스냅샷 (템플릿 정원과 다를 수 있음)
    maxCapacity: number;
    // 결석 제외 후 실제 참여 명단 (학부모 조회 시 본인 자녀로만 제한됨)
    attendingStudents: RosterStudent[];
    absentCount: number;
    // 결석 명단 — 원장/강사 조회 시만 채워짐
    absentStudents: RosterStudent[];
    // 결석 명단 중 본인 자녀만 — 학부모 조회 시만 채워짐
    myAbsentStudents: RosterStudent[];
}

interface RegularClassItem {
    uuid: string;
    title: string | null;
    teacherUuid: string;
    teacherName: string;
    roomNumber: string | null;
    academyName: string;
    maxCapacity: number;
    currentCount: number;
    // 요일별로 다른 시간대 가능, 요일 순 정렬되어 옴
    timeSlots: TimeSlot[];
    students: RosterStudent[];
    weeklyOccurrences: WeeklyOccurrence[];
}

function classDayOfWeeks(cls: RegularClassItem): string[] {
    return cls.timeSlots.map((s) => s.dayOfWeek);
}

interface TeacherOption {
    uuid: string;
    name: string;
}

interface StudentOption {
    uuid: string;
    name: string;
    managementName: string;
    isApproved: boolean;
    enrollmentStartDate: string | null;
    enrollmentEndDate: string | null;
}

interface HolidayItem {
    uuid: string;
    date: string;
    reason: string | null;
    issuedTicketCount: number | null;
}

interface MyChildOption {
    uuid: string;
    name: string;
}

const DEFAULT_SLOT_START = '15:00';
const DEFAULT_SLOT_END = '16:00';

const initialForm = {
    title: '',
    teacherUuid: '',
    roomNumber: '',
    maxCapacity: 10,
    timeSlots: [] as { dayOfWeek: string; startTime: string; endTime: string }[],
    studentUuids: [] as string[],
};

const API_BASE = '/api';

export default function RegularClassesPage() {
    const [myRole, setMyRole] = useState('');
    const [classes, setClasses] = useState<RegularClassItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // 주간 네비게이션 (기본값: 이번 주)
    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getMonday(new Date()));

    // 원장 전용 강사별 필터
    const [teacherFilterOptions, setTeacherFilterOptions] = useState<TeacherOption[]>([]);
    const [selectedTeacherUuid, setSelectedTeacherUuid] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingClass, setEditingClass] = useState<RegularClassItem | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [teachersOptions, setTeachersOptions] = useState<TeacherOption[]>([]);
    const [studentsOptions, setStudentsOptions] = useState<StudentOption[]>([]);
    const [form, setForm] = useState(initialForm);
    // 수강생 체크 목록 필터 기준일: 신규 등록은 오늘, 수정은 클릭한 블록의 날짜
    const [modalReferenceDate, setModalReferenceDate] = useState(() => formatDateISO(new Date()));

    // 담당 강사 변경(효력일 지정): 지정일부터 로스터 전원을 새 강사의 같은 요일·시간 반으로 이관
    const [isChangeTeacherModalOpen, setIsChangeTeacherModalOpen] = useState(false);
    const [changeTeacherForm, setChangeTeacherForm] = useState({ newTeacherUuid: '', effectiveFrom: formatDateISO(new Date()) });
    const [isSubmittingTeacherChange, setIsSubmittingTeacherChange] = useState(false);

    // 반 종료(효력일 지정): 학생 이관 없이 지정일부터 이 반 자체를 없앤다
    const [isDiscontinueModalOpen, setIsDiscontinueModalOpen] = useState(false);
    const [discontinueEffectiveFrom, setDiscontinueEffectiveFrom] = useState(formatDateISO(new Date()));
    const [isSubmittingDiscontinue, setIsSubmittingDiscontinue] = useState(false);
    const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

    // 휴무일 관리 (원장 전용)
    const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
    const [holidays, setHolidays] = useState<HolidayItem[]>([]);
    const [isHolidayLoading, setIsHolidayLoading] = useState(false);
    const [newHolidayDate, setNewHolidayDate] = useState('');
    const [newHolidayReason, setNewHolidayReason] = useState('');
    const [isSubmittingHoliday, setIsSubmittingHoliday] = useState(false);

    // 결석 처리 (학부모: 본인 자녀만 / 원장·강사: 소속 학원 수강생 누구나)
    const [absenceTarget, setAbsenceTarget] = useState<{ cls: RegularClassItem; date: string } | null>(null);
    const [selectedChildUuid, setSelectedChildUuid] = useState('');
    const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false);
    // 취소 처리 중인 학생 uuid — 버튼별 로딩 표시용
    const [isCancellingAbsence, setIsCancellingAbsence] = useState<string | null>(null);

    // 블록 클릭 시 "수정 vs 결석 처리" 선택 모달
    const [blockActionTarget, setBlockActionTarget] = useState<{ cls: RegularClassItem; date: string } | null>(null);

    // 휴무 오버레이 클릭 시 상세(사유 수정/지정 취소) 모달 — 원장 전용
    const [holidayDetailTarget, setHolidayDetailTarget] = useState<HolidayItem | null>(null);
    const [editHolidayReasonInput, setEditHolidayReasonInput] = useState('');
    const [isSavingHolidayReason, setIsSavingHolidayReason] = useState(false);
    const [isCancellingHolidayFromGrid, setIsCancellingHolidayFromGrid] = useState(false);

    const canManage = myRole === 'ADMIN' || myRole === 'TEACHER';

    // 요청 세대 번호로 경합 방지: 가장 나중에 보낸 요청의 응답만 반영 (연타 시 이전 주차로 깜빡이는 것 방지)
    const fetchClassesRequestId = useRef(0);

    useEffect(() => {
        const role = sessionStorage.getItem('userRole') || '';
        setMyRole(role);

        if (role === 'ADMIN') {
            fetchTeacherFilterOptions();
        }
    }, []);

    // 휴무 사유는 그리드에 항상 표시하므로 역할 무관하게 로드
    useEffect(() => {
        if (!myRole) return;
        fetchHolidays();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myRole]);

    // 주차/강사 필터가 바뀔 때마다 재조회
    useEffect(() => {
        if (!myRole) return;
        fetchClasses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myRole, currentWeekStart, selectedTeacherUuid]);

    const fetchTeacherFilterOptions = async () => {
        try {
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.get(`${API_BASE}/members/teachers?academyId=${academyId}`);
            setTeacherFilterOptions(res.data);
        } catch (error) {
            console.error('강사 필터 목록 로딩 실패:', error);
        }
    };

    // 학부모는 본인 자녀 전용 API, 원장/강사는 학원 전체 목록 API
    const fetchClasses = async () => {
        const requestId = ++fetchClassesRequestId.current;
        setIsLoading(true);
        try {
            const weekStartParam = formatDateISO(currentWeekStart);

            if (myRole === 'PARENT') {
                const res = await axios.get(`${API_BASE}/regular-classes/my-children?weekStart=${weekStartParam}`);
                if (requestId === fetchClassesRequestId.current) setClasses(res.data);
                return;
            }

            const academyId = sessionStorage.getItem('academyId');
            const teacherUuid = myRole === 'ADMIN' ? selectedTeacherUuid : sessionStorage.getItem('userUuid');
            let url = `${API_BASE}/regular-classes?academyId=${academyId}&weekStart=${weekStartParam}`;
            if (teacherUuid && teacherUuid.trim() !== '') {
                url += `&teacherUuid=${teacherUuid}`;
            }

            const res = await axios.get(url);
            if (requestId === fetchClassesRequestId.current) setClasses(res.data);
        } catch (error) {
            console.error('시간표 조회 실패:', error);
        } finally {
            if (requestId === fetchClassesRequestId.current) setIsLoading(false);
        }
    };

    // 모달을 열 때 강사·수강생 선택지를 함께 불러온다 (신규 등록/수정 공용)
    const loadFormOptions = async () => {
        const academyId = sessionStorage.getItem('academyId');
        try {
            // 강사는 본인 배정 수강생만, 원장은 전체 수강생
            let studentsUrl = `${API_BASE}/members/students?academyId=${academyId}`;
            if (myRole === 'TEACHER') {
                const teacherUuid = sessionStorage.getItem('userUuid');
                if (teacherUuid && teacherUuid.trim() !== '') {
                    studentsUrl += `&teacherUuid=${teacherUuid}`;
                }
            }

            const requests: Promise<any>[] = [axios.get(studentsUrl)];
            if (myRole === 'ADMIN') {
                requests.push(axios.get(`${API_BASE}/members/teachers?academyId=${academyId}`));
            }
            const [studentsRes, teachersRes] = await Promise.all(requests);
            setStudentsOptions((studentsRes.data as StudentOption[]).filter((s) => s.isApproved));
            if (teachersRes) setTeachersOptions(teachersRes.data);
        } catch (error) {
            console.error('시간표 등록 폼 데이터 로딩 실패:', error);
        }
    };

    const openAddModal = async () => {
        const teacherUuid = sessionStorage.getItem('userUuid') || '';
        await loadFormOptions();
        setEditingClass(null);
        setModalReferenceDate(formatDateISO(new Date()));
        setForm({ ...initialForm, teacherUuid: myRole === 'TEACHER' ? teacherUuid : '' });
        setIsModalOpen(true);
    };

    // referenceDate: 클릭한 블록의 날짜 — 수강생 체크 목록 필터링 기준
    const openEditModal = async (cls: RegularClassItem, referenceDate: string) => {
        if (!canManage) return;
        await loadFormOptions();
        setEditingClass(cls);
        setModalReferenceDate(referenceDate);
        setForm({
            title: cls.title || '',
            teacherUuid: cls.teacherUuid,
            roomNumber: cls.roomNumber || '',
            maxCapacity: cls.maxCapacity,
            timeSlots: cls.timeSlots.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime.slice(0, 5),
                endTime: s.endTime.slice(0, 5),
            })),
            studentUuids: cls.students.map((s) => s.uuid),
        });
        setIsModalOpen(true);
    };

    // 요일=독립 수업 원칙: 신규 등록은 요일 다중 선택으로 배치 생성(직전 시간 이어받음),
    // 수정은 단일 슬롯이므로 요일 버튼이 추가가 아닌 "교체"로 동작(시간 유지)
    const toggleDay = (day: string) => {
        setForm((prev) => {
            if (editingClass) {
                const existing = prev.timeSlots[0];
                return {
                    ...prev,
                    timeSlots: [{
                        dayOfWeek: day,
                        startTime: existing?.startTime || DEFAULT_SLOT_START,
                        endTime: existing?.endTime || DEFAULT_SLOT_END,
                    }],
                };
            }
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

    const updateSlotTime = (day: string, field: 'startTime' | 'endTime', value: string) => {
        setForm((prev) => ({
            ...prev,
            timeSlots: prev.timeSlots.map((s) => (s.dayOfWeek === day ? { ...s, [field]: value } : s)),
        }));
    };

    const toggleStudent = (uuid: string) => {
        setForm((prev) => ({
            ...prev,
            studentUuids: prev.studentUuids.includes(uuid)
                ? prev.studentUuids.filter((u) => u !== uuid)
                : [...prev.studentUuids, uuid],
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (form.timeSlots.length === 0) {
            alert('수업 요일을 최소 1개 이상 선택해주세요.');
            return;
        }
        if (!form.teacherUuid) {
            alert('담당 강사를 선택해주세요.');
            return;
        }
        const invalidSlot = form.timeSlots.find((s) => s.startTime >= s.endTime);
        if (invalidSlot) {
            alert(`${DAY_LABELS[invalidSlot.dayOfWeek]}요일의 종료 시간은 시작 시간보다 이후여야 합니다.`);
            return;
        }

        const payload = {
            title: form.title.trim() || null,
            teacherUuid: form.teacherUuid,
            roomNumber: form.roomNumber.trim() || null,
            maxCapacity: Number(form.maxCapacity),
            timeSlots: form.timeSlots,
            studentUuids: form.studentUuids,
        };

        try {
            setIsSubmitting(true);
            const academyId = sessionStorage.getItem('academyId');

            if (editingClass) {
                await axios.put(
                    `${API_BASE}/regular-classes/${editingClass.uuid}?academyId=${academyId}`,
                    payload
                );
                alert('시간표가 수정되었습니다.');
            } else {
                await axios.post(
                    `${API_BASE}/regular-classes?academyId=${academyId}`,
                    payload
                );
                alert('시간표가 등록되었습니다.');
            }

            setIsModalOpen(false);
            fetchClasses();
        } catch (error: any) {
            const msg = error.response?.data?.message || '시간표 저장 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── 담당 강사 변경 ───────────────────────────────────────────────────

    const openChangeTeacherModal = () => {
        setChangeTeacherForm({ newTeacherUuid: '', effectiveFrom: formatDateISO(new Date()) });
        setIsChangeTeacherModalOpen(true);
    };

    const handleChangeTeacherSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingClass || !changeTeacherForm.newTeacherUuid) {
            alert('새로 배정할 강사를 선택해주세요.');
            return;
        }
        if (!confirm(`${changeTeacherForm.effectiveFrom}부터 담당 강사를 변경하시겠습니까? 그 반의 현재 수강생 전원이 새 강사의 같은 요일·시간 반으로 이관됩니다.`)) return;

        try {
            setIsSubmittingTeacherChange(true);
            const academyId = sessionStorage.getItem('academyId');
            await axios.post(
                `${API_BASE}/regular-classes/${editingClass.uuid}/change-teacher?academyId=${academyId}`,
                changeTeacherForm
            );
            alert('담당 강사가 변경되었습니다. 지정한 날짜부터 시간표에 반영됩니다.');
            setIsChangeTeacherModalOpen(false);
            setIsModalOpen(false);
            fetchClasses();
        } catch (error: any) {
            const msg = error.response?.data?.message || '담당 강사 변경 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmittingTeacherChange(false);
        }
    };

    // ─── 반 종료(효력일 지정) / 완전 삭제 ──────────────────────────────────
    const openDiscontinueModal = () => {
        setDiscontinueEffectiveFrom(formatDateISO(new Date()));
        setIsDiscontinueModalOpen(true);
    };

    const handleDiscontinueSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingClass) return;
        if (!confirm(`${discontinueEffectiveFrom}부터 이 반을 종료하시겠습니까? 배정된 학생들은 그 전날까지만 이 반으로 남고, 다른 반으로 자동 이관되지 않습니다.`)) return;

        try {
            setIsSubmittingDiscontinue(true);
            const academyId = sessionStorage.getItem('academyId');
            await axios.post(
                `${API_BASE}/regular-classes/${editingClass.uuid}/discontinue?academyId=${academyId}`,
                { effectiveFrom: discontinueEffectiveFrom }
            );
            alert('반 종료가 예약되었습니다. 지정한 날짜부터 시간표·보강매칭에서 사라집니다.');
            setIsDiscontinueModalOpen(false);
            setIsModalOpen(false);
            fetchClasses();
        } catch (error: any) {
            const msg = error.response?.data?.message || '반 종료 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmittingDiscontinue(false);
        }
    };

    const handleDeleteClass = async () => {
        if (!editingClass) return;
        if (!confirm('이 반을 완전히 삭제하시겠습니까? 학생 배정/보강 이력이 있으면 삭제할 수 없습니다(대신 [반 종료]를 이용해주세요). 이 작업은 되돌릴 수 없습니다.')) return;

        try {
            setIsSubmittingDelete(true);
            const academyId = sessionStorage.getItem('academyId');
            await axios.delete(`${API_BASE}/regular-classes/${editingClass.uuid}?academyId=${academyId}`);
            alert('반이 삭제되었습니다.');
            setIsModalOpen(false);
            fetchClasses();
        } catch (error: any) {
            const msg = error.response?.data?.message || '반 삭제 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmittingDelete(false);
        }
    };

    // ─── 휴무일 관리 ──────────────────────────────────────────────────────

    const openHolidayModal = async () => {
        setIsHolidayModalOpen(true);
        await fetchHolidays();
    };

    // 학부모는 자녀 소속 학원을 역추적하는 my-children 전용 API 사용
    const fetchHolidays = async () => {
        setIsHolidayLoading(true);
        try {
            const url =
                myRole === 'PARENT'
                    ? `${API_BASE}/academy-holidays/my-children`
                    : `${API_BASE}/academy-holidays?academyId=${sessionStorage.getItem('academyId')}`;
            const res = await axios.get(url);
            setHolidays(res.data);
        } catch (error) {
            console.error('휴무일 목록 로딩 실패:', error);
        } finally {
            setIsHolidayLoading(false);
        }
    };

    const handleAddHoliday = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newHolidayDate) {
            alert('휴무일 날짜를 선택해주세요.');
            return;
        }
        try {
            setIsSubmittingHoliday(true);
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.post(
                `${API_BASE}/academy-holidays?academyId=${academyId}`,
                { date: newHolidayDate, reason: newHolidayReason.trim() || null }
            );
            alert(`휴무일이 등록되었습니다. (자동 발급된 보강권: ${res.data.issuedTicketCount ?? 0}개)`);
            setNewHolidayDate('');
            setNewHolidayReason('');
            await fetchHolidays();
            fetchClasses();
        } catch (error: any) {
            const msg = error.response?.data?.message || '휴무일 등록 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmittingHoliday(false);
        }
    };

    const handleDeleteHoliday = async (holiday: HolidayItem) => {
        if (!confirm(`${holiday.date} 휴무일을 삭제하시겠습니까?\n이 날짜 때문에 자동 발급된 미사용 보강권은 회수됩니다.`)) return;
        try {
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.delete(`${API_BASE}/academy-holidays/${holiday.uuid}?academyId=${academyId}`);
            alert(`휴무일이 삭제되었습니다. (회수된 보강권: ${res.data.retractedTicketCount ?? 0}개)`);
            await fetchHolidays();
            fetchClasses();
        } catch (error: any) {
            const msg = error.response?.data?.message || '휴무일 삭제 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        }
    };

    // ─── 휴무 오버레이 상세(사유 수정/지정 취소) ─────────────────────────────

    const openHolidayDetailModal = (holiday: HolidayItem) => {
        setHolidayDetailTarget(holiday);
        setEditHolidayReasonInput(holiday.reason || '');
    };

    const handleUpdateHolidayReason = async () => {
        if (!holidayDetailTarget) return;
        try {
            setIsSavingHolidayReason(true);
            const academyId = sessionStorage.getItem('academyId');
            await axios.patch(
                `${API_BASE}/academy-holidays/${holidayDetailTarget.uuid}?academyId=${academyId}`,
                { reason: editHolidayReasonInput.trim() || null }
            );
            alert('휴무 사유가 수정되었습니다.');
            setHolidayDetailTarget(null);
            await fetchHolidays();
            fetchClasses();
        } catch (error: any) {
            const msg = error.response?.data?.message || '휴무 사유 수정 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSavingHolidayReason(false);
        }
    };

    const handleCancelHolidayFromGrid = async () => {
        if (!holidayDetailTarget) return;
        if (!confirm(`${holidayDetailTarget.date} 휴무일 지정을 취소하시겠습니까?\n이 날짜 때문에 자동 발급된 미사용 보강권은 회수되고, 수업 칸은 원래 정규 수업 상태로 복원됩니다.`)) return;
        try {
            setIsCancellingHolidayFromGrid(true);
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.delete(
                `${API_BASE}/academy-holidays/${holidayDetailTarget.uuid}?academyId=${academyId}`
            );
            alert(`휴무일 지정이 취소되었습니다. (회수된 보강권: ${res.data.retractedTicketCount ?? 0}개)`);
            setHolidayDetailTarget(null);
            await fetchHolidays();
            fetchClasses();
        } catch (error: any) {
            const msg = error.response?.data?.message || '휴무일 취소 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsCancellingHolidayFromGrid(false);
        }
    };

    // ─── 결석 처리 ──────────────────────────────────────────────────────────

    // 학부모는 본인 자녀만, 원장/강사는 전체 명단 중 선택 가능. 수강 기간 만료 자녀는 제외.
    // date 지정 시 그 날짜에 이미 결석 신청된 수강생은 중복 방지를 위해 제외.
    const getAbsenceStudentOptions = (cls: RegularClassItem, date?: string): MyChildOption[] => {
        const today = formatDateISO(new Date());
        const base = myRole === 'PARENT'
            ? cls.students
                .filter((s) => !s.enrollmentEndDate || s.enrollmentEndDate >= today)
                .map((s) => ({ uuid: s.uuid, name: s.managementName || s.name }))
            : cls.students.map((s) => ({ uuid: s.uuid, name: s.managementName || s.name }));
        if (!date) return base;
        const occ = cls.weeklyOccurrences.find((o) => o.date === date);
        const alreadyAbsent = myRole === 'PARENT' ? occ?.myAbsentStudents : occ?.absentStudents;
        const alreadyAbsentUuids = new Set((alreadyAbsent || []).map((s) => s.uuid));
        return base.filter((b) => !alreadyAbsentUuids.has(b.uuid));
    };

    const openAbsenceModal = (cls: RegularClassItem, date: string) => {
        const options = getAbsenceStudentOptions(cls, date);
        setSelectedChildUuid(options[0]?.uuid || '');
        setAbsenceTarget({ cls, date });
    };

    // 미사용 상태의 보강권만 함께 회수된다
    const handleCancelAbsence = async (studentUuid: string, cls: RegularClassItem, date: string) => {
        if (!confirm(`${date}의 결석 신청을 취소하시겠습니까?\n자동 발급되었던 보강권이 함께 회수됩니다.`)) return;
        try {
            setIsCancellingAbsence(studentUuid);
            await axios.delete(`${API_BASE}/makeup-tickets/absence`, {
                data: { studentUuid, regularClassUuid: cls.uuid, absentDate: date },
            });
            alert('결석 신청이 취소되었습니다.');
            setAbsenceTarget(null);
            setBlockActionTarget(null);
            fetchClasses();
        } catch (error: any) {
            const msg = error.response?.data?.message || '결석 신청 취소 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsCancellingAbsence(null);
        }
    };

    // 원장/강사는 "수정 vs 결석 처리" 선택 모달, 학부모는 바로 결석 신청 모달
    const handleBlockClick = (cls: RegularClassItem, date: string, isHoliday: boolean) => {
        if (canManage) {
            setBlockActionTarget({ cls, date });
        } else if (myRole === 'PARENT' && !isHoliday) {
            openAbsenceModal(cls, date);
        }
    };

    const handleSubmitAbsence = async (overrideLimit: boolean = false) => {
        if (!absenceTarget || !selectedChildUuid) {
            alert('결석 처리할 수강생을 선택해주세요.');
            return;
        }
        if (!overrideLimit && !confirm(`${absenceTarget.date}의 수업을 결석 처리하시겠습니까?\n처리 시 보강권이 1개 자동 발급됩니다.`)) return;

        try {
            setIsSubmittingAbsence(true);
            await axios.post(
                `${API_BASE}/makeup-tickets/absence`,
                { studentUuid: selectedChildUuid, regularClassUuid: absenceTarget.cls.uuid, absentDate: absenceTarget.date, overrideLimit }
            );
            alert('결석 처리가 완료되었습니다. 보강권 1개가 발급되었습니다.');
            setAbsenceTarget(null);
            setBlockActionTarget(null);
            fetchClasses();
        } catch (error: any) {
            // 원장/강사 대리 처리 시에만 409 발생(학부모 본인 신청은 400) — 확인 후 overrideLimit=true로 재요청
            if (error.response?.status === 409 && error.response?.data?.limitExceeded) {
                setIsSubmittingAbsence(false);
                if (confirm(`${error.response.data.message}\n\n그래도 보강권을 발급하시겠습니까?`)) {
                    await handleSubmitAbsence(true);
                }
                return;
            }
            const msg = error.response?.data?.message || '결석 처리 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmittingAbsence(false);
        }
    };

    // ─── 그리드 렌더링 준비 ──────────────────────────────────────────────────

    // 표시 중인 주(월~토)의 요일별 실제 날짜
    const weekDates = useMemo(() => {
        const map: Record<string, string> = {};
        GRID_DAYS.forEach((day, idx) => {
            map[day] = formatDateISO(addDays(currentWeekStart, idx));
        });
        return map;
    }, [currentWeekStart]);

    // 날짜별 휴무일 조회 맵 — 그 날짜 컬럼을 덮을지 판단
    const holidayByDate = useMemo(() => {
        const map: Record<string, HolidayItem> = {};
        holidays.forEach((h) => { map[h.date] = h; });
        return map;
    }, [holidays]);

    // "시간표uuid|날짜" 키로 O(1) 조회 (블록마다 find() 반복 호출 방지)
    const occurrenceByClassAndDate = useMemo(() => {
        const map: Record<string, WeeklyOccurrence> = {};
        classes.forEach((c) => {
            c.weeklyOccurrences.forEach((o) => {
                map[`${c.uuid}|${o.date}`] = o;
            });
        });
        return map;
    }, [classes]);

    const weekRangeLabel = useMemo(() => {
        return `${formatDateLabel(currentWeekStart)} ~ ${formatDateLabel(addDays(currentWeekStart, 5))}`;
    }, [currentWeekStart]);

    const isCurrentWeek = useMemo(() => {
        return formatDateISO(currentWeekStart) === formatDateISO(getMonday(new Date()));
    }, [currentWeekStart]);

    // 그리드 표시 범위를 등록된 수업 시간에 맞춰 동적 계산
    const { startHour, endHour } = useMemo(() => {
        let minH = 9;
        let maxH = 19;
        classes.forEach((c) => {
            c.timeSlots.forEach((slot) => {
                const startH = Math.floor(toMinutes(slot.startTime) / 60);
                const endH = Math.ceil(toMinutes(slot.endTime) / 60);
                if (startH < minH) minH = startH;
                if (endH > maxH) maxH = endH;
            });
        });
        return { startHour: minH, endHour: maxH };
    }, [classes]);

    const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
    const gridHeight = (endHour - startHour) * HOUR_HEIGHT;

    return (
        <CommonMenuBar>
            <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
                <div className="bg-paper-raised p-4 sm:p-6 rounded-lg border border-line shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-4">
                        <div className="space-y-1">
                            <h3 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                                <span>🏫</span> {myRole === 'PARENT' ? '자녀 수강 시간표' : '정규 수업 시간표 관리'}
                            </h3>
                            <p className="text-ink-faint text-xs leading-relaxed max-w-md">
                                {myRole === 'PARENT'
                                    ? '자녀가 편성되어 있는 정규 수업 시간표를 주차별로 조회하고, 결석 신청을 할 수 있습니다.'
                                    : '요일 · 시간 · 수강생 명단을 포함한 정규 시간표를 추가하고, 블록을 클릭해 수정할 수 있습니다.'}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {canManage && (
                                <button
                                    type="button"
                                    onClick={openHolidayModal}
                                    className="px-4 py-2.5 sm:py-2 text-xs font-bold bg-paper-raised hover:bg-line-soft text-ink-soft border border-line rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
                                >
                                    <span>🏖️</span>
                                    <span>휴무일 관리</span>
                                </button>
                            )}
                            {canManage && (
                                <button
                                    type="button"
                                    onClick={openAddModal}
                                    className="px-4 py-2.5 sm:py-2 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 active:scale-98"
                                >
                                    <span>➕</span>
                                    <span>시간표 추가</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 원장 전용 강사별 필터 */}
                    {myRole === 'ADMIN' && (
                        <div className="mb-4 flex items-center gap-2">
                            <label className="text-xs font-bold text-ink-faint">👨‍🏫 선생님별 조회</label>
                            <select
                                value={selectedTeacherUuid}
                                onChange={(e) => setSelectedTeacherUuid(e.target.value)}
                                className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg outline-none bg-paper-raised text-ink-soft"
                            >
                                <option value="">전체 선생님</option>
                                {teacherFilterOptions.map((t) => (
                                    <option key={t.uuid} value={t.uuid}>{t.name} 선생님</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* 주간 날짜 네비게이션 */}
                    <div className="mb-4 flex items-center justify-center gap-3 bg-line-soft border border-line-soft rounded-lg py-2.5">
                        <button
                            type="button"
                            onClick={() => setCurrentWeekStart((prev) => addDays(prev, -7))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-paper-raised border border-line text-ink-soft hover:bg-line-soft transition font-bold"
                        >
                            &lt;
                        </button>
                        <div className="text-sm font-bold text-ink min-w-[220px] text-center">
                            {weekRangeLabel}
                            {isCurrentWeek && <span className="ml-2 text-[10px] font-bold text-accent bg-accent-soft px-1.5 py-0.5 rounded">이번 주</span>}
                        </div>
                        <button
                            type="button"
                            onClick={() => setCurrentWeekStart((prev) => addDays(prev, 7))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-paper-raised border border-line text-ink-soft hover:bg-line-soft transition font-bold"
                        >
                            &gt;
                        </button>
                        {!isCurrentWeek && (
                            <button
                                type="button"
                                onClick={() => setCurrentWeekStart(getMonday(new Date()))}
                                className="ml-1 px-2.5 py-1 text-[11px] font-bold text-accent hover:bg-accent-soft rounded-lg transition"
                            >
                                오늘로
                            </button>
                        )}
                    </div>

                    {isLoading ? (
                        <div className="p-8 text-center text-ink-faint text-sm font-medium">불러오는 중..</div>
                    ) : classes.length === 0 ? (
                        <div className="p-8 text-center text-ink-faint font-medium border border-line-soft rounded-lg bg-line-soft/50">
                            {myRole === 'PARENT' ? '자녀가 편성된 시간표가 아직 없습니다.' : '등록된 시간표가 없습니다.'}
                        </div>
                    ) : (
                        <>
                        {/* 데스크톱: 요일×시간 그리드 뷰 */}
                        <div className="hidden sm:block border border-line rounded-lg overflow-x-auto">
                            <div className="flex min-w-[640px]">
                                {/* 시간축 라벨 컬럼 */}
                                <div className="w-12 flex-shrink-0 border-r border-line-soft">
                                    <div className="h-10 border-b border-line-soft bg-line-soft/70" />
                                    <div className="relative" style={{ height: gridHeight }}>
                                        {hours.map((h, i) => (
                                            <div
                                                key={h}
                                                style={{ top: i * HOUR_HEIGHT }}
                                                className="absolute -translate-y-1/2 right-1.5 text-[10px] text-ink-faint font-medium"
                                            >
                                                {h}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 요일별 컬럼 */}
                                {GRID_DAYS.map((day) => {
                                    const dateForDay = weekDates[day];
                                    const dayClasses = classes.filter((c) => classDayOfWeeks(c).includes(day));
                                    const holidayForDay = holidayByDate[dateForDay];
                                    return (
                                        <div key={day} className="flex-1 min-w-[100px] border-r border-line-soft last:border-r-0">
                                            <div className="h-10 flex flex-col items-center justify-center text-xs font-bold text-ink-soft border-b border-line-soft bg-line-soft/70 leading-tight">
                                                <span>{DAY_LABELS[day]}</span>
                                                <span className="text-[9px] text-ink-faint font-medium">{dateForDay?.slice(5)}</span>
                                            </div>
                                            <div className="relative" style={{ height: gridHeight }}>
                                                {hours.map((h, i) => (
                                                    <div
                                                        key={h}
                                                        style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                                                        className="absolute left-0 right-0 border-b border-line-soft"
                                                    />
                                                ))}

                                                {holidayForDay ? (
                                                    // 휴무일은 개별 블록 대신 요일 컬럼 전체를 덮어 사유 표시 (클릭은 canManage만)
                                                    <button
                                                        type="button"
                                                        disabled={!canManage}
                                                        onClick={() => openHolidayDetailModal(holidayForDay)}
                                                        style={{ top: 0, height: gridHeight }}
                                                        className={`absolute left-0.5 right-0.5 rounded-lg bg-line/80 border border-line text-ink-soft flex flex-col items-center justify-center text-center px-2 gap-1 transition ${
                                                            canManage ? 'hover:bg-line cursor-pointer' : 'cursor-default'
                                                        }`}
                                                    >
                                                        <span className="text-lg leading-none">🏖️</span>
                                                        <span className="text-[11px] font-bold leading-tight">휴무일</span>
                                                        {holidayForDay.reason && (
                                                            <span className="text-[10px] leading-tight break-keep">{holidayForDay.reason}</span>
                                                        )}
                                                    </button>
                                                ) : dayClasses.map((c) => {
                                                    // occurrence 없음 = 서버가 이미 목록에서 제외한 회차 → 블록 자체를 그리지 않음
                                                    const occurrence = occurrenceByClassAndDate[`${c.uuid}|${dateForDay}`];
                                                    if (!occurrence) return null;

                                                    const top = (toMinutes(occurrence.startTime) - startHour * 60) / 60 * HOUR_HEIGHT;
                                                    const height = Math.max(
                                                        (toMinutes(occurrence.endTime) - toMinutes(occurrence.startTime)) / 60 * HOUR_HEIGHT,
                                                        22
                                                    );
                                                    const isHoliday = occurrence.holidayCancelled;
                                                    const names = occurrence.attendingStudents.map((s) => `${s.managementName || s.name}${s.viaMakeup ? '(보강)' : ''}`);
                                                    const shown = names.slice(0, 4);
                                                    const extra = names.length - shown.length;
                                                    const color = colorForClass(c.uuid);

                                                    const isClickable = canManage || (myRole === 'PARENT' && !isHoliday);

                                                    return (
                                                        <button
                                                            key={c.uuid}
                                                            type="button"
                                                            disabled={!isClickable}
                                                            onClick={() => handleBlockClick(c, dateForDay, isHoliday)}
                                                            style={{ top, height }}
                                                            className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 text-left overflow-hidden shadow-sm transition ${
                                                                isHoliday
                                                                    ? 'bg-line text-ink-faint'
                                                                    : `${color} text-paper-raised`
                                                            } ${isClickable ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}`}
                                                        >
                                                            {isHoliday ? (
                                                                <div className="text-[11px] font-bold leading-tight">🏖️ 휴무</div>
                                                            ) : myRole === 'PARENT' ? (
                                                                // 학부모 뷰: 정원/타 수강생 명단 숨기고 본인 자녀 이름·결석 여부만 표시
                                                                <>
                                                                    <div className="text-[10px] leading-tight opacity-80 truncate">{c.academyName}</div>
                                                                    <div className="text-[11px] font-bold leading-tight truncate">{c.title || `${c.teacherName} 선생님 수업`}</div>
                                                                    {c.roomNumber && (
                                                                        <div className="text-[10px] leading-tight opacity-90 truncate">{c.roomNumber}</div>
                                                                    )}
                                                                    <div className="mt-0.5 space-y-0.5">
                                                                        {occurrence.attendingStudents.map((s) => (
                                                                            <div key={s.uuid} className="text-[10px] leading-tight font-semibold truncate">
                                                                                {s.managementName || s.name}({s.viaMakeup ? '보강' : '수강'})
                                                                            </div>
                                                                        ))}
                                                                        {occurrence.myAbsentStudents.map((s) => (
                                                                            <div key={s.uuid} className="text-[10px] leading-tight font-bold truncate">
                                                                                {s.managementName || s.name}(결석)
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    {c.title && (
                                                                        <div className="text-[11px] font-bold leading-tight truncate">{c.title}</div>
                                                                    )}
                                                                    {c.roomNumber && (
                                                                        <div className="text-[10px] leading-tight opacity-90 truncate">{c.roomNumber}</div>
                                                                    )}
                                                                    <div className="text-[10px] leading-tight opacity-90">
                                                                        정원 {occurrence.attendingStudents.length}/{occurrence.maxCapacity}
                                                                        {occurrence.absentCount > 0 && ` · 결석 ${occurrence.absentCount}명`}
                                                                    </div>
                                                                    {shown.length > 0 && (
                                                                        <div className="text-[10px] leading-tight opacity-90 truncate">
                                                                            {shown.join(', ')}
                                                                            {extra > 0 ? ` 외 ${extra}명` : ''}
                                                                        </div>
                                                                    )}
                                                                    {occurrence.absentStudents.length > 0 && (
                                                                        <div className="text-[10px] leading-tight font-bold truncate">
                                                                            {occurrence.absentStudents.map((s) => `${s.managementName || s.name}(결석)`).join(', ')}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 모바일: 요일별 세로 아젠다 뷰 */}
                        <div className="sm:hidden space-y-3">
                            {GRID_DAYS.map((day) => {
                                const dateForDay = weekDates[day];
                                const holidayForDay = holidayByDate[dateForDay];
                                const isToday = dateForDay === formatDateISO(new Date());
                                const dayClasses = classes
                                    .filter((c) => classDayOfWeeks(c).includes(day) && occurrenceByClassAndDate[`${c.uuid}|${dateForDay}`])
                                    .sort((a, b) => {
                                        const aOcc = occurrenceByClassAndDate[`${a.uuid}|${dateForDay}`];
                                        const bOcc = occurrenceByClassAndDate[`${b.uuid}|${dateForDay}`];
                                        return toMinutes(aOcc.startTime) - toMinutes(bOcc.startTime);
                                    });

                                return (
                                    <div key={day} className="border border-line rounded-lg overflow-hidden bg-paper-raised">
                                        <div className={`px-3 py-2 border-b border-line-soft flex items-center justify-between ${isToday ? 'bg-accent-soft' : 'bg-line-soft'}`}>
                                            <span className="text-sm font-bold text-ink-soft">
                                                {DAY_LABELS[day]}요일 <span className="text-ink-faint font-medium">{dateForDay?.slice(5)}</span>
                                            </span>
                                            {isToday && (
                                                <span className="text-[10px] font-bold text-accent bg-accent-soft px-1.5 py-0.5 rounded">오늘</span>
                                            )}
                                        </div>

                                        {holidayForDay ? (
                                            <button
                                                type="button"
                                                disabled={!canManage}
                                                onClick={() => openHolidayDetailModal(holidayForDay)}
                                                className={`w-full flex items-center gap-2.5 px-3 py-3.5 text-left ${canManage ? 'hover:bg-line-soft active:bg-line-soft cursor-pointer' : 'cursor-default'}`}
                                            >
                                                <span className="text-xl">🏖️</span>
                                                <div>
                                                    <div className="text-sm font-bold text-ink-soft">휴무일</div>
                                                    {holidayForDay.reason && (
                                                        <div className="text-xs text-ink-faint mt-0.5">{holidayForDay.reason}</div>
                                                    )}
                                                </div>
                                            </button>
                                        ) : dayClasses.length === 0 ? (
                                            <div className="px-3 py-4 text-center text-xs text-line">수업 없음</div>
                                        ) : (
                                            <div className="divide-y divide-line-soft">
                                                {dayClasses.map((c) => {
                                                    const occurrence = occurrenceByClassAndDate[`${c.uuid}|${dateForDay}`];
                                                    const isHoliday = occurrence.holidayCancelled;
                                                    const isClickable = canManage || (myRole === 'PARENT' && !isHoliday);
                                                    const color = colorForClass(c.uuid);

                                                    return (
                                                        <button
                                                            key={c.uuid}
                                                            type="button"
                                                            disabled={!isClickable}
                                                            onClick={() => handleBlockClick(c, dateForDay, isHoliday)}
                                                            className={`w-full flex items-start gap-3 px-3 py-3 text-left transition ${isClickable ? 'hover:bg-line-soft active:bg-line-soft' : ''}`}
                                                        >
                                                            <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${isHoliday ? 'bg-line' : color}`} />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs font-bold text-ink-faint">
                                                                    {occurrence.startTime.slice(0, 5)} ~ {occurrence.endTime.slice(0, 5)}
                                                                </div>
                                                                {isHoliday ? (
                                                                    <div className="text-sm font-bold text-ink-faint mt-0.5">🏖️ 휴무</div>
                                                                ) : myRole === 'PARENT' ? (
                                                                    <>
                                                                        <div className="text-sm font-bold text-ink mt-0.5 truncate">
                                                                            {c.title || `${c.teacherName} 선생님 수업`}
                                                                        </div>
                                                                        <div className="text-xs text-ink-faint truncate">
                                                                            {c.academyName}{c.roomNumber ? ` · ${c.roomNumber}` : ''}
                                                                        </div>
                                                                        <div className="mt-1 space-y-0.5">
                                                                            {occurrence.attendingStudents.map((s) => (
                                                                                <div key={s.uuid} className="text-xs font-semibold text-ink-soft">
                                                                                    {s.managementName || s.name}({s.viaMakeup ? '보강' : '수강'})
                                                                                </div>
                                                                            ))}
                                                                            {occurrence.myAbsentStudents.map((s) => (
                                                                                <div key={s.uuid} className="text-xs font-bold text-danger">
                                                                                    {s.managementName || s.name}(결석)
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        {c.title && (
                                                                            <div className="text-sm font-bold text-ink mt-0.5 truncate">{c.title}</div>
                                                                        )}
                                                                        {c.roomNumber && (
                                                                            <div className="text-xs text-ink-faint truncate">{c.roomNumber}</div>
                                                                        )}
                                                                        <div className="text-xs text-ink-faint mt-0.5">
                                                                            정원 {occurrence.attendingStudents.length}/{occurrence.maxCapacity}
                                                                            {occurrence.absentCount > 0 && ` · 결석 ${occurrence.absentCount}명`}
                                                                        </div>
                                                                        {occurrence.attendingStudents.length > 0 && (
                                                                            <div className="text-xs text-ink-faint truncate mt-0.5">
                                                                                {occurrence.attendingStudents.map((s) => `${s.managementName || s.name}${s.viaMakeup ? '(보강)' : ''}`).join(', ')}
                                                                            </div>
                                                                        )}
                                                                        {occurrence.absentStudents.length > 0 && (
                                                                            <div className="text-xs font-bold text-danger truncate mt-0.5">
                                                                                {occurrence.absentStudents.map((s) => `${s.managementName || s.name}(결석)`).join(', ')}
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        </>
                    )}
                </div>

                {/* 시간표 추가/수정 모달 (원장/강사 전용, 신규·편집 공용) */}
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-paper-raised w-full max-w-2xl rounded-lg shadow-lg my-8 animate-fade-in">
                            <form onSubmit={handleSubmit}>
                                <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold text-ink">
                                            🏫 정규 수업 시간표 {editingClass ? '수정' : '추가'}
                                        </h3>
                                        <p className="text-xs text-ink-faint mt-1">
                                            {editingClass
                                                ? '요일, 시간, 수강생 명단을 수정합니다.'
                                                : '요일, 시간, 수강생 명단을 입력해 새 시간표를 등록합니다.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                </div>

                                <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1">수업명 (선택)</label>
                                            <input
                                                type="text"
                                                value={form.title}
                                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                                placeholder="어린이 수영 A반"
                                                className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1">강의실 호수 (선택)</label>
                                            <input
                                                type="text"
                                                value={form.roomNumber}
                                                onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
                                                placeholder="3강의실"
                                                className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1">담당 강사 *</label>
                                            {editingClass ? (
                                                // 담당 강사는 즉시 덮어쓰지 않고 효력일 지정 액션으로만 변경
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={(() => {
                                                            const name = teachersOptions.find((t) => t.uuid === form.teacherUuid)?.name;
                                                            return name ? `${name} 선생님` : '알 수 없음';
                                                        })()}
                                                        disabled
                                                        className="flex-1 px-3 py-2.5 text-sm border border-line bg-line-soft rounded-lg text-ink-faint outline-none cursor-not-allowed"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={openChangeTeacherModal}
                                                        className="shrink-0 px-3 py-2.5 text-xs font-bold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition"
                                                    >
                                                        변경
                                                    </button>
                                                </div>
                                            ) : myRole === 'ADMIN' ? (
                                                <select
                                                    required
                                                    value={form.teacherUuid}
                                                    onChange={(e) => setForm({ ...form, teacherUuid: e.target.value })}
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
                                                value={form.maxCapacity}
                                                onChange={(e) => setForm({ ...form, maxCapacity: Number(e.target.value) })}
                                                className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-ink-soft mb-1.5">수업 요일 *</label>
                                        <p className="text-[11px] text-ink-faint -mt-0.5 mb-2">
                                            {editingClass
                                                ? '이 수업은 하나의 요일만 가집니다 — 다른 요일을 누르면 그 요일로 교체됩니다(시간은 유지). 요일을 추가하려면 취소 후 [시간표 추가]로 새로 등록해주세요.'
                                                : '요일마다 완전히 독립된 별개의 수업으로 각각 등록됩니다(같은 강사가 같은 요일·시간에 이미 진행 중인 수업이 있다면 그 수업에 합류합니다). 요일을 켜면 그 요일의 시간을 따로 입력할 수 있습니다(예: 월 15시, 수 17시, 금 20시).'}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {ALL_DAYS.map((day) => (
                                                <button
                                                    type="button"
                                                    key={day}
                                                    onClick={() => toggleDay(day)}
                                                    className={`w-10 h-10 rounded-full text-xs font-bold border transition ${
                                                        form.timeSlots.some((s) => s.dayOfWeek === day)
                                                            ? 'bg-accent border-accent text-paper-raised'
                                                            : 'bg-paper-raised border-line text-ink-soft hover:bg-line-soft'
                                                    }`}
                                                >
                                                    {DAY_LABELS[day]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {form.timeSlots.length > 0 && (
                                        <div className="space-y-2">
                                            <label className="block text-xs font-semibold text-ink-soft mb-1">요일별 시간 *</label>
                                            {form.timeSlots.map((slot) => (
                                                <div key={slot.dayOfWeek} className="flex items-center gap-2">
                                                    <span className="w-8 flex-shrink-0 text-center text-xs font-bold text-ink-soft bg-line-soft rounded-lg py-2">
                                                        {DAY_LABELS[slot.dayOfWeek]}
                                                    </span>
                                                    <input
                                                        type="time"
                                                        required
                                                        value={slot.startTime}
                                                        onChange={(e) => updateSlotTime(slot.dayOfWeek, 'startTime', e.target.value)}
                                                        className="flex-1 px-3 py-2 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                    />
                                                    <span className="text-ink-faint text-xs">~</span>
                                                    <input
                                                        type="time"
                                                        required
                                                        value={slot.endTime}
                                                        onChange={(e) => updateSlotTime(slot.dayOfWeek, 'endTime', e.target.value)}
                                                        className="flex-1 px-3 py-2 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                                            수강생 명단 (선택, {modalReferenceDate} 기준 수강 기간이 유효한 원생만 표시)
                                        </label>
                                        {(() => {
                                            // 기존 로스터는 기간 무관 항상 노출(체크 해제로만 제외 가능, 실수로 누락 방지).
                                            // 신규 후보는 modalReferenceDate 기준 수강 기간 유효한 학생만.
                                            const existingRosterUuids = new Set((editingClass?.students || []).map((s) => s.uuid));
                                            const visibleOptions = studentsOptions.filter(
                                                (s) => existingRosterUuids.has(s.uuid) || isEnrollmentActiveOn(s, modalReferenceDate)
                                            );

                                            if (visibleOptions.length === 0) {
                                                return (
                                                    <div className="p-3 text-xs text-ink-faint border border-line-soft rounded-lg bg-line-soft/50">
                                                        {modalReferenceDate} 기준으로 등록 가능한(승인 완료+수강 기간 유효) 수강생이 없습니다.
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div className="border border-line rounded-lg max-h-48 overflow-y-auto divide-y divide-line-soft">
                                                    {visibleOptions.map((s) => {
                                                        const isOutOfPeriod = !isEnrollmentActiveOn(s, modalReferenceDate);
                                                        return (
                                                            <label key={s.uuid} className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-soft cursor-pointer hover:bg-line-soft">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={form.studentUuids.includes(s.uuid)}
                                                                    onChange={() => toggleStudent(s.uuid)}
                                                                    className="accent-[var(--color-accent)]"
                                                                />
                                                                <span className="font-medium">{s.managementName || s.name}</span>
                                                                {s.managementName && s.managementName !== s.name && (
                                                                    <span className="text-ink-faint text-xs">({s.name})</span>
                                                                )}
                                                                {isOutOfPeriod && (
                                                                    <span className="text-[10px] text-warning font-semibold ml-auto whitespace-nowrap">
                                                                        ⚠️ {modalReferenceDate} 기준 수강 기간 외
                                                                    </span>
                                                                )}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                        <p className="text-[11px] text-ink-faint mt-1.5">
                                            💡 수강 기간(수강료 납부 기간)은 [수강생 관리] 화면에서 관리합니다.
                                        </p>
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        {editingClass && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={openDiscontinueModal}
                                                    className="px-3 py-2 text-xs font-bold text-warning hover:bg-warning-soft rounded-lg transition"
                                                >
                                                    🚫 반 종료
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleDeleteClass}
                                                    disabled={isSubmittingDelete}
                                                    className="px-3 py-2 text-xs font-bold text-danger hover:bg-danger-soft rounded-lg transition disabled:opacity-50"
                                                >
                                                    {isSubmittingDelete ? '삭제 중..' : '🗑 완전 삭제'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsModalOpen(false)}
                                            className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                        >
                                            취소
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="px-5 py-2 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                        >
                                            {isSubmitting ? '저장 중..' : editingClass ? '✨ 수정 완료' : '✨ 시간표 등록'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* 👨‍🏫 담당 강사 변경(효력일 지정) 모달 */}
                {isChangeTeacherModalOpen && editingClass && (
                    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-paper-raised w-full max-w-sm rounded-lg shadow-lg my-8 animate-fade-in">
                            <form onSubmit={handleChangeTeacherSubmit}>
                                <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-ink">👨‍🏫 담당 강사 변경</h3>
                                    <button
                                        type="button"
                                        onClick={() => setIsChangeTeacherModalOpen(false)}
                                        className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                </div>

                                <div className="p-6 space-y-4">
                                    <p className="text-xs text-ink-faint leading-relaxed">
                                        지정한 날짜부터 이 반의 현재 수강생 전원이 새 강사의 같은 요일·시간 반으로 이관됩니다
                                        (새 강사에게 이미 그 시간에 반이 있으면 합류, 없으면 새로 만들어집니다).
                                        그 날짜 이전 기록은 기존 강사로 그대로 남습니다.
                                    </p>
                                    <div>
                                        <label className="block text-xs font-semibold text-ink-soft mb-1">새 담당 강사 *</label>
                                        <select
                                            required
                                            value={changeTeacherForm.newTeacherUuid}
                                            onChange={(e) => setChangeTeacherForm({ ...changeTeacherForm, newTeacherUuid: e.target.value })}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        >
                                            <option value="">강사 선택</option>
                                            {teachersOptions
                                                .filter((t) => t.uuid !== form.teacherUuid)
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
                                            value={changeTeacherForm.effectiveFrom}
                                            onChange={(e) => setChangeTeacherForm({ ...changeTeacherForm, effectiveFrom: e.target.value })}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        />
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsChangeTeacherModalOpen(false)}
                                        className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmittingTeacherChange}
                                        className="px-4 py-2 text-xs font-bold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition disabled:opacity-50"
                                    >
                                        {isSubmittingTeacherChange ? '변경 중..' : '변경'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* 🚫 반 종료(효력일 지정) 모달 */}
                {isDiscontinueModalOpen && editingClass && (
                    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-paper-raised w-full max-w-sm rounded-lg shadow-lg my-8 animate-fade-in">
                            <form onSubmit={handleDiscontinueSubmit}>
                                <div className="p-6 bg-gradient-to-r from-warning-soft to-danger-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-ink">🚫 반 종료</h3>
                                    <button
                                        type="button"
                                        onClick={() => setIsDiscontinueModalOpen(false)}
                                        className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                </div>

                                <div className="p-6 space-y-4">
                                    <p className="text-xs text-ink-faint leading-relaxed">
                                        지정한 날짜부터 이 반(요일·시간)이 시간표·보강매칭에서 사라집니다. 배정되어 있던
                                        학생들은 그 전날까지만 이 반으로 남고, 다른 반으로 자동 이관되지 않습니다
                                        (다른 요일 배정은 그대로 유지됩니다). 그 이전 기록은 [수강 히스토리]에 남습니다.
                                    </p>
                                    <div>
                                        <label className="block text-xs font-semibold text-ink-soft mb-1">적용 시작일 *</label>
                                        <input
                                            type="date"
                                            required
                                            value={discontinueEffectiveFrom}
                                            onChange={(e) => setDiscontinueEffectiveFrom(e.target.value)}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        />
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsDiscontinueModalOpen(false)}
                                        className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmittingDiscontinue}
                                        className="px-4 py-2 text-xs font-bold text-paper-raised bg-warning hover:brightness-95 rounded-lg transition disabled:opacity-50"
                                    >
                                        {isSubmittingDiscontinue ? '처리 중..' : '반 종료'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* 🏖️ 휴무일 관리 모달 (원장 전용) */}
                {isHolidayModalOpen && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-paper-raised w-full max-w-md rounded-lg shadow-lg my-8 animate-fade-in">
                            <div className="p-6 bg-gradient-to-r from-warning-soft to-accent-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-ink">🏖️ 학원 휴무일 관리</h3>
                                    <p className="text-xs text-ink-faint mt-1">등록한 날짜는 정규 수업이 자동 취소되고, 수강생 전원에게 보강권이 발급됩니다.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsHolidayModalOpen(false)}
                                    className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>

                            <form onSubmit={handleAddHoliday} className="p-6 pb-4 space-y-3 border-b border-line-soft">
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="date"
                                        required
                                        value={newHolidayDate}
                                        onChange={(e) => setNewHolidayDate(e.target.value)}
                                        className="px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    />
                                    <input
                                        type="text"
                                        value={newHolidayReason}
                                        onChange={(e) => setNewHolidayReason(e.target.value)}
                                        placeholder="사유 (선택)"
                                        className="px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isSubmittingHoliday}
                                    className="w-full py-2.5 text-xs font-bold bg-warning hover:bg-warning-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                >
                                    {isSubmittingHoliday ? '등록 중..' : '➕ 휴무일 추가'}
                                </button>
                            </form>

                            <div className="p-6 pt-4 max-h-64 overflow-y-auto space-y-2">
                                {isHolidayLoading ? (
                                    <div className="text-center text-xs text-ink-faint py-4">불러오는 중..</div>
                                ) : holidays.length === 0 ? (
                                    <div className="text-center text-xs text-ink-faint py-4">등록된 휴무일이 없습니다.</div>
                                ) : (
                                    holidays.map((h) => (
                                        <div key={h.uuid} className="flex items-center justify-between p-2.5 border border-line-soft rounded-lg">
                                            <div>
                                                <span className="text-sm font-bold text-ink">{h.date}</span>
                                                {h.reason && <span className="ml-2 text-xs text-ink-faint">{h.reason}</span>}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteHoliday(h)}
                                                className="text-xs text-danger hover:text-danger font-bold px-2 py-1 hover:bg-danger-soft rounded-lg transition"
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 원장/강사 전용: 블록 클릭 시 "수정 vs 결석 처리" 액션 선택 모달 */}
                {blockActionTarget && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-paper-raised w-full max-w-xs rounded-lg shadow-lg p-5 space-y-3 animate-fade-in">
                            <div>
                                <div className="text-sm font-bold text-ink">
                                    {blockActionTarget.cls.title || `${blockActionTarget.cls.teacherName} 선생님 수업`}
                                </div>
                                <div className="text-xs text-ink-faint mt-0.5">📅 {blockActionTarget.date}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    const target = blockActionTarget;
                                    setBlockActionTarget(null);
                                    openEditModal(target.cls, target.date);
                                }}
                                className="w-full py-2.5 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition"
                            >
                                ✏️ 시간표 수정
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const target = blockActionTarget;
                                    setBlockActionTarget(null);
                                    openAbsenceModal(target.cls, target.date);
                                }}
                                className="w-full py-2.5 text-xs font-bold bg-danger hover:bg-danger-hover text-paper-raised rounded-lg shadow-sm transition"
                            >
                                🙋 결석 처리
                            </button>
                            <button
                                type="button"
                                onClick={() => setBlockActionTarget(null)}
                                className="w-full py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                            >
                                취소
                            </button>
                        </div>
                    </div>
                )}

                {/* 🏖️ 그리드 휴무 오버레이 클릭 시 상세 모달 (원장 전용: 사유 수정 또는 지정 취소) */}
                {holidayDetailTarget && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-paper-raised w-full max-w-sm rounded-lg shadow-lg my-8 animate-fade-in">
                            <div className="p-6 bg-gradient-to-r from-warning-soft to-accent-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-ink">🏖️ 휴무일 상세</h3>
                                    <p className="text-xs text-ink-faint mt-1">📅 {holidayDetailTarget.date}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setHolidayDetailTarget(null)}
                                    className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1.5">휴무 사유</label>
                                    <input
                                        type="text"
                                        value={editHolidayReasonInput}
                                        onChange={(e) => setEditHolidayReasonInput(e.target.value)}
                                        placeholder="사유 입력 (선택)"
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleUpdateHolidayReason}
                                    disabled={isSavingHolidayReason || isCancellingHolidayFromGrid}
                                    className="w-full py-2.5 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                >
                                    {isSavingHolidayReason ? '저장 중..' : '✏️ 사유 수정 저장'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCancelHolidayFromGrid}
                                    disabled={isSavingHolidayReason || isCancellingHolidayFromGrid}
                                    className="w-full py-2.5 text-xs font-bold bg-danger hover:bg-danger-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                >
                                    {isCancellingHolidayFromGrid ? '처리 중..' : '🗑️ 휴무일 지정 취소'}
                                </button>
                                <p className="text-[11px] text-ink-faint leading-relaxed">
                                    💡 지정 취소 시 이 날짜 때문에 자동 발급되었던 미사용 보강권이 학생별로 회수되고, 수업 칸은 원래 정규 수업 상태로 복원됩니다.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* 🙋 결석 처리 모달 (학부모: 본인 자녀 / 원장·강사: 소속 학원 수강생) */}
                {absenceTarget && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-paper-raised w-full max-w-sm rounded-lg shadow-lg my-8 animate-fade-in">
                            <div className="p-6 bg-gradient-to-r from-danger-soft to-accent-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-ink">🙋 결석 처리</h3>
                                    <p className="text-xs text-ink-faint mt-1">처리 즉시 이 날짜만 결석 처리되고, 보강권이 1개 자동 발급됩니다.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAbsenceTarget(null)}
                                    className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {(() => {
                                    const occ = absenceTarget.cls.weeklyOccurrences.find((o) => o.date === absenceTarget.date);
                                    const alreadyAbsent = (myRole === 'PARENT' ? occ?.myAbsentStudents : occ?.absentStudents) || [];
                                    return (
                                        <>
                                        <div className="p-3.5 bg-line-soft rounded-lg border border-line-soft text-sm">
                                            <div className="font-bold text-ink">{absenceTarget.cls.title || `${absenceTarget.cls.teacherName} 선생님 수업`}</div>
                                            <div className="text-xs text-ink-faint mt-1">
                                                📅 {absenceTarget.date}{occ && ` · 🕒 ${occ.startTime.slice(0, 5)}~${occ.endTime.slice(0, 5)}`}
                                            </div>
                                        </div>
                                        {alreadyAbsent.length > 0 &&
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                                                이미 결석 신청된 수강생
                                            </label>
                                            <div className="space-y-1.5">
                                                {alreadyAbsent.map((s) => (
                                                    <div key={s.uuid} className="flex items-center justify-between px-3 py-2 bg-danger-soft border border-danger-soft rounded-lg">
                                                        <span className="text-sm font-semibold text-danger">{s.managementName || s.name}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCancelAbsence(s.uuid, absenceTarget.cls, absenceTarget.date)}
                                                            disabled={isCancellingAbsence === s.uuid}
                                                            className="text-xs font-bold text-danger hover:text-danger px-2 py-1 hover:bg-danger-soft rounded-lg transition disabled:opacity-50"
                                                        >
                                                            {isCancellingAbsence === s.uuid ? '취소 중..' : '↩️ 결석 취소'}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        }
                                        </>
                                    );
                                })()}

                                {(() => {
                                    const absenceOptions = getAbsenceStudentOptions(absenceTarget.cls, absenceTarget.date);
                                    return (
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                                                {myRole === 'PARENT' ? '결석할 자녀 선택 *' : '결석 처리할 수강생 선택 *'}
                                            </label>
                                            {absenceOptions.length === 0 ? (
                                                <div className="p-3 text-xs text-ink-faint border border-line-soft rounded-lg bg-line-soft/50">
                                                    {myRole === 'PARENT' ? '결석 신청 가능한 자녀가 없습니다.' : '결석 처리 가능한 수강생이 없습니다.'}
                                                </div>
                                            ) : (
                                                <select
                                                    value={selectedChildUuid}
                                                    onChange={(e) => setSelectedChildUuid(e.target.value)}
                                                    className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                >
                                                    {absenceOptions.map((option) => (
                                                        <option key={option.uuid} value={option.uuid}>{option.name}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setAbsenceTarget(null)}
                                    className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSubmitAbsence()}
                                    disabled={isSubmittingAbsence || !selectedChildUuid}
                                    className="px-5 py-2 text-xs font-bold bg-danger hover:bg-danger-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                >
                                    {isSubmittingAbsence ? '처리 중..' : '결석 처리'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </CommonMenuBar>
    );
}

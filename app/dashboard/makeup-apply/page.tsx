'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import CommonMenuBar from '../components/commonMenuBar';

const DAY_LABELS: Record<string, string> = {
    MONDAY: '월', TUESDAY: '화', WEDNESDAY: '수', THURSDAY: '목',
    FRIDAY: '금', SATURDAY: '토', SUNDAY: '일',
};
// 그리드는 월~토까지만 표시(일요일 제외)
const GRID_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// uuid 해시로 수업마다 항상 같은 색 배정
const BLOCK_COLORS = [
    'bg-cat-1', 'bg-cat-2', 'bg-cat-3', 'bg-cat-4', 'bg-cat-5', 'bg-cat-6',
];

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

const HOUR_HEIGHT = 64; // px

function formatDateISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getMonday(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
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

interface StudentTicketCount {
    studentUuid: string;
    name: string;
    managementName: string;
    remainingTicketCount: number;
}

interface MakeupTicketDetail {
    ticketUuid: string;
    absentDate: string | null;
    classTitle: string | null;
    teacherName: string | null;
    source: 'STUDENT_ABSENCE' | 'ACADEMY_HOLIDAY' | 'MANUAL_GRANT';
    status: 'UNUSED' | 'USED' | 'EXPIRED';
    expiredAt: string | null;
    memo: string | null;
}

const TICKET_SOURCE_LABELS: Record<MakeupTicketDetail['source'], string> = {
    STUDENT_ABSENCE: '🙋 결석 신청',
    ACADEMY_HOLIDAY: '🏖️ 학원 휴무',
    MANUAL_GRANT: '🎁 수동 지급',
};

const TICKET_STATUS_LABELS: Record<MakeupTicketDetail['status'], { label: string; className: string }> = {
    UNUSED: { label: '미사용', className: 'bg-success-soft text-success' },
    USED: { label: '사용 완료', className: 'bg-line-soft text-ink-faint' },
    EXPIRED: { label: '만료', className: 'bg-danger-soft text-danger' },
};

interface MakeupSlot {
    regularClassUuid: string;
    title: string | null;
    teacherName: string | null; // 학부모 화면에서는 서버가 항상 null로 내려준다(강사명 비노출)
    roomNumber: string | null;
    date: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    maxCapacity: number;
    currentCount: number;
    remainingSeats: number;
}

interface MakeupRequestItem {
    uuid: string;
    studentUuid: string;
    studentName: string;
    originClassUuid: string | null; // 수동 지급 보강권을 사용한 신청은 원래 수업이 없어 null 가능
    originClassTitle: string | null;
    absentDate: string | null;
    targetRegularClassUuid: string;
    targetClassTitle: string | null;
    targetTeacherName: string;
    targetDate: string;
    targetStartTime: string;
    targetEndTime: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedAt: string;
    decidedAt: string | null;
}

const STATUS_LABELS: Record<MakeupRequestItem['status'], { text: string; className: string }> = {
    PENDING: { text: '⏳ 대기중', className: 'bg-warning-soft text-warning' },
    APPROVED: { text: '✅ 수락됨', className: 'bg-success-soft text-success' },
    REJECTED: { text: '❌ 거절됨', className: 'bg-line-soft text-ink-faint' },
};

interface AcademyOption {
    id: number;
    name: string;
}

const API_BASE = 'http://localhost:8080/api';

export default function MakeupApplyPage() {
    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getMonday(new Date()));
    const [slots, setSlots] = useState<MakeupSlot[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);

    // 신청 가능 여부/선택지는 이 잔여 보강권 데이터로만 결정한다(0개인 자녀는 신청 불가).
    const [childTicketCounts, setChildTicketCounts] = useState<StudentTicketCount[]>([]);
    const [expandedChildUuid, setExpandedChildUuid] = useState<string | null>(null);
    const [ticketHistoryByChild, setTicketHistoryByChild] = useState<Record<string, MakeupTicketDetail[]>>({});
    const [isLoadingTicketHistory, setIsLoadingTicketHistory] = useState<string | null>(null);
    const [myRequests, setMyRequests] = useState<MakeupRequestItem[]>([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(false);

    const [applyTarget, setApplyTarget] = useState<MakeupSlot | null>(null);
    const [selectedChildUuid, setSelectedChildUuid] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 자녀가 여러 학원에 다닐 수 있어, 선택된 학원 하나 기준으로만 여석을 조회/신청한다.
    const [academies, setAcademies] = useState<AcademyOption[]>([]);
    const [selectedAcademyId, setSelectedAcademyId] = useState('');

    // 주간 네비게이션 연타 시 늦게 보낸 요청 결과만 반영해 응답 순서 역전을 방지
    const fetchSlotsRequestId = useRef(0);

    useEffect(() => {
        fetchMyChildrenAcademies();
        fetchMyRequests();
    }, []);

    useEffect(() => {
        if (!selectedAcademyId) return;
        fetchChildTicketCounts();
        fetchSlots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAcademyId, currentWeekStart]);

    const fetchMyChildrenAcademies = async () => {
        try {
            const res = await axios.get(`${API_BASE}/members/my-children-academies`);
            const list: AcademyOption[] = res.data;
            setAcademies(list);
            if (list.length > 0) {
                setSelectedAcademyId(String(list[0].id));
            } else {
                // 자녀 등록 학원이 없는 예외 케이스는 세션의 학원으로 대체
                setSelectedAcademyId(sessionStorage.getItem('academyId') || '');
            }
        } catch (error) {
            console.error('자녀 학원 목록 조회 실패:', error);
        }
    };

    const fetchChildTicketCounts = async () => {
        try {
            const res = await axios.get(`${API_BASE}/makeup-tickets/my-children-counts?academyId=${selectedAcademyId}`);
            setChildTicketCounts(res.data);
        } catch (error) {
            console.error('자녀 보강권 현황 로딩 실패:', error);
        }
    };

    // 만료/사용 포함 전체 이력이라 보강권 0개인 자녀도 눌러서 지난 이력을 볼 수 있다.
    const handleToggleTicketHistory = async (studentUuid: string) => {
        if (expandedChildUuid === studentUuid) {
            setExpandedChildUuid(null);
            return;
        }
        setExpandedChildUuid(studentUuid);
        if (ticketHistoryByChild[studentUuid]) return;

        setIsLoadingTicketHistory(studentUuid);
        try {
            const res = await axios.get(`${API_BASE}/makeup-tickets/my-children/${studentUuid}/details?academyId=${selectedAcademyId}`);
            setTicketHistoryByChild((prev) => ({ ...prev, [studentUuid]: res.data }));
        } catch (error) {
            console.error('보강권 이력 조회 실패:', error);
        } finally {
            setIsLoadingTicketHistory(null);
        }
    };

    const fetchSlots = async () => {
        const requestId = ++fetchSlotsRequestId.current;
        setIsLoadingSlots(true);
        try {
            const weekStartParam = formatDateISO(currentWeekStart);
            const res = await axios.get(`${API_BASE}/makeup-requests/open-slots?academyId=${selectedAcademyId}&weekStart=${weekStartParam}`);
            if (requestId === fetchSlotsRequestId.current) setSlots(res.data);
        } catch (error) {
            console.error('보강 가능 여석 조회 실패:', error);
        } finally {
            if (requestId === fetchSlotsRequestId.current) setIsLoadingSlots(false);
        }
    };

    const fetchMyRequests = async () => {
        setIsLoadingRequests(true);
        try {
            const res = await axios.get(`${API_BASE}/makeup-requests/my`);
            setMyRequests(res.data);
        } catch (error) {
            console.error('보강 신청 내역 조회 실패:', error);
        } finally {
            setIsLoadingRequests(false);
        }
    };

    const childrenWithTickets = useMemo(
        () => childTicketCounts.filter((c) => c.remainingTicketCount > 0),
        [childTicketCounts]
    );

    const openApplyModal = (slot: MakeupSlot) => {
        setSelectedChildUuid(childrenWithTickets[0]?.studentUuid || '');
        setApplyTarget(slot);
    };

    const handleSubmitApply = async () => {
        if (!applyTarget || !selectedChildUuid) {
            alert('보강 신청할 자녀를 선택해주세요.');
            return;
        }
        if (!confirm(`${applyTarget.date} ${applyTarget.startTime.slice(0, 5)}~${applyTarget.endTime.slice(0, 5)} 수업으로 보강 신청하시겠습니까?\n보유한 보강권 1개가 사용됩니다(원장/강사 수락 시 확정).`)) return;

        try {
            setIsSubmitting(true);
            await axios.post(
                `${API_BASE}/makeup-requests`,
                { studentUuid: selectedChildUuid, targetRegularClassUuid: applyTarget.regularClassUuid, targetDate: applyTarget.date }
            );
            alert('보강 신청이 접수되었습니다. 원장/강사의 수락을 기다려주세요.');
            setApplyTarget(null);
            fetchSlots();
            fetchMyRequests();
            fetchChildTicketCounts(); // 방금 신청에 쓴 보강권이 "사용 가능" 목록에서 즉시 빠지도록 갱신
        } catch (error: any) {
            const msg = error.response?.data?.message || '보강 신청 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const weekRangeLabel = useMemo(() => {
        return `${formatDateLabel(currentWeekStart)} ~ ${formatDateLabel(addDays(currentWeekStart, 6))}`;
    }, [currentWeekStart]);

    const isCurrentWeek = useMemo(() => {
        return formatDateISO(currentWeekStart) === formatDateISO(getMonday(new Date()));
    }, [currentWeekStart]);

    const weekDates = useMemo(() => {
        const map: Record<string, string> = {};
        GRID_DAYS.forEach((day, idx) => {
            map[day] = formatDateISO(addDays(currentWeekStart, idx));
        });
        return map;
    }, [currentWeekStart]);

    const slotsByDate = useMemo(() => {
        const map: Record<string, MakeupSlot[]> = {};
        slots.forEach((slot) => {
            if (!map[slot.date]) map[slot.date] = [];
            map[slot.date].push(slot);
        });
        return map;
    }, [slots]);

    const { startHour, endHour } = useMemo(() => {
        let minH = 9;
        let maxH = 19;
        slots.forEach((slot) => {
            const startH = Math.floor(toMinutes(slot.startTime) / 60);
            const endH = Math.ceil(toMinutes(slot.endTime) / 60);
            if (startH < minH) minH = startH;
            if (endH > maxH) maxH = endH;
        });
        return { startHour: minH, endHour: maxH };
    }, [slots]);

    const gridHours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
    const gridHeight = (endHour - startHour) * HOUR_HEIGHT;

    return (
        <CommonMenuBar>
            <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
                <div className="bg-paper-raised p-4 sm:p-6 rounded-lg border border-line shadow-sm">
                    <div className="mb-4 space-y-1">
                        <h3 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                            <span>📝</span> 보강 신청
                        </h3>
                        <p className="text-ink-faint text-xs leading-relaxed max-w-md">
                            정원이 아직 차지 않은 다른 시간대 수업에 자녀의 보강권으로 신청할 수 있습니다. 신청 후 원장/강사가 수락하면 확정됩니다.
                        </p>
                    </div>

                    {academies.length > 1 && (
                        <div className="mb-4 flex items-center gap-2">
                            <label className="text-xs font-bold text-ink-faint">🏢 학원 선택</label>
                            <select
                                value={selectedAcademyId}
                                onChange={(e) => setSelectedAcademyId(e.target.value)}
                                className="px-3 py-1.5 text-xs font-semibold border border-line rounded-lg outline-none bg-paper-raised text-ink-soft"
                            >
                                {academies.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {childTicketCounts.length > 0 && (
                        <div className="mb-4 space-y-2">
                            <div className="flex flex-wrap gap-2">
                                {childTicketCounts.map((c) => (
                                    <button
                                        key={c.studentUuid}
                                        type="button"
                                        onClick={() => handleToggleTicketHistory(c.studentUuid)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full transition cursor-pointer ${
                                            expandedChildUuid === c.studentUuid
                                                ? 'bg-accent text-paper-raised'
                                                : c.remainingTicketCount > 0
                                                    ? 'bg-accent-soft text-accent-hover hover:brightness-95'
                                                    : 'bg-line-soft text-ink-faint hover:brightness-95'
                                        }`}
                                    >
                                        {c.managementName || c.name}
                                        <span>🎫 {c.remainingTicketCount}개</span>
                                        <span className="text-[10px]">{expandedChildUuid === c.studentUuid ? '▲' : '▼'}</span>
                                    </button>
                                ))}
                            </div>

                            {expandedChildUuid && (
                                <div className="p-3 border border-line-soft rounded-lg bg-line-soft/50">
                                    {isLoadingTicketHistory === expandedChildUuid ? (
                                        <p className="text-xs text-ink-faint text-center py-2">불러오는 중..</p>
                                    ) : !ticketHistoryByChild[expandedChildUuid] || ticketHistoryByChild[expandedChildUuid].length === 0 ? (
                                        <p className="text-xs text-ink-faint text-center py-2">보강권 이력이 없습니다.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {ticketHistoryByChild[expandedChildUuid].map((d) => (
                                                <li
                                                    key={d.ticketUuid}
                                                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-paper-raised border rounded-lg px-3 py-2 text-xs ${
                                                        d.status === 'EXPIRED' ? 'border-danger-soft opacity-70' : 'border-line-soft'
                                                    }`}
                                                >
                                                    <div className="flex flex-col gap-0.5">
                                                        {d.source === 'MANUAL_GRANT' ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-ink-soft">수동 지급된 보강권</span>
                                                                {d.memo && (
                                                                    <>
                                                                        <span className="text-ink-faint">|</span>
                                                                        <span className="text-ink-faint">{d.memo}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-ink-soft">{d.absentDate}</span>
                                                                <span className="text-ink-faint">|</span>
                                                                <span className="text-ink-soft">{d.classTitle || '(제목 없음)'}</span>
                                                            </div>
                                                        )}
                                                        <span className="text-[11px] text-ink-faint">
                                                            {d.expiredAt ? `⏳ ${d.expiredAt.slice(0, 10)}까지 유효` : '⏳ 기한 제한 없음'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className={`inline-flex w-fit px-2 py-0.5 rounded-full font-medium ${TICKET_STATUS_LABELS[d.status].className}`}>
                                                            {TICKET_STATUS_LABELS[d.status].label}
                                                        </span>
                                                        <span className="inline-flex w-fit px-2 py-0.5 rounded-full bg-line-soft text-ink-soft font-medium">
                                                            {TICKET_SOURCE_LABELS[d.source]}
                                                        </span>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

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

                    {isLoadingSlots ? (
                        <div className="p-8 text-center text-ink-faint text-sm font-medium">불러오는 중..</div>
                    ) : slots.length === 0 ? (
                        <div className="p-8 text-center text-ink-faint font-medium border border-line-soft rounded-lg bg-line-soft/50">
                            이번 주는 여석이 있는 수업이 없습니다.
                        </div>
                    ) : (
                        <>
                        <div className="hidden sm:block border border-line rounded-lg overflow-x-auto">
                            <div className="flex min-w-[640px]">
                                {/* 시간축 라벨 컬럼 */}
                                <div className="w-12 flex-shrink-0 border-r border-line-soft">
                                    <div className="h-10 border-b border-line-soft bg-line-soft/70" />
                                    <div className="relative" style={{ height: gridHeight }}>
                                        {gridHours.map((h, i) => (
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
                                    const daySlots = slotsByDate[dateForDay] || [];
                                    return (
                                        <div key={day} className="flex-1 min-w-[100px] border-r border-line-soft last:border-r-0">
                                            <div className="h-10 flex flex-col items-center justify-center text-xs font-bold text-ink-soft border-b border-line-soft bg-line-soft/70 leading-tight">
                                                <span>{DAY_LABELS[day]}</span>
                                                <span className="text-[9px] text-ink-faint font-medium">{dateForDay?.slice(5)}</span>
                                            </div>
                                            <div className="relative" style={{ height: gridHeight }}>
                                                {gridHours.map((h, i) => (
                                                    <div
                                                        key={h}
                                                        style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                                                        className="absolute left-0 right-0 border-b border-line-soft"
                                                    />
                                                ))}

                                                {daySlots.map((slot) => {
                                                    const top = (toMinutes(slot.startTime) - startHour * 60) / 60 * HOUR_HEIGHT;
                                                    const height = Math.max(
                                                        (toMinutes(slot.endTime) - toMinutes(slot.startTime)) / 60 * HOUR_HEIGHT,
                                                        22
                                                    );
                                                    const color = colorForClass(slot.regularClassUuid);
                                                    const noTickets = childrenWithTickets.length === 0;

                                                    return (
                                                        <button
                                                            key={`${slot.regularClassUuid}-${slot.date}`}
                                                            type="button"
                                                            disabled={noTickets}
                                                            title={noTickets ? '보강권을 보유한 자녀가 없습니다' : undefined}
                                                            onClick={() => openApplyModal(slot)}
                                                            style={{ top, height }}
                                                            className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 text-left overflow-hidden shadow-sm transition ${color} text-paper-raised ${
                                                                noTickets ? 'opacity-50 cursor-default' : 'hover:brightness-95 cursor-pointer'
                                                            }`}
                                                        >
                                                            <div className="text-[11px] font-bold leading-tight truncate">{slot.title || '수업'}</div>
                                                            {slot.roomNumber && (
                                                                <div className="text-[10px] leading-tight opacity-90 truncate">{slot.roomNumber}</div>
                                                            )}
                                                            <div className="text-[10px] leading-tight opacity-90">🎫 {slot.remainingSeats}자리</div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="sm:hidden border border-line-soft rounded-lg overflow-hidden">
                        <table className="min-w-full bg-paper-raised divide-y divide-line text-sm">
                            <thead className="bg-line-soft text-ink-faint font-semibold text-xs uppercase tracking-wider text-left">
                            <tr>
                                <th className="p-3">날짜</th>
                                <th className="p-3">수업</th>
                                <th className="p-3">시간</th>
                                <th className="p-3 text-center">여석</th>
                                <th className="p-3 text-center">신청</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-line text-ink-soft">
                            {slots.map((slot) => (
                                    <tr key={`${slot.regularClassUuid}-${slot.date}`} className="hover:bg-line-soft/70 transition">
                                        <td className="p-3 font-semibold text-ink whitespace-nowrap">
                                            {slot.date.slice(5)} ({DAY_LABELS[slot.dayOfWeek]})
                                        </td>
                                        <td className="p-3">
                                            <div className="font-bold text-ink">{slot.title || '수업'}</div>
                                            {slot.roomNumber && <div className="text-xs text-ink-faint">{slot.roomNumber}</div>}
                                        </td>
                                        <td className="p-3 whitespace-nowrap text-xs text-ink-soft">
                                            {slot.startTime.slice(0, 5)}~{slot.endTime.slice(0, 5)}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className="inline-flex px-2.5 py-1 text-xs font-bold bg-accent-soft text-accent-hover rounded-full">
                                                {slot.remainingSeats}자리 남음
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => openApplyModal(slot)}
                                                disabled={childrenWithTickets.length === 0}
                                                title={childrenWithTickets.length === 0 ? '보강권을 보유한 자녀가 없습니다' : undefined}
                                                className="px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                            >
                                                신청
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                        </>
                    )}
                </div>

                <div className="bg-paper-raised p-4 sm:p-6 rounded-lg border border-line shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                            <span>📋</span> 내 보강 신청 내역
                        </h3>
                        <button
                            type="button"
                            onClick={fetchMyRequests}
                            className="px-3 py-1.5 text-xs font-bold bg-line-soft hover:bg-line-soft text-ink-soft rounded-lg border border-line shadow-sm transition"
                        >
                            {isLoadingRequests ? '⌛' : '🔄'} 새로고침
                        </button>
                    </div>

                    {isLoadingRequests ? (
                        <div className="p-8 text-center text-ink-faint text-sm font-medium">불러오는 중..</div>
                    ) : myRequests.length === 0 ? (
                        <div className="p-8 text-center text-ink-faint font-medium border border-line-soft rounded-lg bg-line-soft/50">
                            보강 신청 내역이 없습니다.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {myRequests.map((r) => (
                                <div key={r.uuid} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3.5 border border-line-soft rounded-lg">
                                    <div>
                                        <div className="text-sm font-bold text-ink">
                                            {r.studentName}
                                            <span className="text-ink-faint font-normal"> · {r.targetClassTitle || `${r.targetTeacherName} 선생님 수업`}</span>
                                        </div>
                                        <div className="text-xs text-ink-faint mt-0.5">
                                            📅 {r.targetDate} 🕒 {r.targetStartTime.slice(0, 5)}~{r.targetEndTime.slice(0, 5)}
                                            <span className="text-line mx-1">|</span>
                                            {r.absentDate ? `원래 결석일 ${r.absentDate} (${r.originClassTitle || '수업'})` : '🎁 수동 지급된 보강권 사용'}
                                        </div>
                                    </div>
                                    <span className={`inline-flex w-fit px-2.5 py-1 text-xs font-bold rounded-full ${STATUS_LABELS[r.status].className}`}>
                                        {STATUS_LABELS[r.status].text}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {applyTarget && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-paper-raised w-full max-w-sm rounded-lg shadow-lg my-8 animate-fade-in">
                        <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-ink">📝 보강 신청</h3>
                                <p className="text-xs text-ink-faint mt-1">신청 즉시 보강권 1개가 예약되며, 원장/강사 수락 시 확정됩니다.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setApplyTarget(null)}
                                className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="p-3.5 bg-line-soft rounded-lg border border-line-soft text-sm">
                                <div className="font-bold text-ink">{applyTarget.title || '수업'}</div>
                                <div className="text-xs text-ink-faint mt-1">
                                    📅 {applyTarget.date} · 🕒 {applyTarget.startTime.slice(0, 5)}~{applyTarget.endTime.slice(0, 5)}
                                    {applyTarget.roomNumber ? ` · ${applyTarget.roomNumber}` : ''}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-ink-soft mb-1.5">보강 신청할 자녀 선택 *</label>
                                {childrenWithTickets.length === 0 ? (
                                    <div className="p-3 text-xs text-ink-faint border border-line-soft rounded-lg bg-line-soft/50">
                                        보강권을 보유한 자녀가 없습니다.
                                    </div>
                                ) : (
                                    <select
                                        value={selectedChildUuid}
                                        onChange={(e) => setSelectedChildUuid(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    >
                                        {childrenWithTickets.map((child) => (
                                            <option key={child.studentUuid} value={child.studentUuid}>
                                                {child.managementName || child.name} (보강권 {child.remainingTicketCount}개)
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setApplyTarget(null)}
                                className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmitApply}
                                disabled={isSubmitting || !selectedChildUuid}
                                className="px-5 py-2 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                            >
                                {isSubmitting ? '신청 중..' : '보강 신청'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </CommonMenuBar>
    );
}

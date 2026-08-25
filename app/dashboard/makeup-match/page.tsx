'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import CommonMenuBar from '../components/commonMenuBar';

const DAY_LABELS: Record<string, string> = {
    MONDAY: '월', TUESDAY: '화', WEDNESDAY: '수', THURSDAY: '목',
    FRIDAY: '금', SATURDAY: '토', SUNDAY: '일',
};
const GRID_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const HOUR_HEIGHT = 64; // px, 정규 수업 시간표와 동일한 레이아웃 기준

function toMinutes(hhmm: string) {
    if (!hhmm) return 0;
    const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10));
    return h * 60 + (m || 0);
}

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

interface RosterStudent {
    uuid: string;
    name: string;
    managementName: string;
}

interface MakeupSlot {
    regularClassUuid: string;
    title: string | null;
    teacherName: string;
    roomNumber: string | null;
    date: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    maxCapacity: number;
    currentCount: number;
    remainingSeats: number;
    attendingStudents: RosterStudent[]; // 이미 매칭/편성된 학생 명단(원장/강사 화면 전용)
}

interface StudentTicketCount {
    studentUuid: string;
    name: string;
    managementName: string;
    remainingTicketCount: number;
}

const API_BASE = 'http://localhost:8080/api';

export default function MakeupMatchPage() {
    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getMonday(new Date()));
    const [slots, setSlots] = useState<MakeupSlot[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [ticketHolders, setTicketHolders] = useState<StudentTicketCount[]>([]);

    const [matchTarget, setMatchTarget] = useState<MakeupSlot | null>(null);
    const [selectedStudentUuid, setSelectedStudentUuid] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 주간 네비게이션 연타 시 늦게 보낸 요청 결과만 반영해 응답 순서 역전을 방지
    const fetchSlotsRequestId = useRef(0);

    useEffect(() => {
        fetchTicketHolders();
    }, []);

    useEffect(() => {
        fetchSlots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentWeekStart]);

    const fetchSlots = async () => {
        const requestId = ++fetchSlotsRequestId.current;
        setIsLoading(true);
        try {
            const academyId = sessionStorage.getItem('academyId');
            const weekStartParam = formatDateISO(currentWeekStart);
            const res = await axios.get(`${API_BASE}/makeup-requests/open-slots?academyId=${academyId}&weekStart=${weekStartParam}`);
            if (requestId === fetchSlotsRequestId.current) setSlots(res.data);
        } catch (error) {
            console.error('보강 여석 조회 실패:', error);
        } finally {
            if (requestId === fetchSlotsRequestId.current) setIsLoading(false);
        }
    };

    const fetchTicketHolders = async () => {
        try {
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.get(`${API_BASE}/makeup-tickets/counts?academyId=${academyId}`);
            setTicketHolders((res.data as StudentTicketCount[]).filter((s) => s.remainingTicketCount > 0));
        } catch (error) {
            console.error('보강권 보유 학생 조회 실패:', error);
        }
    };

    const openMatchModal = (slot: MakeupSlot) => {
        setSelectedStudentUuid(ticketHolders[0]?.studentUuid || '');
        setMatchTarget(slot);
    };

    const handleSubmitMatch = async () => {
        if (!matchTarget || !selectedStudentUuid) {
            alert('매칭할 학생을 선택해주세요.');
            return;
        }
        const student = ticketHolders.find((s) => s.studentUuid === selectedStudentUuid);
        if (!confirm(`${student?.managementName || student?.name}을(를) ${matchTarget.date} ${matchTarget.startTime.slice(0, 5)}~${matchTarget.endTime.slice(0, 5)} 수업에 보강 매칭하시겠습니까?\n보강권 1개가 사용됩니다.`)) return;

        try {
            setIsSubmitting(true);
            const academyId = sessionStorage.getItem('academyId');
            await axios.post(
                `${API_BASE}/makeup-requests/match?academyId=${academyId}`,
                { studentUuid: selectedStudentUuid, targetRegularClassUuid: matchTarget.regularClassUuid, targetDate: matchTarget.date }
            );
            alert('보강 매칭이 완료되었습니다.');
            setMatchTarget(null);
            fetchSlots();
            fetchTicketHolders();
        } catch (error: any) {
            const msg = error.response?.data?.message || '보강 매칭 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // 현재 표시 중인 주(월~토)의 요일별 실제 날짜 매핑
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
            (map[slot.date] ||= []).push(slot);
        });
        return map;
    }, [slots]);

    const weekRangeLabel = useMemo(() => {
        return `${formatDateLabel(currentWeekStart)} ~ ${formatDateLabel(addDays(currentWeekStart, 5))}`;
    }, [currentWeekStart]);

    const isCurrentWeek = useMemo(() => {
        return formatDateISO(currentWeekStart) === formatDateISO(getMonday(new Date()));
    }, [currentWeekStart]);

    const { startHour, endHour } = useMemo(() => {
        let minH = 9;
        let maxH = 19;
        slots.forEach((s) => {
            const startH = Math.floor(toMinutes(s.startTime) / 60);
            const endH = Math.ceil(toMinutes(s.endTime) / 60);
            if (startH < minH) minH = startH;
            if (endH > maxH) maxH = endH;
        });
        return { startHour: minH, endHour: maxH };
    }, [slots]);

    const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
    const gridHeight = (endHour - startHour) * HOUR_HEIGHT;

    return (
        <CommonMenuBar>
            <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
                <div className="bg-paper-raised p-4 sm:p-6 rounded-lg border border-line shadow-sm">
                    <div className="mb-4 space-y-1">
                        <h3 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                            <span>🧩</span> 보강 매칭
                        </h3>
                        <p className="text-ink-faint text-xs leading-relaxed max-w-md">
                            정원이 아직 차지 않은 시간대만 모아 보여줍니다. 블록을 클릭해 보강권을 보유한 학생을 바로 매칭(등록)할 수 있습니다.
                        </p>
                    </div>

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
                                    const daySlots = slotsByDate[dateForDay] || [];
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

                                                {daySlots.map((slot) => {
                                                    const top = (toMinutes(slot.startTime) - startHour * 60) / 60 * HOUR_HEIGHT;
                                                    const height = Math.max(
                                                        (toMinutes(slot.endTime) - toMinutes(slot.startTime)) / 60 * HOUR_HEIGHT,
                                                        22
                                                    );
                                                    return (
                                                        <button
                                                            key={slot.regularClassUuid}
                                                            type="button"
                                                            onClick={() => openMatchModal(slot)}
                                                            style={{ top, height }}
                                                            className="absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 text-left overflow-hidden shadow-sm transition bg-success text-paper-raised hover:brightness-95 cursor-pointer"
                                                        >
                                                            {slot.title && (
                                                                <div className="text-[11px] font-bold leading-tight truncate">{slot.title}</div>
                                                            )}
                                                            <div className="text-[10px] leading-tight opacity-90 truncate">{slot.teacherName} 선생님</div>
                                                            <div className="text-[10px] leading-tight font-bold opacity-95">
                                                                여석 {slot.remainingSeats}/{slot.maxCapacity}
                                                            </div>
                                                            {slot.attendingStudents.length > 0 && (
                                                                <div className="text-[10px] leading-tight opacity-90 truncate">
                                                                    👤 {slot.attendingStudents.map((s) => s.managementName || s.name).join(', ')}
                                                                </div>
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

                        <div className="block sm:hidden space-y-5">
                            {GRID_DAYS.map((day) => {
                                const dateForDay = weekDates[day];
                                const daySlots = (slotsByDate[dateForDay] || [])
                                    .slice()
                                    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
                                if (daySlots.length === 0) return null;
                                return (
                                    <div key={day}>
                                        <div className="flex items-baseline gap-1.5 mb-2 px-0.5">
                                            <span className="text-xs font-bold text-ink-soft">{DAY_LABELS[day]}요일</span>
                                            <span className="text-[10px] text-ink-faint font-medium">{dateForDay}</span>
                                        </div>
                                        <div className="space-y-3">
                                            {daySlots.map((slot) => (
                                                <div
                                                    key={slot.regularClassUuid}
                                                    className="p-4 border border-line rounded-lg shadow-sm bg-paper-raised flex flex-col gap-3"
                                                >
                                                    <div className="flex items-center justify-between border-b border-line-soft pb-2">
                                                        <span className="font-bold text-base text-ink truncate">
                                                            {slot.title || `${slot.teacherName} 선생님 수업`}
                                                        </span>
                                                        <span className="flex-shrink-0 ml-2 px-2 py-0.5 text-[10px] font-semibold bg-success-soft text-success rounded-md border border-success-soft">
                                                            여석 {slot.remainingSeats}/{slot.maxCapacity}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-xs">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[10px] text-ink-faint font-bold">🕒 시간</span>
                                                            <span className="font-semibold text-ink-soft">{slot.startTime.slice(0, 5)}~{slot.endTime.slice(0, 5)}</span>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[10px] text-ink-faint font-bold">🧑‍🏫 담당</span>
                                                            <span className="font-semibold text-ink-soft">{slot.teacherName} 선생님{slot.roomNumber ? ` · ${slot.roomNumber}` : ''}</span>
                                                        </div>
                                                        {slot.attendingStudents.length > 0 && (
                                                            <div className="flex flex-col gap-0.5 col-span-2">
                                                                <span className="text-[10px] text-ink-faint font-bold">👤 편성 학생</span>
                                                                <span className="font-medium text-ink-soft text-xs">
                                                                    {slot.attendingStudents.map((s) => s.managementName || s.name).join(', ')}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex gap-2 pt-2 border-t border-line-soft/70 mt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => openMatchModal(slot)}
                                                            className="flex-1 py-2.5 text-xs font-bold bg-success hover:bg-success-hover text-paper-raised rounded-lg shadow-sm transition active:scale-95"
                                                        >
                                                            🧩 이 시간에 매칭하기
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        </>
                    )}
                </div>
            </main>

            {matchTarget && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-paper-raised w-full max-w-sm rounded-lg shadow-lg my-8 animate-fade-in">
                        <div className="p-6 bg-gradient-to-r from-success-soft to-success-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-ink">🧩 보강 학생 매칭</h3>
                                <p className="text-xs text-ink-faint mt-1">선택한 학생의 보강권 1개가 즉시 사용되며 해당 회차에 확정 편성됩니다.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMatchTarget(null)}
                                className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="p-3.5 bg-line-soft rounded-lg border border-line-soft text-sm">
                                <div className="font-bold text-ink">{matchTarget.title || `${matchTarget.teacherName} 선생님 수업`}</div>
                                <div className="text-xs text-ink-faint mt-1">
                                    📅 {matchTarget.date} · 🕒 {matchTarget.startTime.slice(0, 5)}~{matchTarget.endTime.slice(0, 5)}
                                    {matchTarget.roomNumber ? ` · ${matchTarget.roomNumber}` : ''}
                                    <span className="ml-1 font-bold text-success">· 여석 {matchTarget.remainingSeats}자리</span>
                                </div>
                                {matchTarget.attendingStudents.length > 0 && (
                                    <div className="text-xs text-ink-faint mt-1.5">
                                        👤 이미 편성됨: {matchTarget.attendingStudents.map((s) => s.managementName || s.name).join(', ')}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-ink-soft mb-1.5">보강권 보유 학생 선택 *</label>
                                {ticketHolders.length === 0 ? (
                                    <div className="p-3 text-xs text-ink-faint border border-line-soft rounded-lg bg-line-soft/50">
                                        보강권을 보유한 학생이 없습니다.
                                    </div>
                                ) : (
                                    <select
                                        value={selectedStudentUuid}
                                        onChange={(e) => setSelectedStudentUuid(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    >
                                        {ticketHolders.map((s) => (
                                            <option key={s.studentUuid} value={s.studentUuid}>
                                                {s.managementName || s.name} (보강권 {s.remainingTicketCount}개)
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setMatchTarget(null)}
                                className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmitMatch}
                                disabled={isSubmitting || !selectedStudentUuid}
                                className="px-5 py-2 text-xs font-bold bg-success hover:bg-success-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                            >
                                {isSubmitting ? '매칭 중..' : '매칭 확정'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </CommonMenuBar>
    );
}

'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import CommonMenuBar from '../components/commonMenuBar';

interface StudentTicketCount {
    studentUuid: string;
    name: string;
    managementName: string;
    remainingTicketCount: number;
}

interface MakeupTicketDetail {
    ticketUuid: string;
    // 🎯 수동 지급(MANUAL_GRANT) 티켓은 특정 수업/날짜에 묶여 있지 않으므로 null일 수 있다.
    absentDate: string | null;
    classTitle: string | null;
    teacherName: string | null;
    source: 'STUDENT_ABSENCE' | 'ACADEMY_HOLIDAY' | 'MANUAL_GRANT';
    status: 'UNUSED' | 'USED' | 'EXPIRED';
    expiredAt: string | null;
    memo: string | null;
}

const SOURCE_LABELS: Record<MakeupTicketDetail['source'], string> = {
    STUDENT_ABSENCE: '🙋 결석 신청',
    ACADEMY_HOLIDAY: '🏖️ 학원 휴무',
    MANUAL_GRANT: '🎁 수동 지급',
};

const STATUS_LABELS: Record<MakeupTicketDetail['status'], { label: string; className: string }> = {
    UNUSED: { label: '미사용', className: 'bg-success-soft text-success' },
    USED: { label: '사용 완료', className: 'bg-line-soft text-ink-faint' },
    EXPIRED: { label: '만료', className: 'bg-danger-soft text-danger' },
};

interface MakeupTicketPolicy {
    maxOutstandingTickets: number | null;
    monthlyIssueLimit: number | null;
    defaultValidityDays: number | null;
}

interface MakeupRequestItem {
    uuid: string;
    studentUuid: string;
    studentName: string;
    originClassUuid: string | null;
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

export default function MakeupCenterPage() {
    const [myRole, setMyRole] = useState('');
    const [counts, setCounts] = useState<StudentTicketCount[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchKeyword, setSearchKeyword] = useState('');

    // ⚙️ 보강권 전체 정책(원장 전용) — 최대 보유 개수 / 월 발급 제한 / 기본 유효기간, 각각 "제한 없음" 가능
    const [policy, setPolicy] = useState<MakeupTicketPolicy>({ maxOutstandingTickets: null, monthlyIssueLimit: null, defaultValidityDays: null });
    const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
    const [policyForm, setPolicyForm] = useState({
        maxOutstandingTickets: '', maxOutstandingUnlimited: true,
        monthlyIssueLimit: '', monthlyIssueUnlimited: true,
        defaultValidityDays: '', defaultValidityUnlimited: true,
    });
    const [isSubmittingPolicy, setIsSubmittingPolicy] = useState(false);

    // 🎯 잔여 개수 클릭 시 펼쳐지는 상세 내역(원래 수업일 목록) — 학생 uuid별로 캐시해 재클릭 시 재요청하지 않는다.
    const [expandedStudentUuid, setExpandedStudentUuid] = useState<string | null>(null);
    const [detailsByStudent, setDetailsByStudent] = useState<Record<string, MakeupTicketDetail[]>>({});
    const [isLoadingDetail, setIsLoadingDetail] = useState<string | null>(null);

    // 📝 보강 신청 대기 목록 (원장/강사 전용 수락/거절)
    const [pendingRequests, setPendingRequests] = useState<MakeupRequestItem[]>([]);
    const [isLoadingPending, setIsLoadingPending] = useState(false);
    const [decidingRequestUuid, setDecidingRequestUuid] = useState<string | null>(null);

    // 🎁 보강권 수동 부여(초기/추가 지급) 모달
    const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
    const [grantForm, setGrantForm] = useState({ studentUuid: '', quantity: 1, memo: '', validityDays: '', unlimited: false });
    const [isSubmittingGrant, setIsSubmittingGrant] = useState(false);

    useEffect(() => {
        setMyRole(sessionStorage.getItem('userRole') || '');
        fetchCounts();
        fetchPendingRequests();
        fetchPolicy();
    }, []);

    const fetchPolicy = async () => {
        try {
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.get(`http://localhost:8080/api/makeup-ticket-policy?academyId=${academyId}`);
            setPolicy(res.data);
        } catch (error) {
            console.error('보강권 정책 조회 실패:', error);
        }
    };

    const openPolicyModal = () => {
        setPolicyForm({
            maxOutstandingTickets: policy.maxOutstandingTickets != null ? String(policy.maxOutstandingTickets) : '',
            maxOutstandingUnlimited: policy.maxOutstandingTickets == null,
            monthlyIssueLimit: policy.monthlyIssueLimit != null ? String(policy.monthlyIssueLimit) : '',
            monthlyIssueUnlimited: policy.monthlyIssueLimit == null,
            defaultValidityDays: policy.defaultValidityDays != null ? String(policy.defaultValidityDays) : '',
            defaultValidityUnlimited: policy.defaultValidityDays == null,
        });
        setIsPolicyModalOpen(true);
    };

    const handleSubmitPolicy = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmittingPolicy(true);
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.put(`http://localhost:8080/api/makeup-ticket-policy?academyId=${academyId}`, {
                maxOutstandingTickets: policyForm.maxOutstandingUnlimited ? null : Number(policyForm.maxOutstandingTickets),
                monthlyIssueLimit: policyForm.monthlyIssueUnlimited ? null : Number(policyForm.monthlyIssueLimit),
                defaultValidityDays: policyForm.defaultValidityUnlimited ? null : Number(policyForm.defaultValidityDays),
            });
            setPolicy(res.data);
            alert('보강권 전체 정책이 저장되었습니다.');
            setIsPolicyModalOpen(false);
        } catch (error: any) {
            const msg = error.response?.data?.message || '정책 저장 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmittingPolicy(false);
        }
    };

    const fetchPendingRequests = async () => {
        setIsLoadingPending(true);
        try {
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.get(`http://localhost:8080/api/makeup-requests/pending?academyId=${academyId}`);
            setPendingRequests(res.data);
        } catch (error) {
            console.error('보강 신청 대기 목록 조회 실패:', error);
        } finally {
            setIsLoadingPending(false);
        }
    };

    const handleDecideRequest = async (request: MakeupRequestItem, decision: 'approve' | 'reject') => {
        const label = decision === 'approve' ? '수락' : '거절';
        if (!confirm(`${request.studentName}의 보강 신청(${request.targetDate} ${request.targetClassTitle || request.targetTeacherName + ' 선생님 수업'})을 ${label}하시겠습니까?`)) return;

        try {
            setDecidingRequestUuid(request.uuid);
            const academyId = sessionStorage.getItem('academyId');
            await axios.patch(
                `http://localhost:8080/api/makeup-requests/${request.uuid}/${decision}?academyId=${academyId}`,
                {}
            );
            alert(`보강 신청이 ${label}되었습니다.`);
            await fetchPendingRequests();
            fetchCounts(); // 수락 시 티켓이 사용 처리되어 잔여 개수가 바뀌므로 함께 갱신
        } catch (error: any) {
            const msg = error.response?.data?.message || `보강 신청 ${label} 중 오류가 발생했습니다.`;
            alert(`[에러] ${msg}`);
        } finally {
            setDecidingRequestUuid(null);
        }
    };

    const fetchCounts = async () => {
        setIsLoading(true);
        try {
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.get(`http://localhost:8080/api/makeup-tickets/counts?academyId=${academyId}`);
            setCounts(res.data);
        } catch (error) {
            console.error('보강권 잔여 개수 조회 실패:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // 🎯 잔여 개수 클릭: 이미 펼쳐져 있으면 접고, 아니면 (필요 시 조회 후) 펼친다.
    const handleToggleDetail = async (studentUuid: string) => {
        if (expandedStudentUuid === studentUuid) {
            setExpandedStudentUuid(null);
            return;
        }

        setExpandedStudentUuid(studentUuid);
        if (detailsByStudent[studentUuid]) {
            return; // 이미 캐시되어 있으면 재요청하지 않는다.
        }

        setIsLoadingDetail(studentUuid);
        try {
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.get(
                `http://localhost:8080/api/makeup-tickets/details?academyId=${academyId}&studentUuid=${studentUuid}`
            );
            setDetailsByStudent((prev) => ({ ...prev, [studentUuid]: res.data }));
        } catch (error) {
            console.error('보강권 상세 내역 조회 실패:', error);
        } finally {
            setIsLoadingDetail(null);
        }
    };

    const openGrantModal = (studentUuid?: string) => {
        // 🎯 유효기간 입력칸은 [보강권 전체 설정]의 기본값으로 미리 채워둔다 — 정책이 "제한 없음"이면
        // 이 지급 건도 기본은 "기한 제한 없음" 체크로 시작한다.
        setGrantForm({
            studentUuid: studentUuid || counts[0]?.studentUuid || '',
            quantity: 1,
            memo: '',
            validityDays: policy.defaultValidityDays != null ? String(policy.defaultValidityDays) : '',
            unlimited: policy.defaultValidityDays == null,
        });
        setIsGrantModalOpen(true);
    };

    // 🎁 보강권 수동 지급: 앱 도입 전 보유하던 잔여 보강권을 등록하거나, 필요에 따라 추가로 지급한다.
    const submitGrant = async (overrideLimit: boolean) => {
        try {
            setIsSubmittingGrant(true);
            const academyId = sessionStorage.getItem('academyId');
            await axios.post(
                `http://localhost:8080/api/makeup-tickets/grant?academyId=${academyId}`,
                {
                    studentUuid: grantForm.studentUuid,
                    quantity: grantForm.quantity,
                    memo: grantForm.memo.trim() || null,
                    validityDays: grantForm.unlimited ? null : Number(grantForm.validityDays),
                    overrideLimit,
                }
            );
            alert('보강권이 지급되었습니다.');
            setIsGrantModalOpen(false);
            // 지급된 학생의 상세 내역이 이미 펼쳐져 있었다면 최신 상태로 다시 불러오도록 캐시를 비운다.
            setDetailsByStudent((prev) => {
                const next = { ...prev };
                delete next[grantForm.studentUuid];
                return next;
            });
            fetchCounts();
        } catch (error: any) {
            // 🎯 [보강권 전체 정책] 최대 보유 개수/월 발급 제한을 초과하면 alert 대신 "그래도 지급하시겠습니까?"
            // 확인을 띄운다 — 원장/강사 전용 화면이라 학부모가 볼 일은 없다.
            if (error.response?.status === 409 && error.response?.data?.limitExceeded) {
                setIsSubmittingGrant(false);
                if (confirm(`${error.response.data.message}\n\n그래도 지급하시겠습니까?`)) {
                    await submitGrant(true);
                }
                return;
            }
            const msg = error.response?.data?.message || '보강권 지급 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmittingGrant(false);
        }
    };

    const handleSubmitGrant = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!grantForm.studentUuid) {
            alert('보강권을 지급할 학생을 선택해주세요.');
            return;
        }
        const student = counts.find((c) => c.studentUuid === grantForm.studentUuid);
        if (!grantForm.unlimited && !grantForm.validityDays) {
            alert('유효기간을 입력하거나 "기한 제한 없음"을 체크해주세요.');
            return;
        }
        if (!confirm(`${student?.managementName || student?.name}에게 보강권 ${grantForm.quantity}개를 지급하시겠습니까?`)) return;

        await submitGrant(false);
    };

    const filtered = counts.filter((c) => {
        const keyword = searchKeyword.trim();
        if (!keyword) return true;
        return c.name.includes(keyword) || (c.managementName || '').includes(keyword);
    });

    return (
        <CommonMenuBar>
            <main className="p-4 sm:p-6 max-w-4xl w-full mx-auto space-y-6">
                <div className="bg-paper-raised p-4 sm:p-6 rounded-lg border border-line shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-4">
                        <div className="space-y-1">
                            <h3 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                                <span>📝</span> 보강 신청 대기 목록
                            </h3>
                            <p className="text-ink-faint text-xs leading-relaxed max-w-md">
                                학부모가 신청한 보강을 확인하고 수락하거나 거절할 수 있습니다. 수락 시 해당 회차에 편성되고 보강권이 사용 처리됩니다.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={fetchPendingRequests}
                            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-bold bg-line-soft hover:bg-line-soft text-ink-soft rounded-lg border border-line shadow-sm transition flex items-center justify-center gap-1.5"
                        >
                            <span>{isLoadingPending ? '⌛' : '🔄'}</span>
                            <span>새로고침</span>
                        </button>
                    </div>

                    {isLoadingPending ? (
                        <div className="p-8 text-center text-ink-faint text-sm font-medium">불러오는 중..</div>
                    ) : pendingRequests.length === 0 ? (
                        <div className="p-6 text-center text-ink-faint font-medium border border-line-soft rounded-lg bg-line-soft/50 text-sm">
                            대기 중인 보강 신청이 없습니다.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {pendingRequests.map((r) => (
                                <div key={r.uuid} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 border border-line-soft rounded-lg">
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
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleDecideRequest(r, 'reject')}
                                            disabled={decidingRequestUuid === r.uuid}
                                            className="px-3 py-1.5 text-xs font-bold text-ink-faint hover:text-ink-soft border border-line hover:bg-line-soft rounded-lg transition disabled:opacity-50"
                                        >
                                            거절
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDecideRequest(r, 'approve')}
                                            disabled={decidingRequestUuid === r.uuid}
                                            className="px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                        >
                                            {decidingRequestUuid === r.uuid ? '처리 중..' : '수락'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-paper-raised p-4 sm:p-6 rounded-lg border border-line shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
                        <div className="space-y-1">
                            <h3 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                                <span>🎟️</span> 보강권 관리
                            </h3>
                            <p className="text-ink-faint text-xs leading-relaxed max-w-md">
                                학생별 잔여(미사용) 보강권 개수를 확인할 수 있습니다. 결석 신청이나 학원 휴무일로 자동 발급된 보강권이 여기에 반영됩니다.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {myRole === 'ADMIN' && (
                                <button
                                    type="button"
                                    onClick={openPolicyModal}
                                    className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-bold bg-line-soft hover:bg-line-soft text-ink-soft rounded-lg border border-line shadow-sm transition flex items-center justify-center gap-1.5"
                                >
                                    <span>⚙️</span>
                                    <span>보강권 전체 설정</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => openGrantModal()}
                                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-bold bg-success hover:bg-success-hover text-paper-raised rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
                            >
                                <span>🎁</span>
                                <span>보강권 수동 부여</span>
                            </button>
                            <button
                                type="button"
                                onClick={fetchCounts}
                                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-bold bg-line-soft hover:bg-line-soft text-ink-soft rounded-lg border border-line shadow-sm transition flex items-center justify-center gap-1.5"
                            >
                                <span>{isLoading ? '⌛' : '🔄'}</span>
                                <span>새로고침</span>
                            </button>
                        </div>
                    </div>

                    <input
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="학생 이름으로 검색"
                        className="w-full mb-4 px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                    />

                    <div className="border border-line-soft rounded-lg overflow-hidden">
                        <table className="min-w-full bg-paper-raised divide-y divide-line text-sm">
                            <thead className="bg-line-soft text-ink-faint font-semibold text-xs uppercase tracking-wider text-left">
                            <tr>
                                <th className="p-4">학생 이름</th>
                                <th className="p-4 text-center">잔여 보강권</th>
                                <th className="p-4 text-center">관리</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-line text-ink-soft">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={3} className="p-8 text-center text-ink-faint font-medium">불러오는 중..</td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="p-8 text-center text-ink-faint font-medium">표시할 학생이 없습니다.</td>
                                </tr>
                            ) : (
                                filtered.map((c) => {
                                    const isExpanded = expandedStudentUuid === c.studentUuid;
                                    const details = detailsByStudent[c.studentUuid];
                                    return (
                                        <React.Fragment key={c.studentUuid}>
                                            <tr className="hover:bg-line-soft/70 transition">
                                                <td className="p-4 font-bold text-ink">
                                                    {c.managementName || c.name}
                                                    {c.managementName && c.managementName !== c.name && (
                                                        <span className="text-ink-faint text-xs font-normal ml-1">({c.name})</span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {/* 🎯 잔여 0개여도 사용/만료된 이력은 남아있을 수 있으므로 항상 클릭해서 이력을 볼 수 있게 한다. */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleDetail(c.studentUuid)}
                                                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full transition cursor-pointer ${
                                                            c.remainingTicketCount === 0
                                                                ? 'bg-line-soft text-ink-faint hover:bg-line-soft'
                                                                : isExpanded
                                                                    ? 'bg-accent text-paper-raised'
                                                                    : 'bg-accent-soft text-accent-hover hover:bg-accent-soft'
                                                        }`}
                                                    >
                                                        🎫 {c.remainingTicketCount}개
                                                        <span className="text-[10px]">{isExpanded ? '▲' : '▼'}</span>
                                                    </button>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => openGrantModal(c.studentUuid)}
                                                        className="px-2.5 py-1 text-xs font-bold text-success bg-success-soft hover:bg-success-soft border border-success-soft rounded-lg transition"
                                                    >
                                                        🎁 지급
                                                    </button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-line-soft/60">
                                                    <td colSpan={3} className="p-4">
                                                        {isLoadingDetail === c.studentUuid ? (
                                                            <p className="text-xs text-ink-faint text-center py-2">불러오는 중..</p>
                                                        ) : !details || details.length === 0 ? (
                                                            <p className="text-xs text-ink-faint text-center py-2">상세 내역이 없습니다.</p>
                                                        ) : (
                                                            <ul className="space-y-2">
                                                                {details.map((d) => (
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
                                                                                    <span className="text-ink-faint">· {d.teacherName} 선생님</span>
                                                                                </div>
                                                                            )}
                                                                            <span className="text-[11px] text-ink-faint">
                                                                                {d.expiredAt ? `⏳ ${d.expiredAt.slice(0, 10)}까지 유효` : '⏳ 기한 제한 없음'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                                            <span className={`inline-flex w-fit px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[d.status].className}`}>
                                                                                {STATUS_LABELS[d.status].label}
                                                                            </span>
                                                                            <span className="inline-flex w-fit px-2 py-0.5 rounded-full bg-line-soft text-ink-soft font-medium">
                                                                                {SOURCE_LABELS[d.source]}
                                                                            </span>
                                                                        </div>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* 🎁 보강권 수동 부여 모달 */}
            {isGrantModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-paper-raised w-full max-w-sm rounded-lg shadow-lg my-8 animate-fade-in">
                        <form onSubmit={handleSubmitGrant}>
                            <div className="p-6 bg-gradient-to-r from-success-soft to-success-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-ink">🎁 보강권 수동 부여</h3>
                                    <p className="text-xs text-ink-faint mt-1">앱 도입 전 보유하던 잔여 보강권을 등록하거나, 필요에 따라 추가로 지급합니다.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsGrantModalOpen(false)}
                                    className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1.5">지급 대상 학생 *</label>
                                    {counts.length === 0 ? (
                                        <div className="p-3 text-xs text-ink-faint border border-line-soft rounded-lg bg-line-soft/50">
                                            소속 수강생이 없습니다.
                                        </div>
                                    ) : (
                                        <select
                                            required
                                            value={grantForm.studentUuid}
                                            onChange={(e) => setGrantForm({ ...grantForm, studentUuid: e.target.value })}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        >
                                            {counts.map((c) => (
                                                <option key={c.studentUuid} value={c.studentUuid}>
                                                    {c.managementName || c.name} (현재 {c.remainingTicketCount}개)
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">지급 개수 *</label>
                                    <input
                                        type="number"
                                        required
                                        min={1}
                                        max={50}
                                        value={grantForm.quantity}
                                        onChange={(e) => setGrantForm({ ...grantForm, quantity: Number(e.target.value) })}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">유효기간 (일) *</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={1}
                                            disabled={grantForm.unlimited}
                                            value={grantForm.validityDays}
                                            onChange={(e) => setGrantForm({ ...grantForm, validityDays: e.target.value })}
                                            placeholder="예: 60"
                                            className="flex-1 px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink disabled:opacity-50 disabled:bg-line-soft"
                                        />
                                        <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft whitespace-nowrap cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={grantForm.unlimited}
                                                onChange={(e) => setGrantForm({ ...grantForm, unlimited: e.target.checked })}
                                                className="accent-[var(--color-accent)]"
                                            />
                                            기한 제한 없음
                                        </label>
                                    </div>
                                    <p className="mt-1 text-[11px] text-ink-faint">지급일로부터 이 기간이 지나면 자동으로 사용할 수 없게 됩니다.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">지급 사유 (선택)</label>
                                    <input
                                        type="text"
                                        value={grantForm.memo}
                                        onChange={(e) => setGrantForm({ ...grantForm, memo: e.target.value })}
                                        placeholder="예: 학원 이전 전 잔여분 이관"
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    />
                                </div>
                            </div>

                            <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsGrantModalOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingGrant || counts.length === 0}
                                    className="px-5 py-2 text-xs font-bold bg-success hover:bg-success-hover text-paper-raised rounded-lg shadow-sm transition disabled:bg-line"
                                >
                                    {isSubmittingGrant ? '지급 중..' : '✨ 지급'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ⚙️ 보강권 전체 정책(원장 전용) 설정 모달 */}
            {isPolicyModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-paper-raised w-full max-w-sm rounded-lg shadow-lg my-8 animate-fade-in">
                        <form onSubmit={handleSubmitPolicy}>
                            <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-ink">⚙️ 보강권 전체 설정</h3>
                                    <p className="text-xs text-ink-faint mt-1">학원 전체에 적용되는 보강권 발급 제한입니다. 각 항목은 "제한 없음"으로 둘 수 있습니다.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsPolicyModalOpen(false)}
                                    className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">학생 1인당 최대 보유(미사용) 개수</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={1}
                                            disabled={policyForm.maxOutstandingUnlimited}
                                            value={policyForm.maxOutstandingTickets}
                                            onChange={(e) => setPolicyForm({ ...policyForm, maxOutstandingTickets: e.target.value })}
                                            placeholder="예: 5"
                                            className="flex-1 px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink disabled:opacity-50 disabled:bg-line-soft"
                                        />
                                        <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft whitespace-nowrap cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={policyForm.maxOutstandingUnlimited}
                                                onChange={(e) => setPolicyForm({ ...policyForm, maxOutstandingUnlimited: e.target.checked })}
                                                className="accent-[var(--color-accent)]"
                                            />
                                            제한 없음
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">학생 1인당 월 발급 제한</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={1}
                                            disabled={policyForm.monthlyIssueUnlimited}
                                            value={policyForm.monthlyIssueLimit}
                                            onChange={(e) => setPolicyForm({ ...policyForm, monthlyIssueLimit: e.target.value })}
                                            placeholder="예: 3"
                                            className="flex-1 px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink disabled:opacity-50 disabled:bg-line-soft"
                                        />
                                        <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft whitespace-nowrap cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={policyForm.monthlyIssueUnlimited}
                                                onChange={(e) => setPolicyForm({ ...policyForm, monthlyIssueUnlimited: e.target.checked })}
                                                className="accent-[var(--color-accent)]"
                                            />
                                            제한 없음
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">기본 유효기간 (일)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={1}
                                            disabled={policyForm.defaultValidityUnlimited}
                                            value={policyForm.defaultValidityDays}
                                            onChange={(e) => setPolicyForm({ ...policyForm, defaultValidityDays: e.target.value })}
                                            placeholder="예: 60"
                                            className="flex-1 px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink disabled:opacity-50 disabled:bg-line-soft"
                                        />
                                        <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft whitespace-nowrap cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={policyForm.defaultValidityUnlimited}
                                                onChange={(e) => setPolicyForm({ ...policyForm, defaultValidityUnlimited: e.target.checked })}
                                                className="accent-[var(--color-accent)]"
                                            />
                                            제한 없음
                                        </label>
                                    </div>
                                    <p className="mt-1 text-[11px] text-ink-faint">결석/휴무로 자동 발급되는 보강권과, 수동 지급 시 입력칸의 기본값에 쓰입니다.</p>
                                </div>

                                <p className="text-[11px] text-ink-faint leading-relaxed border-t border-line-soft pt-3">
                                    ※ 최대 보유 개수/월 발급 제한은 결석 신청(학부모)과 수동 지급에만 적용됩니다. 학원 휴무로 자동
                                    발급되는 보강권은 학생 귀책이 아니므로 제한과 무관하게 항상 발급됩니다.
                                </p>
                            </div>

                            <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsPolicyModalOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingPolicy}
                                    className="px-5 py-2 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition disabled:opacity-50"
                                >
                                    {isSubmittingPolicy ? '저장 중..' : '✨ 저장'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </CommonMenuBar>
    );
}

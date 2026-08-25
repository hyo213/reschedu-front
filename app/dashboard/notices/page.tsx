'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import CommonMenuBar from '../components/commonMenuBar';

interface NoticeItem {
    uuid: string;
    academyId: number;
    academyName: string;
    title: string;
    content: string;
    authorName: string;
    authorRole: string;
    visible: boolean;
    visibleFrom: string | null;
    visibleUntil: string | null;
    currentlyVisible: boolean;
    createdAt: string;
}

interface AcademyOption {
    id: number;
    name: string;
}

interface NoticeFormState {
    title: string;
    content: string;
    visible: boolean;
    visibleFrom: string;
    visibleUntil: string;
}

const EMPTY_FORM: NoticeFormState = {
    title: '',
    content: '',
    visible: true,
    visibleFrom: '',
    visibleUntil: '',
};

function formatDate(iso: string): string {
    return iso.slice(0, 10);
}

export default function NoticeListPage() {
    const router = useRouter();
    const [myRole, setMyRole] = useState('');
    const [notices, setNotices] = useState<NoticeItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState<NoticeFormState>(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);

    // 학부모는 자녀가 다니는 여러 학원 중 하나를 골라 그 학원의 공지만 본다.
    const [academies, setAcademies] = useState<AcademyOption[]>([]);
    const [selectedAcademyId, setSelectedAcademyId] = useState('');

    const canWrite = myRole === 'ADMIN' || myRole === 'TEACHER';

    useEffect(() => {
        const role = sessionStorage.getItem('userRole') || '';
        setMyRole(role);
        if (role === 'PARENT') {
            fetchMyChildrenAcademies();
        } else {
            setSelectedAcademyId(sessionStorage.getItem('academyId') || '');
        }
    }, []);

    useEffect(() => {
        if (!selectedAcademyId || !myRole) return;
        fetchNotices(myRole, selectedAcademyId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myRole, selectedAcademyId]);

    const fetchMyChildrenAcademies = async () => {
        try {
            const res = await axios.get('/api/members/my-children-academies');
            const list: AcademyOption[] = res.data;
            setAcademies(list);
            if (list.length > 0) {
                setSelectedAcademyId(String(list[0].id));
            } else {
                setSelectedAcademyId(sessionStorage.getItem('academyId') || '');
            }
        } catch (error) {
            console.error('자녀 학원 목록 조회 실패:', error);
        }
    };

    const fetchNotices = async (role: string, academyId: string) => {
        setIsLoading(true);
        try {
            const isWriter = role === 'ADMIN' || role === 'TEACHER';
            const url = isWriter
                ? `/api/notices?academyId=${academyId}`
                : `/api/notices/active?academyId=${academyId}`;

            const res = await axios.get(url);
            setNotices(res.data);
        } catch (error) {
            console.error('공지사항 목록 조회 실패:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFormChange = <K extends keyof NoticeFormState>(field: K, value: NoticeFormState[K]) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const openCreateModal = () => {
        setForm(EMPTY_FORM);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const academyId = sessionStorage.getItem('academyId');
            await axios.post(`/api/notices?academyId=${academyId}`, {
                title: form.title,
                content: form.content,
                visible: form.visible,
                visibleFrom: form.visibleFrom || null,
                visibleUntil: form.visibleUntil || null,
            });
            setIsModalOpen(false);
            fetchNotices(myRole, selectedAcademyId);
        } catch (error) {
            const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
            alert(msg || '공지 작성 중 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <CommonMenuBar>
            <main className="p-6 max-w-5xl w-full mx-auto animate-fade-in">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-bold text-ink">📢 공지사항</h1>
                        <p className="text-ink-faint text-sm mt-1">소속 학원의 공지사항을 확인합니다.</p>
                    </div>
                    {canWrite && (
                        <button
                            onClick={openCreateModal}
                            className="px-4 py-2.5 text-sm font-semibold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition"
                        >
                            + 새 공지 작성
                        </button>
                    )}
                </div>

                {myRole === 'PARENT' && academies.length > 1 && (
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

                <div className="bg-paper-raised rounded-lg border border-line shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-line-soft text-ink-faint text-xs uppercase">
                                <th className="px-4 py-3 text-left font-semibold">제목</th>
                                <th className="px-4 py-3 text-left font-semibold w-28">작성자</th>
                                <th className="px-4 py-3 text-left font-semibold w-28">작성일</th>
                                {canWrite && <th className="px-4 py-3 text-left font-semibold w-20">노출</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-faint text-xs">불러오는 중..</td></tr>
                            ) : notices.length === 0 ? (
                                <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-faint text-xs">등록된 공지사항이 없습니다.</td></tr>
                            ) : (
                                notices.map((notice) => (
                                    <tr
                                        key={notice.uuid}
                                        onClick={() => router.push(`/dashboard/notices/${notice.uuid}?academyId=${notice.academyId}`)}
                                        className="border-t border-line-soft hover:bg-line-soft cursor-pointer transition"
                                    >
                                        <td className="px-4 py-3 text-ink font-medium">{notice.title}</td>
                                        <td className="px-4 py-3 text-ink-soft text-xs">{notice.authorName}</td>
                                        <td className="px-4 py-3 text-ink-faint text-xs">{formatDate(notice.createdAt)}</td>
                                        {canWrite && (
                                            <td className="px-4 py-3">
                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${notice.currentlyVisible ? 'bg-accent-soft text-accent' : 'bg-line-soft text-ink-faint'}`}>
                                                    {notice.currentlyVisible ? '노출중' : '숨김'}
                                                </span>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {isModalOpen && (
                    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-paper-raised w-full max-w-lg rounded-lg shadow-lg my-8 animate-fade-in">
                            <form onSubmit={handleSubmit}>
                                <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-ink">📢 새 공지 작성</h3>
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                </div>

                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-ink-soft mb-1">제목 *</label>
                                        <input
                                            type="text"
                                            required
                                            value={form.title}
                                            onChange={(e) => handleFormChange('title', e.target.value)}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-ink-soft mb-1">내용 *</label>
                                        <textarea
                                            required
                                            rows={6}
                                            value={form.content}
                                            onChange={(e) => handleFormChange('content', e.target.value)}
                                            className="w-full p-3 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            id="visible-toggle"
                                            type="checkbox"
                                            checked={form.visible}
                                            onChange={(e) => handleFormChange('visible', e.target.checked)}
                                            className="w-4 h-4 accent-accent"
                                        />
                                        <label htmlFor="visible-toggle" className="text-xs font-semibold text-ink-soft">즉시 노출</label>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1">노출 시작일 (선택)</label>
                                            <input
                                                type="date"
                                                value={form.visibleFrom}
                                                onChange={(e) => handleFormChange('visibleFrom', e.target.value)}
                                                className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-ink-soft mb-1">노출 종료일 (선택)</label>
                                            <input
                                                type="date"
                                                value={form.visibleUntil}
                                                onChange={(e) => handleFormChange('visibleUntil', e.target.value)}
                                                className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-ink-faint">💡 노출 기간을 비워두면 노출 스위치가 꺼지기 전까지 계속 노출됩니다.</p>
                                </div>

                                <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="px-4 py-2 text-xs font-bold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition disabled:opacity-50"
                                    >
                                        {isSaving ? '등록 중..' : '등록'}
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

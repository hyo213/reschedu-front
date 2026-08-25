'use client';

import { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import CommonMenuBar from '../../components/commonMenuBar';

interface NoticeDetail {
    uuid: string;
    title: string;
    content: string;
    authorName: string;
    authorRole: string;
    visible: boolean;
    visibleFrom: string | null;
    visibleUntil: string | null;
    currentlyVisible: boolean;
    createdAt: string;
    updatedAt: string;
}

interface NoticeFormState {
    title: string;
    content: string;
    visible: boolean;
    visibleFrom: string;
    visibleUntil: string;
}

function formatDateTime(iso: string): string {
    return iso.slice(0, 16).replace('T', ' ');
}

export default function NoticeDetailPage({ params }: { params: Promise<{ uuid: string }> }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { uuid } = use(params);
    // academyId는 쿼리로 전달(학부모가 자녀 학원의 공지를 볼 수도 있음), 없으면 세션 값 사용.
    // sessionStorage는 클라이언트 전용이라 렌더 바디가 아닌 fetch 시점에만 읽는다.
    const resolveAcademyId = () => searchParams.get('academyId') || sessionStorage.getItem('academyId') || '';

    const [myRole, setMyRole] = useState('');
    const [notice, setNotice] = useState<NoticeDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState<NoticeFormState | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const canWrite = myRole === 'ADMIN' || myRole === 'TEACHER';

    useEffect(() => {
        setMyRole(sessionStorage.getItem('userRole') || '');
        fetchNotice();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uuid]);

    const fetchNotice = async () => {
        setIsLoading(true);
        try {
            const academyId = resolveAcademyId();
            const res = await axios.get(`/api/notices/${uuid}?academyId=${academyId}`);
            setNotice(res.data);
        } catch (error) {
            const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
            setErrorMessage(msg || '공지사항을 불러오지 못했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const startEdit = () => {
        if (!notice) return;
        setForm({
            title: notice.title,
            content: notice.content,
            visible: notice.visible,
            visibleFrom: notice.visibleFrom || '',
            visibleUntil: notice.visibleUntil || '',
        });
        setIsEditing(true);
    };

    const handleFormChange = <K extends keyof NoticeFormState>(field: K, value: NoticeFormState[K]) => {
        setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;
        setIsSaving(true);
        try {
            const academyId = sessionStorage.getItem('academyId');
            const res = await axios.patch(`/api/notices/${uuid}?academyId=${academyId}`, {
                title: form.title,
                content: form.content,
                visible: form.visible,
                visibleFrom: form.visibleFrom || null,
                visibleUntil: form.visibleUntil || null,
            });
            setNotice(res.data);
            setIsEditing(false);
        } catch (error) {
            const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
            alert(msg || '공지 수정 중 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('이 공지사항을 삭제하시겠습니까?')) return;
        try {
            const academyId = sessionStorage.getItem('academyId');
            await axios.delete(`/api/notices/${uuid}?academyId=${academyId}`);
            router.push('/dashboard/notices');
        } catch (error) {
            const msg = axios.isAxiosError(error) ? error.response?.data?.message : null;
            alert(msg || '공지 삭제 중 오류가 발생했습니다.');
        }
    };

    return (
        <CommonMenuBar>
            <main className="p-6 max-w-3xl w-full mx-auto animate-fade-in">
                <button
                    onClick={() => router.push('/dashboard/notices')}
                    className="text-xs font-semibold text-ink-faint hover:text-ink-soft mb-4 inline-flex items-center gap-1"
                >
                    ← 목록으로
                </button>

                {isLoading ? (
                    <div className="p-10 text-center text-ink-faint text-sm">불러오는 중..</div>
                ) : errorMessage || !notice ? (
                    <div className="p-10 text-center text-danger text-sm">{errorMessage || '공지사항을 찾을 수 없습니다.'}</div>
                ) : !isEditing ? (
                    <div className="bg-paper-raised rounded-lg border border-line shadow-sm p-6">
                        <div className="flex items-start justify-between gap-4 border-b border-line-soft pb-4 mb-4">
                            <div>
                                <h1 className="text-lg font-bold text-ink">{notice.title}</h1>
                                <p className="text-xs text-ink-faint mt-1.5">
                                    {notice.authorName} · {formatDateTime(notice.createdAt)}
                                </p>
                            </div>
                            {canWrite && (
                                <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${notice.currentlyVisible ? 'bg-accent-soft text-accent' : 'bg-line-soft text-ink-faint'}`}>
                                    {notice.currentlyVisible ? '노출중' : '숨김'}
                                </span>
                            )}
                        </div>

                        <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed min-h-[6rem]">{notice.content}</p>

                        {canWrite && (
                            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-line-soft">
                                <button
                                    onClick={handleDelete}
                                    className="px-4 py-2 text-xs font-bold text-danger hover:bg-danger-soft rounded-lg transition border border-transparent hover:border-danger/20"
                                >
                                    삭제
                                </button>
                                <button
                                    onClick={startEdit}
                                    className="px-4 py-2 text-xs font-bold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition"
                                >
                                    수정
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    form && (
                        <form onSubmit={handleUpdate} className="bg-paper-raised rounded-lg border border-line shadow-sm p-6 space-y-4">
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
                                    rows={8}
                                    value={form.content}
                                    onChange={(e) => handleFormChange('content', e.target.value)}
                                    className="w-full p-3 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    id="visible-toggle-edit"
                                    type="checkbox"
                                    checked={form.visible}
                                    onChange={(e) => handleFormChange('visible', e.target.checked)}
                                    className="w-4 h-4 accent-accent"
                                />
                                <label htmlFor="visible-toggle-edit" className="text-xs font-semibold text-ink-soft">노출함</label>
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

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(false)}
                                    className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-4 py-2 text-xs font-bold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition disabled:opacity-50"
                                >
                                    {isSaving ? '저장 중..' : '저장'}
                                </button>
                            </div>
                        </form>
                    )
                )}
            </main>
        </CommonMenuBar>
    );
}

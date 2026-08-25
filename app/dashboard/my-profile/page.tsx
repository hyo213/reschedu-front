'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import CommonMenuBar from '../components/commonMenuBar';

interface MyProfile {
    uuid: string;
    email: string | null;
    name: string;
    phone: string;
    role: string;
    academyId: number | null;
}

interface ChildAcademyRegistration {
    academyId: number;
    academyName: string;
    isApproved: boolean;
}

interface MyChildDetail {
    uuid: string;
    name: string;
    birthDate: string | null;
    gender: string;
    childPhone: string | null;
    schoolName: string | null;
    isApproved: boolean;
    academies: ChildAcademyRegistration[];
}

interface ChildFormState {
    name: string;
    birthDate: string;
    gender: string;
    schoolName: string;
    childPhone: string;
}

interface AcademySearchResult {
    id: number;
    name: string;
    address: string;
}

const EMPTY_CHILD_FORM: ChildFormState = {
    name: '',
    birthDate: '',
    gender: 'MALE',
    schoolName: '',
    childPhone: '',
};

const getRoleLabel = (role: string) => {
    if (role === 'ADMIN') return '원장';
    if (role === 'TEACHER') return '강사';
    return '학부모';
};

export default function MyProfilePage() {
    const router = useRouter();
    const [profile, setProfile] = useState<MyProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [children, setChildren] = useState<MyChildDetail[]>([]);
    const [isLoadingChildren, setIsLoadingChildren] = useState(false);
    const [isChildModalOpen, setIsChildModalOpen] = useState(false);
    const [editingChildUuid, setEditingChildUuid] = useState<string | null>(null);
    const [childForm, setChildForm] = useState<ChildFormState>(EMPTY_CHILD_FORM);
    const [isSubmittingChild, setIsSubmittingChild] = useState(false);
    // 수정 중인 자녀가 등록된 학원 목록 + 새 학원 추가 액션용 로딩 상태
    const [editingChildAcademies, setEditingChildAcademies] = useState<ChildAcademyRegistration[]>([]);
    const [isAddingAcademy, setIsAddingAcademy] = useState(false);

    const [academyKeyword, setAcademyKeyword] = useState('');
    const [academySearchResults, setAcademySearchResults] = useState<AcademySearchResult[]>([]);
    const [selectedAcademy, setSelectedAcademy] = useState<AcademySearchResult | null>(null);
    const [isSearchingAcademy, setIsSearchingAcademy] = useState(false);

    useEffect(() => {
        fetchMyProfile();
    }, []);

    const fetchMyChildren = async () => {
        setIsLoadingChildren(true);
        try {
            const res = await axios.get('/api/members/my-children/detail');
            setChildren(res.data);
        } catch (error) {
            console.error('자녀 정보 조회 실패:', error);
        } finally {
            setIsLoadingChildren(false);
        }
    };

    const openAddChildModal = () => {
        setEditingChildUuid(null);
        setChildForm(EMPTY_CHILD_FORM);
        setAcademyKeyword('');
        setAcademySearchResults([]);
        setSelectedAcademy(null);
        setIsChildModalOpen(true);
    };

    const handleSearchAcademy = async () => {
        if (!academyKeyword.trim()) return;
        setIsSearchingAcademy(true);
        try {
            const res = await axios.get(`/api/academies/search?keyword=${academyKeyword}`);
            setAcademySearchResults(res.data);
        } catch (error) {
            console.error('학원 검색 실패:', error);
        } finally {
            setIsSearchingAcademy(false);
        }
    };

    const openEditChildModal = (child: MyChildDetail) => {
        setEditingChildUuid(child.uuid);
        setChildForm({
            name: child.name,
            birthDate: child.birthDate || '',
            gender: child.gender || 'MALE',
            schoolName: child.schoolName || '',
            childPhone: child.childPhone || '',
        });
        setEditingChildAcademies(child.academies);
        setAcademyKeyword('');
        setAcademySearchResults([]);
        setSelectedAcademy(null);
        setIsChildModalOpen(true);
    };

    // 기존 자녀를 다른 학원에도 등록(자녀 레코드는 새로 만들지 않음)
    const handleAddAcademyToChild = async () => {
        if (!editingChildUuid || !selectedAcademy) return;
        try {
            setIsAddingAcademy(true);
            await axios.post(`/api/members/my-children/${editingChildUuid}/academies`, {
                academyId: selectedAcademy.id,
                schoolName: childForm.schoolName.trim(),
            });
            alert(`${selectedAcademy.name}에 추가되었습니다. 해당 학원 원장/강사의 승인 후 시간표 배정이 가능합니다.`);
            setAcademyKeyword('');
            setAcademySearchResults([]);
            setSelectedAcademy(null);
            const res = await axios.get('/api/members/my-children/detail');
            setChildren(res.data);
            const updated = (res.data as MyChildDetail[]).find((c) => c.uuid === editingChildUuid);
            if (updated) setEditingChildAcademies(updated.academies);
        } catch (error: any) {
            const msg = error.response?.data?.message || '학원 추가 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsAddingAcademy(false);
        }
    };

    const handleChildFormChange = <K extends keyof ChildFormState>(field: K, value: ChildFormState[K]) => {
        setChildForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleChildSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingChildUuid && !selectedAcademy) {
            alert('자녀를 등록할 학원을 검색해서 선택해주세요.');
            return;
        }
        try {
            setIsSubmittingChild(true);
            const payload = {
                name: childForm.name.trim(),
                birthDate: childForm.birthDate,
                gender: childForm.gender,
                schoolName: childForm.schoolName.trim(),
                childPhone: childForm.childPhone.trim() || null,
            };

            if (editingChildUuid) {
                await axios.patch(`/api/members/my-children/${editingChildUuid}`, payload);
                alert('자녀 정보가 수정되었습니다.');
            } else {
                await axios.post('/api/members/my-children', { ...payload, academyId: selectedAcademy!.id });
                alert('자녀가 추가되었습니다. 원장/강사의 승인 후 정상 이용할 수 있습니다.');
            }
            setIsChildModalOpen(false);
            fetchMyChildren();
        } catch (error: any) {
            const msg = error.response?.data?.message || '자녀 정보 저장 중 오류가 발생했습니다.';
            alert(`[에러] ${msg}`);
        } finally {
            setIsSubmittingChild(false);
        }
    };

    const fetchMyProfile = async () => {
        try {
            setIsLoading(true);
            const response = await axios.get('/api/members/me');
            const data: MyProfile = response.data;
            setProfile(data);
            setName(data.name);
            setPhone(data.phone);
            if (data.role === 'PARENT') {
                fetchMyChildren();
            }
        } catch (error) {
            console.error('내 정보 조회 실패:', error);
            alert('내 정보를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const wantsPasswordChange = newPassword.trim() !== '' || currentPassword.trim() !== '';
        if (wantsPasswordChange && newPassword !== newPasswordConfirm) {
            alert('새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.');
            return;
        }

        try {
            setIsSubmitting(true);
            await axios.patch('/api/members/me', {
                name: name.trim(),
                phone: phone.trim(),
                currentPassword: currentPassword.trim() === '' ? null : currentPassword,
                newPassword: newPassword.trim() === '' ? null : newPassword,
            });

            // 메뉴바 환영 메시지도 즉시 새 이름으로 반영되도록 세션 값 갱신
            sessionStorage.setItem('userName', name.trim());

            setCurrentPassword('');
            setNewPassword('');
            setNewPasswordConfirm('');
            alert('회원 정보가 수정되었습니다.');
            router.refresh();
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || '회원 정보 수정 중 오류가 발생했습니다.';
            alert(`[에러] ${errorMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <CommonMenuBar>
            <div className="max-w-2xl mx-auto p-4 sm:p-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-black text-ink">회원 정보 수정</h1>
                    <p className="text-sm text-ink-faint mt-1">가입 시 입력한 본인 계정 정보를 확인하고 수정할 수 있습니다.</p>
                </div>

                {isLoading || !profile ? (
                    <div className="text-center text-ink-faint py-20">불러오는 중...</div>
                ) : (
                    <form onSubmit={handleSubmit} className="bg-paper-raised rounded-lg shadow-sm border border-line-soft p-6 sm:p-8 space-y-8">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="bg-accent-soft text-accent-hover text-xs font-semibold px-2.5 py-1 rounded-full">
                                    {getRoleLabel(profile.role)}
                                </span>
                            </div>

                            {profile.email && (
                                <div>
                                    <label className="block text-sm font-semibold text-ink-soft mb-1.5">이메일</label>
                                    <input
                                        type="text"
                                        value={profile.email}
                                        disabled
                                        className="w-full border border-line bg-line-soft text-ink-faint rounded-lg px-3.5 py-2.5 text-sm cursor-not-allowed"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-ink-soft mb-1.5">이름</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="w-full border border-line rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-ink-soft mb-1.5">연락처</label>
                                <input
                                    type="text"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    required
                                    className="w-full border border-line rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>
                        </div>

                        <div className="border-t border-line-soft pt-6 space-y-4">
                            <div>
                                <h2 className="text-sm font-bold text-ink">비밀번호 변경</h2>
                                <p className="text-xs text-ink-faint mt-0.5">비밀번호를 바꾸지 않으려면 아래 항목을 비워 두세요.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-ink-soft mb-1.5">현재 비밀번호</label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    autoComplete="current-password"
                                    className="w-full border border-line rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-ink-soft mb-1.5">새 비밀번호</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    autoComplete="new-password"
                                    minLength={8}
                                    className="w-full border border-line rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-ink-soft mb-1.5">새 비밀번호 확인</label>
                                <input
                                    type="password"
                                    value={newPasswordConfirm}
                                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                                    autoComplete="new-password"
                                    minLength={8}
                                    className="w-full border border-line rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-accent hover:bg-accent-hover disabled:bg-line text-paper-raised font-bold py-3 rounded-lg transition"
                        >
                            {isSubmitting ? '저장 중...' : '저장하기'}
                        </button>
                    </form>
                )}

                {!isLoading && profile?.role === 'PARENT' && (
                    <div className="bg-paper-raised rounded-lg shadow-sm border border-line-soft p-6 sm:p-8 mt-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-sm font-bold text-ink">자녀 정보 관리</h2>
                                <p className="text-xs text-ink-faint mt-0.5">자녀를 추가하거나 인적사항을 수정할 수 있습니다.</p>
                            </div>
                            <button
                                type="button"
                                onClick={openAddChildModal}
                                className="px-3.5 py-2 text-xs font-bold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition"
                            >
                                + 자녀 추가
                            </button>
                        </div>

                        {isLoadingChildren ? (
                            <div className="p-6 text-center text-ink-faint text-xs">불러오는 중..</div>
                        ) : children.length === 0 ? (
                            <div className="p-6 text-center text-ink-faint text-xs border border-line-soft rounded-lg bg-line-soft/50">
                                등록된 자녀가 없습니다.
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {children.map((child) => (
                                    <div
                                        key={child.uuid}
                                        className="flex items-center justify-between gap-3 p-3.5 border border-line-soft rounded-lg"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-ink flex items-center gap-2">
                                                {child.name}
                                                {!child.isApproved && (
                                                    <span className="text-[10px] font-bold text-warning bg-warning-soft px-1.5 py-0.5 rounded-full">
                                                        승인 대기중
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-ink-faint mt-0.5 truncate">
                                                {child.birthDate || '생년월일 미입력'} · {child.gender === 'MALE' ? '남' : '여'}
                                                {child.schoolName && ` · ${child.schoolName}`}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => openEditChildModal(child)}
                                            className="shrink-0 px-3 py-1.5 text-xs font-bold text-ink-soft hover:bg-line-soft border border-line rounded-lg transition"
                                        >
                                            수정
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {isChildModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-paper-raised w-full max-w-md rounded-lg shadow-lg my-8 animate-fade-in">
                        <form onSubmit={handleChildSubmit}>
                            <div className="p-6 bg-gradient-to-r from-accent-soft to-warning-soft/50 border-b border-line-soft rounded-t-lg flex items-center justify-between">
                                <h3 className="text-lg font-bold text-ink">{editingChildUuid ? '✏️ 자녀 정보 수정' : '👶 자녀 추가'}</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsChildModalOpen(false)}
                                    className="text-ink-faint hover:text-ink-soft p-1 rounded-lg hover:bg-paper-raised/60 transition"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {!editingChildUuid && (
                                    <div className="p-3.5 bg-line-soft border border-line-soft rounded-lg space-y-2.5">
                                        <label className="block text-xs font-bold text-ink">🏢 등록할 학원 검색 *</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={academyKeyword}
                                                onChange={(e) => setAcademyKeyword(e.target.value)}
                                                placeholder="학원 이름을 검색하세요"
                                                className="flex-1 px-3 py-2 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleSearchAcademy}
                                                className="px-3 text-xs font-semibold bg-ink text-paper rounded-lg"
                                            >
                                                {isSearchingAcademy ? '검색중..' : '검색'}
                                            </button>
                                        </div>
                                        {academySearchResults.length > 0 && (
                                            <div className="max-h-32 overflow-y-auto border border-line bg-paper-raised rounded-lg text-xs divide-y divide-line">
                                                {academySearchResults.map((academy) => (
                                                    <div
                                                        key={academy.id}
                                                        onClick={() => { setSelectedAcademy(academy); setAcademySearchResults([]); }}
                                                        className="p-2.5 hover:bg-accent-soft cursor-pointer text-ink-soft"
                                                    >
                                                        <strong>{academy.name}</strong> <span className="text-ink-faint">({academy.address})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {selectedAcademy && (
                                            <div className="text-xs p-2.5 bg-accent-soft border border-accent/30 text-accent rounded-lg font-medium">
                                                선택됨: <span className="font-bold">{selectedAcademy.name}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {editingChildUuid && (
                                    <div className="p-3.5 bg-line-soft border border-line-soft rounded-lg space-y-2.5">
                                        <label className="block text-xs font-bold text-ink">🏢 다니는 학원</label>
                                        <div className="space-y-1.5">
                                            {editingChildAcademies.map((a) => (
                                                <div key={a.academyId} className="flex items-center justify-between text-xs p-2 bg-paper-raised border border-line-soft rounded-lg">
                                                    <span className="font-semibold text-ink">{a.academyName}</span>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.isApproved ? 'bg-accent-soft text-accent' : 'bg-warning-soft text-warning'}`}>
                                                        {a.isApproved ? '승인됨' : '승인 대기중'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="pt-1 border-t border-line-soft space-y-2">
                                            <label className="block text-[11px] font-bold text-ink-faint">+ 다른 학원도 다니게 하기</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={academyKeyword}
                                                    onChange={(e) => setAcademyKeyword(e.target.value)}
                                                    placeholder="학원 이름을 검색하세요"
                                                    className="flex-1 px-3 py-2 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleSearchAcademy}
                                                    className="px-3 text-xs font-semibold bg-ink text-paper rounded-lg"
                                                >
                                                    {isSearchingAcademy ? '검색중..' : '검색'}
                                                </button>
                                            </div>
                                            {academySearchResults.length > 0 && (
                                                <div className="max-h-32 overflow-y-auto border border-line bg-paper-raised rounded-lg text-xs divide-y divide-line">
                                                    {academySearchResults
                                                        .filter((academy) => !editingChildAcademies.some((a) => a.academyId === academy.id))
                                                        .map((academy) => (
                                                            <div
                                                                key={academy.id}
                                                                onClick={() => { setSelectedAcademy(academy); setAcademySearchResults([]); }}
                                                                className="p-2.5 hover:bg-accent-soft cursor-pointer text-ink-soft"
                                                            >
                                                                <strong>{academy.name}</strong> <span className="text-ink-faint">({academy.address})</span>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                            {selectedAcademy && (
                                                <div className="flex items-center justify-between gap-2 text-xs p-2.5 bg-accent-soft border border-accent/30 text-accent rounded-lg font-medium">
                                                    <span>선택됨: <span className="font-bold">{selectedAcademy.name}</span></span>
                                                    <button
                                                        type="button"
                                                        disabled={isAddingAcademy}
                                                        onClick={handleAddAcademyToChild}
                                                        className="px-2.5 py-1 text-[11px] font-bold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition disabled:opacity-50"
                                                    >
                                                        {isAddingAcademy ? '추가 중..' : '이 학원에 추가'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">자녀 이름 *</label>
                                    <input
                                        type="text"
                                        required
                                        value={childForm.name}
                                        onChange={(e) => handleChildFormChange('name', e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-paper-raised text-ink"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-ink-soft mb-1">성별 *</label>
                                        <select
                                            required
                                            value={childForm.gender}
                                            onChange={(e) => handleChildFormChange('gender', e.target.value)}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        >
                                            <option value="MALE">남학생</option>
                                            <option value="FEMALE">여학생</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-ink-soft mb-1">생년월일 *</label>
                                        <input
                                            type="date"
                                            required
                                            value={childForm.birthDate}
                                            onChange={(e) => handleChildFormChange('birthDate', e.target.value)}
                                            className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">소속 학교명 *</label>
                                    <input
                                        type="text"
                                        required
                                        value={childForm.schoolName}
                                        onChange={(e) => handleChildFormChange('schoolName', e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-ink-soft mb-1">자녀 본인 연락처 (선택)</label>
                                    <input
                                        type="tel"
                                        value={childForm.childPhone}
                                        onChange={(e) => handleChildFormChange('childPhone', e.target.value)}
                                        placeholder="010-0000-0000"
                                        className="w-full px-3 py-2.5 text-sm border border-line rounded-lg outline-none bg-paper-raised text-ink"
                                    />
                                </div>
                                {!editingChildUuid && (
                                    <p className="text-[11px] text-ink-faint">💡 추가한 자녀는 원장/강사 승인 후 정상적으로 이용할 수 있습니다.</p>
                                )}
                            </div>

                            <div className="px-6 py-4 bg-line-soft border-t border-line-soft rounded-b-lg flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsChildModalOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-ink-faint hover:text-ink-soft hover:bg-line-soft rounded-lg transition"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingChild}
                                    className="px-4 py-2 text-xs font-bold text-paper-raised bg-accent hover:bg-accent-hover rounded-lg transition disabled:opacity-50"
                                >
                                    {isSubmittingChild ? '저장 중..' : '저장'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </CommonMenuBar>
    );
}

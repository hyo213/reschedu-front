'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

interface Academy {
    id: number;
    name: string;
    address: string;
}

interface ChildForm {
    childName: string;
    birthDate: string;
    gender: string;
    schoolName: string;
    childPhone: string;
}

export default function SignUpPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState('PARENT');
    const [phone, setPhone] = useState('');

    const [children, setChildren] = useState<ChildForm[]>([
        { childName: '', birthDate: '', gender: '', schoolName: '', childPhone: '' }
    ]);

    const [academyKeyword, setAcademyKeyword] = useState('');
    const [searchResults, setSearchResults] = useState<Academy[]>([]);
    const [selectedAcademy, setSelectedAcademy] = useState<Academy | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [academySearchMessage, setAcademySearchMessage] = useState('');

    const [isCustomAcademyMode, setIsCustomAcademyMode] = useState(false);
    const [newAcademyName, setNewAcademyName] = useState('');
    const [newAcademyAddress, setNewAcademyAddress] = useState('');

    const [emailError, setEmailError] = useState('');
    const [isEmailAvailable, setIsEmailAvailable] = useState(false);

    const [isAuthSent, setIsAuthSent] = useState(false);
    const [authCode, setAuthCode] = useState('');
    const [isEmailVerified, setIsEmailVerified] = useState(false);

    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const today = new Date().toISOString().split('T')[0];

    useEffect(() => {
        if (isAuthSent) return;
        if (!email) { setEmailError(''); setIsEmailAvailable(false); return; }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setEmailError('올바른 이메일 형식이 아닙니다.');
            setIsEmailAvailable(false);
            return;
        }

        const checkEmailDuplicate = async () => {
            try {
                await axios.get(`/api/members/check-email?email=${email}`);
                setEmailError('');
                setIsEmailAvailable(true);
            } catch (error: any) {
                if (error.response && error.response.data) {
                    setEmailError(error.response.data.message || '이미 등록된 이메일입니다.');
                } else {
                    setEmailError('중복 확인 중 오류가 발생했습니다.');
                }
                setIsEmailAvailable(false);
            }
        };
        checkEmailDuplicate();
    }, [email, isAuthSent]);

    useEffect(() => {
        setSelectedAcademy(null);
        setIsCustomAcademyMode(false);
        setSearchResults([]);
        setAcademyKeyword('');
        setAcademySearchMessage('');
        setPhone('');
        setChildren([{ childName: '', birthDate: '', gender: '', schoolName: '', childPhone: '' }]);
    }, [role]);

    const handleAddChild = () => {
        setChildren([...children, { childName: '', birthDate: '', gender: '', schoolName: '', childPhone: '' }]);
    };

    const handleRemoveChild = (index: number) => {
        if (children.length === 1) return;
        setChildren(children.filter((_, i) => i !== index));
    };

    const handleChildChange = (index: number, field: keyof ChildForm, value: string) => {
        setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
    };

    const handleSearchAcademy = async () => {
        if (!academyKeyword.trim()) return;
        setIsSearching(true);
        setAcademySearchMessage('');
        try {
            const response = await axios.get(`/api/academies/search?keyword=${academyKeyword}`);
            setSearchResults(response.data);
            if (response.data.length === 0) {
                setAcademySearchMessage('검색 결과가 없습니다.');
            }
        } catch (error) {
            alert('학원 검색 중 오류가 발생했습니다.');
        } finally {
            setIsSearching(false);
        }
    };

    const handleSendAuthCode = async () => {
        if (!isEmailAvailable) return;
        try {
            await axios.post('/api/members/email-auth/send', { email });
            setIsAuthSent(true);
            setErrorMessage('');
        } catch (error: any) {
            alert(error.response?.data || '인증번호 발송에 실패했습니다.');
        }
    };

    const handleVerifyAuthCode = async () => {
        try {
            await axios.post('/api/members/email-auth/verify', { email, code: authCode });
            setIsEmailVerified(true);
            setErrorMessage('');
        } catch (error: any) {
            alert(error.response?.data || '인증번호가 일치하지 않습니다.');
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');

        if (!isEmailVerified) {
            setErrorMessage('이메일 인증을 완료해야 가입이 가능합니다.');
            return;
        }

        if (!phone.trim()) {
            setErrorMessage('연락처는 필수 입력 값입니다.');
            return;
        }

        if (role === 'PARENT') {
            for (const child of children) {
                if (!child.childName.trim()) return setErrorMessage('자녀 이름은 필수 입력 사항입니다.');
                if (!child.gender) return setErrorMessage('자녀 성별을 선택해주세요.');
                if (!child.birthDate) return setErrorMessage('자녀 생년월일을 입력해주세요.');
                if (!child.schoolName.trim()) return setErrorMessage('School 이름을 입력해주세요.');
            }
        }

        let academyId = selectedAcademy?.id;

        try {
            if (role === 'ADMIN' && isCustomAcademyMode) {
                if (!newAcademyName.trim()) {
                    setErrorMessage('등록할 학원(센터) 이름을 입력해주세요.');
                    return;
                }
                const academyRegResponse = await axios.post('/api/academies/register', {
                    name: newAcademyName,
                    address: newAcademyAddress
                });
                academyId = academyRegResponse.data.id;
            }

            if (!academyId) {
                setErrorMessage('소속 학원(센터) 선택 또는 등록이 필수입니다.');
                return;
            }

            await axios.post('/api/members/signup', {
                email,
                password,
                name,
                role,
                academyId,
                phone,
                children: role === 'PARENT' ? children.map(c => ({
                    ...c,
                    childPhone: c.childPhone.trim() || null
                })) : []
            });

            setSuccessMessage('회원가입이 완료되었습니다! 잠시 후 로그인 화면으로 이동합니다.');
            setTimeout(() => { router.push('/'); }, 2000);

        } catch (error: any) {
            setErrorMessage(error.response?.data?.message || '서버와 통신 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="min-h-screen bg-paper flex items-center justify-center p-4">
            <div className="bg-paper-raised border border-line p-8 rounded-lg w-full sm:max-w-md my-8">
                <div className="mb-8 text-center">
                    <h1 className="font-display text-2xl text-ink">ReschEdu 가입</h1>
                    <p className="text-ink-faint text-sm mt-1">새로운 계정을 생성하세요</p>
                </div>

                <form onSubmit={handleSignUp} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-ink-soft mb-1">가입 유형</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full px-4 py-2.5 border border-line rounded-md outline-none text-ink bg-paper-raised"
                        >
                            <option value="PARENT">학부모</option>
                            <option value="TEACHER">선생님</option>
                            <option value="ADMIN">원장님 (학원 개설 가능)</option>
                        </select>
                    </div>

                    <div className="p-4 bg-line-soft border border-line rounded-lg space-y-3">
                        <label className="block text-sm font-bold text-ink">🏢 소속 학원 / 센터 설정</label>
                        {!isCustomAcademyMode ? (
                            <>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={academyKeyword}
                                        onChange={(e) => setAcademyKeyword(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-line rounded-md text-sm outline-none bg-paper-raised text-ink"
                                        placeholder="학원 이름을 검색하세요"
                                    />
                                    <button type="button" onClick={handleSearchAcademy} className="px-3 text-xs font-semibold bg-ink text-paper rounded-md">
                                        {isSearching ? '검색중..' : '검색'}
                                    </button>
                                </div>
                                {searchResults.length > 0 && (
                                    <div className="max-h-32 overflow-y-auto border border-line bg-paper-raised rounded-md text-xs divide-y divide-line">
                                        {searchResults.map((academy) => (
                                            <div key={academy.id} onClick={() => { setSelectedAcademy(academy); setSearchResults([]); setAcademySearchMessage(''); }} className="p-2.5 hover:bg-accent-soft cursor-pointer text-ink-soft">
                                                <strong>{academy.name}</strong> <span className="text-ink-faint">({academy.address})</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {selectedAcademy && (
                                    <div className="text-xs p-2.5 bg-accent-soft border border-accent/30 text-accent rounded-md font-medium">
                                        선택됨: <span className="font-bold">{selectedAcademy.name}</span>
                                    </div>
                                )}
                                {(academySearchMessage || role === 'ADMIN') && (
                                    <div className="flex items-center justify-between pt-1">
                                        {academySearchMessage && <p className="text-danger text-xs font-medium">{academySearchMessage}</p>}
                                        {role === 'ADMIN' && (
                                            <button type="button" onClick={() => { setIsCustomAcademyMode(true); setSelectedAcademy(null); setAcademySearchMessage(''); }} className="text-[11px] text-accent font-bold hover:underline ml-auto">
                                                ✨ 직접 등록하기
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="space-y-2.5">
                                <input type="text" value={newAcademyName} onChange={(e) => setNewAcademyName(e.target.value)} className="w-full px-3 py-2 border border-line rounded-md text-sm outline-none bg-paper-raised text-ink" placeholder="새로 개설할 학원명 입력" required />
                                <input type="text" value={newAcademyAddress} onChange={(e) => setNewAcademyAddress(e.target.value)} className="w-full px-3 py-2 border border-line rounded-md text-sm outline-none bg-paper-raised text-ink" placeholder="학원 주소 입력 (선택)" />
                                <div className="text-right">
                                    <button type="button" onClick={() => setIsCustomAcademyMode(false)} className="text-[11px] text-ink-faint font-semibold hover:underline">🔙 검색으로 돌아가기</button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-ink-soft mb-1">본인 이름 (실명)</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 border border-line rounded-md outline-none text-ink" placeholder="홍길동" required />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-ink-soft mb-1">
                            {role === 'PARENT' ? '학부모 연락처 *' : '연락처 *'}
                        </label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full px-4 py-2.5 border border-line rounded-md outline-none text-ink"
                            placeholder="010-0000-0000"
                            required
                        />
                    </div>

                    {role === 'PARENT' && (
                        <div className="space-y-4">
                            {children.map((child, index) => (
                                <div key={index} className="p-4 bg-accent-soft/40 border border-accent/20 rounded-lg space-y-3 relative">
                                    <div className="flex justify-between items-center border-b border-accent/15 pb-1.5">
                                        <p className="text-xs font-bold text-ink">🎒 자녀 #{index + 1} 정보 기재</p>
                                        {children.length > 1 && (
                                            <button type="button" onClick={() => handleRemoveChild(index)} className="text-[11px] text-danger font-bold hover:underline">
                                                삭제
                                            </button>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-semibold text-ink-soft mb-1">자녀 이름 *</label>
                                        <input type="text" value={child.childName} onChange={(e) => handleChildChange(index, 'childName', e.target.value)} className="w-full px-3 py-1.5 border border-line rounded-md text-sm outline-none bg-paper-raised text-ink" placeholder="자녀 실명" required />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[11px] font-semibold text-ink-soft mb-1">자녀 성별 *</label>
                                            <select value={child.gender} onChange={(e) => handleChildChange(index, 'gender', e.target.value)} className="w-full px-3 py-1.5 border border-line rounded-md text-sm outline-none bg-paper-raised text-ink" required>
                                                <option value="">선택</option>
                                                <option value="MALE">남학생</option>
                                                <option value="FEMALE">여학생</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-ink-soft mb-1">자녀 생년월일 *</label>
                                            <input
                                                type="date"
                                                value={child.birthDate}
                                                onChange={(e) => handleChildChange(index, 'birthDate', e.target.value)}
                                                className="w-full px-3 py-1.5 border border-line rounded-md text-sm outline-none bg-paper-raised text-ink"
                                                required
                                                autoComplete="off"
                                                max={today}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-semibold text-ink-soft mb-1">School 이름 *</label>
                                        <input type="text" value={child.schoolName} onChange={(e) => handleChildChange(index, 'schoolName', e.target.value)} className="w-full px-3 py-1.5 border border-line rounded-md text-sm outline-none bg-paper-raised text-ink" placeholder="OO초등학교" required />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-semibold text-ink-soft mb-1">자녀 본인 연락처 (선택)</label>
                                        <input type="tel" value={child.childPhone} onChange={(e) => handleChildChange(index, 'childPhone', e.target.value)} className="w-full px-3 py-1.5 border border-line rounded-md text-sm outline-none bg-paper-raised text-ink" placeholder="010-0000-0000" />
                                    </div>
                                </div>
                            ))}

                            <button type="button" onClick={handleAddChild} className="w-full border border-dashed border-accent/40 hover:bg-accent-soft/50 text-accent text-xs font-bold py-2 rounded-md transition">
                                ➕ 형제/자매 추가 등록하기
                            </button>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-ink-soft mb-1">이메일 주소</label>
                        <div className="flex gap-2">
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 px-4 py-2.5 border border-line rounded-md outline-none text-ink disabled:bg-line-soft" placeholder="example@com" required disabled={isAuthSent || isEmailVerified} />
                            <button type="button" onClick={handleSendAuthCode} disabled={!isEmailAvailable || isEmailVerified} className="px-3 text-xs font-semibold rounded-md bg-ink text-paper disabled:bg-line disabled:text-ink-faint whitespace-nowrap">
                                {isAuthSent ? '재발송' : '인증요청'}
                            </button>
                        </div>
                        {emailError && <p className="text-danger text-xs font-medium mt-1.5">{emailError}</p>}
                        {isEmailVerified && <p className="text-success text-xs font-medium mt-1.5">인증이 완료되었습니다.</p>}
                    </div>

                    {isAuthSent && !isEmailVerified && (
                        <div>
                            <label className="block text-sm font-medium text-ink-soft mb-1">인증번호 입력</label>
                            <div className="flex gap-2">
                                <input type="text" value={authCode} onChange={(e) => setAuthCode(e.target.value)} className="flex-1 px-4 py-2.5 border border-line rounded-md outline-none text-ink" placeholder="6자리 숫자" required />
                                <button type="button" onClick={handleVerifyAuthCode} className="px-4 text-xs font-semibold rounded-md bg-accent text-paper-raised">확인</button>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-ink-soft mb-1">비밀번호 (8자 이상)</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2.5 border border-line rounded-md outline-none text-ink" placeholder="••••••••" required />
                    </div>

                    {errorMessage && <p className="text-danger text-sm font-medium">{errorMessage}</p>}
                    {successMessage && <p className="text-success text-sm font-medium">{successMessage}</p>}

                    <button type="submit" disabled={!isEmailVerified} className="w-full bg-accent hover:bg-accent-hover text-paper-raised font-semibold py-3 rounded-md disabled:bg-line disabled:text-ink-faint mt-2 transition">
                        회원가입 하기
                    </button>
                </form>

                <div className="mt-6 text-center text-sm">
                    <span className="text-ink-faint">이미 계정이 있으신가요? </span>
                    <button onClick={() => router.push('/')} className="text-accent font-semibold hover:underline">로그인</button>
                </div>
            </div>
        </div>
    );
}

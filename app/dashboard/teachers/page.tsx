'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import CommonMenuBar from '../components/commonMenuBar';

interface TeacherMember {
    uuid: string;
    email: string;
    name: string;
    role: string;
    isApproved: boolean;
}

export default function TeachersManagementPage() {
    const [teachersList, setTeachersList] = useState<TeacherMember[]>([]);
    const [isFetchingData, setIsFetchingData] = useState(false);

    useEffect(() => {
        fetchTeachers();
    }, []);

    const fetchTeachers = async () => {
        setIsFetchingData(true);
        try {
            const academyId = sessionStorage.getItem('academyId');

            const response = await axios.get(`/api/members/teachers?academyId=${academyId}`);

            setTeachersList(response.data);
        } catch (error: any) {
            console.error('강사 리스트 패치 오류:', error);
            const errorMsg = error.response?.data?.message || '강사 목록을 불러오는 중 오류가 발생했습니다.';
            alert(`[에러] ${errorMsg}`);
            setTeachersList([]);
        } finally {
            setIsFetchingData(false);
        }
    };

    const handleApproveTeacher = async (targetUuid: string) => {
        if (!confirm('해당 선생님의 학원 가입을 승인하시겠습니까?')) return;

        try {
            await axios.patch(`/api/members/${targetUuid}/approve`, {});
            alert('승인이 완료되었습니다.');
            fetchTeachers(); // 메뉴바 배지 갱신을 위해 리스트 재조회
        } catch (error) {
            alert('승인 처리 중 오류가 발생했습니다.');
        }
    };

    return (
        <CommonMenuBar>
            <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
                <div className="bg-paper-raised p-4 sm:p-6 rounded-lg border border-line shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
                        <div className="space-y-1">
                            <h3 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                                <span>👨‍🏫</span> 소속 강사 정보 관리
                            </h3>
                            <p className="text-ink-faint text-xs leading-relaxed max-w-md">
                                센터에 가입한 모든 선생님 목록입니다. 신규 가입자는 원장님의 가입 승인이 필요합니다.
                            </p>
                        </div>

                        <button
                            onClick={fetchTeachers}
                            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-bold bg-line-soft hover:bg-line-soft text-ink-soft rounded-lg border border-line shadow-sm transition flex items-center justify-center gap-1.5 active:scale-98"
                        >
                            <span>{isFetchingData ? '⌛' : '🔄'}</span>
                            <span>{isFetchingData ? '새로고침 중..' : '리스트 새로고침'}</span>
                        </button>
                    </div>

                    <div className="hidden sm:block border border-line-soft rounded-lg overflow-x-auto">
                        <table className="min-w-full bg-paper-raised divide-y divide-line text-sm">
                            <thead className="bg-line-soft text-ink-faint font-semibold text-xs uppercase tracking-wider text-left">
                            <tr>
                                <th className="p-4">선생님 이름</th>
                                <th className="p-4">이메일 계정</th>
                                <th className="p-4">현재 소속 상태</th>
                                <th className="p-4 text-center">작업 관리</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-line text-ink-soft">
                            {teachersList.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-ink-faint font-medium">소속된 강사 데이터가 존재하지 않습니다.</td>
                                </tr>
                            ) : (
                                teachersList.map((teacher) => (
                                    <tr key={teacher.uuid} className="hover:bg-line-soft/70 transition">
                                        <td className="p-4 font-bold text-ink">{teacher.name}</td>
                                        <td className="p-4 text-ink-faint">{teacher.email}</td>
                                        <td className="p-4">
                                            {teacher.isApproved ? (
                                                <span className="inline-flex px-2.5 py-1 text-xs font-semibold bg-success-soft text-success rounded-full">정식 강사 (재직중)</span>
                                            ) : (
                                                <span className="inline-flex px-2.5 py-1 text-xs font-bold bg-warning-soft text-warning rounded-full animate-pulse">⏳ 승인 요청 중</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            {!teacher.isApproved ? (
                                                <button
                                                    onClick={() => handleApproveTeacher(teacher.uuid)}
                                                    className="px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition active:scale-95"
                                                >
                                                    가입 승인
                                                </button>
                                            ) : (
                                                <span className="text-xs text-ink-faint font-medium select-none">승인 완료됨</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                            </tbody>
                        </table>
                    </div>

                    <div className="block sm:hidden space-y-3.5">
                        {teachersList.length === 0 ? (
                            <div className="p-8 text-center text-ink-faint font-medium border border-line-soft rounded-lg bg-line-soft/50">
                                소속된 강사 데이터가 존재하지 않습니다.
                            </div>
                        ) : (
                            teachersList.map((teacher) => (
                                <div key={teacher.uuid} className="p-4 border border-line-soft rounded-lg shadow-sm bg-paper-raised flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-base text-ink">{teacher.name}</span>
                                        {teacher.isApproved ? (
                                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-success-soft text-success rounded-md border border-success-soft">정식 강사</span>
                                        ) : (
                                            <span className="px-2 py-0.5 text-[10px] font-bold bg-warning-soft text-warning rounded-md border border-warning-soft animate-pulse">⏳ 승인 요청 중</span>
                                        )}
                                    </div>

                                    <div className="text-xs text-ink-faint flex flex-col gap-0.5">
                                        <span className="text-[10px] uppercase text-ink-faint font-bold tracking-wider">이메일 계정</span>
                                        <span className="font-medium break-all text-ink-soft">{teacher.email}</span>
                                    </div>

                                    {!teacher.isApproved && (
                                        <div className="pt-2 border-t border-line-soft/70">
                                            <button
                                                onClick={() => handleApproveTeacher(teacher.uuid)}
                                                className="w-full py-2.5 text-xs font-bold bg-accent hover:bg-accent-hover text-paper-raised rounded-lg shadow-sm transition"
                                            >
                                                가입 승인하기
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                </div>
            </main>
        </CommonMenuBar>
    );
}
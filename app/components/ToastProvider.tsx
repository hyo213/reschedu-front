'use client';

import { createContext, useCallback, useContext, useState } from 'react';

type ToastVariant = 'error' | 'success' | 'info';

interface UiToast {
    id: number;
    message: string;
    variant: ToastVariant;
}

interface ToastContextValue {
    showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_TTL_MS = 4000;

let toastSeq = 0;

const VARIANT_STYLES: Record<ToastVariant, string> = {
    error: 'border-danger-soft bg-paper-raised text-danger',
    success: 'border-success-soft bg-paper-raised text-success',
    info: 'border-line bg-paper-raised text-ink',
};

const VARIANT_ICON: Record<ToastVariant, string> = {
    error: '⚠️',
    success: '✅',
    info: 'ℹ️',
};

/**
 * alert()를 대체하는 전역 토스트. 세션 만료 안내처럼 즉시 페이지 이동이 뒤따르는 경우에도
 * 이 프로바이더는 루트 레이아웃에 고정 마운트돼 있어 라우팅 후에도 토스트가 유지된다.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<UiToast[]>([]);

    const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
        const id = ++toastSeq;
        setToasts((prev) => [...prev, { id, message, variant }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, TOAST_TTL_MS);
    }, []);

    const dismiss = (id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm sm:left-auto sm:right-4 sm:translate-x-0">
                {toasts.map((toast) => (
                    <button
                        key={toast.id}
                        onClick={() => dismiss(toast.id)}
                        className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-left text-sm shadow-lg transition-colors animate-fade-in ${VARIANT_STYLES[toast.variant]}`}
                    >
                        <span className="leading-none">{VARIANT_ICON[toast.variant]}</span>
                        <span className="flex-1">{toast.message}</span>
                    </button>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast는 ToastProvider 안에서만 사용할 수 있습니다.');
    }
    return ctx;
}

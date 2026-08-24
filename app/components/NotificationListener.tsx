'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface NotificationEventPayload {
    type: 'MAKEUP_TICKET_ISSUED' | 'TEACHER_SIGNUP_PENDING' | 'STUDENT_ENROLLMENT_PENDING';
    message: string;
    linkPath: string;
}

interface Toast extends NotificationEventPayload {
    id: number;
}

const TOAST_TTL_MS = 6000;
// 로그인 상태(sessionStorage)는 이 레이아웃이 리마운트되지 않고도 바뀔 수 있으므로 주기적으로 확인한다.
const LOGIN_POLL_MS = 1500;

let toastSeq = 0;

// 알림 종류별 강조 아이콘. 서버가 보내는 type과 1:1로 맞춘다.
const TYPE_ICON: Record<NotificationEventPayload['type'], string> = {
    MAKEUP_TICKET_ISSUED: '🎟️',
    TEACHER_SIGNUP_PENDING: '🧑‍🏫',
    STUDENT_ENROLLMENT_PENDING: '🧒',
};

export default function NotificationListener() {
    const router = useRouter();
    const [toasts, setToasts] = useState<Toast[]>([]);
    const eventSourceRef = useRef<EventSource | null>(null);
    const connectedUuidRef = useRef<string | null>(null);

    useEffect(() => {
        const connectIfNeeded = () => {
            const userUuid = sessionStorage.getItem('userUuid');

            if (!userUuid) {
                eventSourceRef.current?.close();
                eventSourceRef.current = null;
                connectedUuidRef.current = null;
                return;
            }

            if (connectedUuidRef.current === userUuid && eventSourceRef.current) {
                return;
            }

            eventSourceRef.current?.close();
            connectedUuidRef.current = userUuid;

            const source = new EventSource('http://localhost:8080/api/notifications/stream', {
                withCredentials: true,
            });
            eventSourceRef.current = source;

            source.addEventListener('notification', (event) => {
                const payload: NotificationEventPayload = JSON.parse((event as MessageEvent).data);
                const id = ++toastSeq;
                setToasts((prev) => [...prev, { ...payload, id }]);
                setTimeout(() => {
                    setToasts((prev) => prev.filter((t) => t.id !== id));
                }, TOAST_TTL_MS);
            });

            source.onerror = () => {
                // EventSource가 자체적으로 재연결을 시도하므로 여기서는 별도 처리를 하지 않는다.
            };
        };

        connectIfNeeded();
        const pollId = setInterval(connectIfNeeded, LOGIN_POLL_MS);

        return () => {
            clearInterval(pollId);
            eventSourceRef.current?.close();
        };
    }, []);

    const handleClick = (toast: Toast) => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        router.push(toast.linkPath);
    };

    if (toasts.length === 0) {
        return null;
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
            {toasts.map((toast) => (
                <button
                    key={toast.id}
                    onClick={() => handleClick(toast)}
                    className="flex items-start gap-2 rounded-lg border border-line bg-paper-raised px-4 py-3 text-left shadow-lg hover:border-accent transition-colors"
                >
                    <span className="text-lg leading-none">{TYPE_ICON[toast.type]}</span>
                    <span className="text-sm text-ink">{toast.message}</span>
                </button>
            ))}
        </div>
    );
}

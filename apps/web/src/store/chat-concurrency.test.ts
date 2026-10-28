import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from './chat';
import { getChatSessionMessages, listChatSessions, streamChat } from '@/lib/api';
vi.mock('@/lib/api', () => ({ getChatSessionMessages: vi.fn(), listChatSessions: vi.fn(), streamChat: vi.fn() }));
vi.mock('@/lib/cache', () => ({ ttlCache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() } }));
vi.mock('@/store/workspace', () => ({ useWorkspaceStore: { getState: () => ({ spaceLayout: { mode: 'course_following', blocks: [] } }) } }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); useChatStore.setState(useChatStore.getInitialState(), true); vi.mocked(listChatSessions).mockResolvedValue([]); });
describe('chat request ownership', () => {
    it('an interrupted old stream must not clear the replacement stream controller', async () => {
        const old = deferred<void>(), next = deferred<void>();
        vi.mocked(streamChat).mockImplementationOnce(async function* () { await old.promise; throw new DOMException('aborted', 'AbortError'); });
        vi.mocked(streamChat).mockImplementationOnce(async function* () { await next.promise; });
        const first = useChatStore.getState().sendMessage('course-a', 'first');
        const second = useChatStore.getState().sendMessage('course-a', 'second');
        const replacementController = useChatStore.getState()._abortController;
        old.resolve();
        await first;
        const observed = { streaming: useChatStore.getState().isStreaming, ownsController: useChatStore.getState()._abortController === replacementController };
        next.resolve();
        await second;
        expect(observed).toEqual({ streaming: true, ownsController: true });
    });
    it('a delayed history load must not reactivate the previous course', async () => {
        const old = deferred<Awaited<ReturnType<typeof getChatSessionMessages>>>();
        vi.mocked(getChatSessionMessages).mockReturnValueOnce(old.promise);
        useChatStore.getState().setCourseContext('course-a');
        const pending = useChatStore.getState().loadSessionMessages('course-a', 'session-a');
        useChatStore.getState().setCourseContext('course-b');
        old.resolve({ session: { message_count: 1 }, messages: [{ id: 'a1', role: 'assistant', content: 'course-a message', created_at: '2026-10-29T00:00:00Z' }] } as Awaited<ReturnType<typeof getChatSessionMessages>>);
        await pending;
        const observed = { activeCourse: useChatStore.getState().activeCourseId, visibleMessage: useChatStore.getState().messages[0]?.content };
        expect(observed.activeCourse).toBe('course-b');
    });
});
function history(content: string): Awaited<ReturnType<typeof getChatSessionMessages>> {
    return { session: { message_count: 1 }, messages: [{ id: content, role: 'assistant', content, created_at: '2026-10-29T00:00:00Z' }] } as Awaited<ReturnType<typeof getChatSessionMessages>>;
}
it('the newest selected session wins when histories finish out of order', async () => {
    const first = deferred<Awaited<ReturnType<typeof getChatSessionMessages>>>();
    vi.mocked(getChatSessionMessages).mockReturnValueOnce(first.promise).mockResolvedValueOnce(history('new session'));
    const pending = useChatStore.getState().loadSessionMessages('course-a', 'old');
    await useChatStore.getState().loadSessionMessages('course-a', 'new');
    first.resolve(history('old session'));
    await pending;
    expect(useChatStore.getState().sessionIds['course-a']).toBe('new');
    expect(useChatStore.getState().messages[0].content).toBe('new session');
});
it('starting a new session invalidates pending history restoration', async () => {
    const first = deferred<Awaited<ReturnType<typeof getChatSessionMessages>>>();
    vi.mocked(getChatSessionMessages).mockReturnValueOnce(first.promise);
    const pending = useChatStore.getState().loadSessionMessages('course-a', 'old');
    useChatStore.getState().startNewSession('course-a');
    first.resolve(history('old session'));
    await pending;
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().sessionIds['course-a']).toBeUndefined();
});
it('late stream actions cannot target the newly selected course', async () => {
    const gate = deferred<void>();
    const action = vi.fn();
    useChatStore.getState().registerOnAction(action);
    vi.mocked(streamChat).mockImplementationOnce(async function* () {
        await gate.promise;
        yield { type: 'action', action: { action: 'data_updated', value: 'notes' } };
    });
    const pending = useChatStore.getState().sendMessage('course-a', 'update notes');
    useChatStore.getState().setCourseContext('course-b');
    gate.resolve();
    await pending;
    expect(action).not.toHaveBeenCalled();
    expect(useChatStore.getState().activeCourseId).toBe('course-b');
});

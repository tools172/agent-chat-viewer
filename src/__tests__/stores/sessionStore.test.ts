import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore } from '../../stores/sessionStore';

// Mock the tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('sessionStore', () => {
  beforeEach(() => {
    // Reset the store
    useSessionStore.setState({
      projects: [],
      sessions: [],
      currentSession: null,
      searchResults: [],
      viewMode: 'by-project' as const,
      selectedProjectPath: null,
      selectedSessionPath: null,
      searchQuery: '',
      isLoading: false,
      isLoadingConversation: false,
      error: null,
    });
  });

  it('should have initial state', () => {
    const state = useSessionStore.getState();
    expect(state.projects).toEqual([]);
    expect(state.sessions).toEqual([]);
    expect(state.currentSession).toBeNull();
    expect(state.viewMode).toBe('by-project');
    expect(state.isLoading).toBe(false);
  });

  it('should set view mode', () => {
    useSessionStore.getState().setViewMode('by-time');
    expect(useSessionStore.getState().viewMode).toBe('by-time');
  });

  it('should set search query', () => {
    useSessionStore.getState().setSearchQuery('test query');
    expect(useSessionStore.getState().searchQuery).toBe('test query');
  });

  it('should clear selection', () => {
    useSessionStore.setState({
      currentSession: {
        id: 'test',
        filePath: '/test.jsonl',
        events: [],
      },
      selectedSessionPath: '/test.jsonl',
    });

    useSessionStore.getState().clearSelection();
    const state = useSessionStore.getState();
    expect(state.currentSession).toBeNull();
    expect(state.selectedSessionPath).toBeNull();
  });

  it('should clear error', () => {
    useSessionStore.setState({ error: 'test error' });
    useSessionStore.getState().clearError();
    expect(useSessionStore.getState().error).toBeNull();
  });
});

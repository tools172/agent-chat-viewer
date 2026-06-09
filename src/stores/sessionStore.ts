import { create } from 'zustand';
import type {
  Project,
  SessionSummary,
  SessionDetail,
  ViewMode,
} from '../types';
import * as tauri from '../utils/tauri';

interface SessionState {
  // Data
  projects: Project[];
  sessions: SessionSummary[];
  currentSession: SessionDetail | null;
  searchResults: SessionSummary[];

  // UI State
  viewMode: ViewMode;
  selectedProjectPath: string | null;
  selectedSessionPath: string | null;
  searchQuery: string;
  isLoading: boolean;
  isLoadingConversation: boolean;
  error: string | null;

  // Actions
  loadProjects: (settings: import('../types').AppSettings) => Promise<void>;
  selectProject: (projectPath: string, provider: string) => Promise<void>;
  selectSession: (
    sessionPath: string,
    filter: import('../types').FilterConfig,
    provider: string
  ) => Promise<void>;
  search: (
    query: string,
    settings: import('../types').AppSettings
  ) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  clearSelection: () => void;
  clearError: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  // Initial state
  projects: [],
  sessions: [],
  currentSession: null,
  searchResults: [],
  viewMode: 'by-project' as ViewMode,
  selectedProjectPath: null,
  selectedSessionPath: null,
  searchQuery: '',
  isLoading: false,
  isLoadingConversation: false,
  error: null,

  // Load all projects
  loadProjects: async (settings) => {
    set({ isLoading: true, error: null });
    try {
      const projects = await tauri.listProjects(settings);
      set({ projects, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  // Select a project and load its sessions
  selectProject: async (projectPath, provider) => {
    set({ isLoading: true, selectedProjectPath: projectPath, error: null });
    try {
      const sessions = await tauri.listSessions(projectPath, provider);
      set({ sessions, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  // Select a session and load its conversation
  selectSession: async (sessionPath, filter, provider) => {
    set({
      isLoadingConversation: true,
      selectedSessionPath: sessionPath,
      error: null,
    });
    try {
      const currentSession = await tauri.getConversation(
        sessionPath,
        filter,
        provider
      );
      set({ currentSession, isLoadingConversation: false });
    } catch (err) {
      set({ error: String(err), isLoadingConversation: false });
    }
  },

  // Search across sessions
  search: async (query, settings) => {
    if (!query.trim()) {
      set({ searchResults: [], searchQuery: '' });
      return;
    }
    set({ isLoading: true, searchQuery: query, error: null });
    try {
      const searchResults = await tauri.searchSessions(query, settings);
      set({ searchResults, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  clearSelection: () =>
    set({
      currentSession: null,
      selectedSessionPath: null,
    }),

  clearError: () => set({ error: null }),
}));

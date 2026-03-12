import { SavedProject } from "../types";

const STORAGE_KEY = 'subgenius_ai_pro_v2';

export const getStoredProjects = (): SavedProject[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error("Failed to load projects", e);
    return [];
  }
};

export const saveProjectsToLocalStorage = (projects: SavedProject[]) => {
    try {
      // Attempt 1: Save everything
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.warn("Local Storage Quota Exceeded. Optimization started: Removing audio data from stored history...");
      
      // Attempt 2: Aggressive Optimization
      // If quota is exceeded, we strip fileData (base64 audio) from ALL projects in storage.
      // This ensures that metadata (subtitles, names, configs) is ALWAYS saved.
      // The active project in memory still has the audio, so the user can continue working.
      // However, on reload, projects in the panel will show "No Audio".
      const optimizedProjects = projects.map((p) => {
         const { fileData, ...rest } = p;
         return { ...rest, fileData: undefined } as SavedProject;
      });
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(optimizedProjects));
      } catch (e2) {
        console.error("Critical failure saving to LocalStorage even after optimization", e2);
        // If it still fails, we might be hitting limits with just text, but that's rare for subtitles.
        // We catch it so the app doesn't crash.
      }
    }
};
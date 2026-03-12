import React, { useState, useEffect, useRef } from 'react';
import { generateSubtitles, generateSubtitlesFromChunks, processTranscriptToBlocks, reTranslateSubtitles } from './services/geminiService';
import { SubtitleBlock, Language, ModelType, ProcessingStatus, SavedProject, MasterTranscript, SplitMode, MobileEditState, SubtitleStyle } from './types';
import { SUPPORTED_LANGUAGES, UI_TEXT, DEFAULT_SUBTITLE_STYLE } from './constants';
import AudioHandler from './components/AudioHandler';
import SubtitleEditor from './components/SubtitleEditor';
import ProjectPanel from './components/ProjectPanel';
import AudioPlayer from './components/AudioPlayer';
import UserGuide from './components/UserGuide';
import { fileToBase64, base64ToBlob, saveProjectFile, loadProjectFile, parseSRTString, parseASSString, parseCSVString } from './utils/fileUtils';
import { extractAndChunkAudio } from './utils/audioUtils';
import { getStoredProjects, saveProjectsToLocalStorage } from './utils/storageUtils';
import { Settings, AlertCircle, Info, Globe, LayoutList, LayoutGrid, Loader2, X, Upload, Download, HelpCircle, Key, KeyRound, PlusCircle, Save, ShieldCheck, Zap, ChevronDown, CheckSquare, Square, FolderClosed, Check, Music, Search, ArrowRight, ArrowLeft, Palette } from 'lucide-react';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const APP_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'vn', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'jp', label: '日本語', flag: '🇯🇵' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'cn', label: '中文', flag: '🇨🇳' },
  { code: 'kr', label: '한국어', flag: '🇰🇷' },
];

const THEME_COLORS = [
  { name: 'Razer Green', color: '#44d62c', rgb: '68, 214, 44', secondary: '#2b8a1b' },
  { name: 'Cyber Blue', color: '#00d2ff', rgb: '0, 210, 255', secondary: '#0055ff' },
  { name: 'Neon Purple', color: '#bd00ff', rgb: '189, 0, 255', secondary: '#7a00ff' },
  { name: 'Sunset Orange', color: '#ff4e00', rgb: '255, 78, 0', secondary: '#ff8a00' },
  { name: 'Ruby Red', color: '#ff0055', rgb: '255, 0, 85', secondary: '#8a002e' },
  { name: 'Electric Yellow', color: '#f7ff00', rgb: '247, 255, 0', secondary: '#8a8e00' },
];

const App: React.FC = () => {
  const [uiLang, setUiLang] = useState<string>('vn');
  const t = UI_TEXT[uiLang] || UI_TEXT['en'];

  const [savedProjects, setSavedProjects] = useState<SavedProject[]>(() => getStoredProjects());
  const [targetLanguages, setTargetLanguages] = useState<Language[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>(SplitMode.SENTENCE);
  const [modelType, setModelType] = useState<ModelType>(ModelType.GEMINI);
  const [useDefaultKey, setUseDefaultKey] = useState<boolean>(true);
  
  // Lifted State: Style configuration to ensure it's saved with the project
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);

  const [activeLangSlot, setActiveLangSlot] = useState<number | null>(null);
  const [langSearch, setLangSearch] = useState('');

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const statusRef = useRef<ProcessingStatus>('idle');
  useEffect(() => { statusRef.current = status; }, [status]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  
  const [currentFile, setCurrentFile] = useState<File | Blob | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleBlock[]>([]);
  const [masterTranscript, setMasterTranscript] = useState<MasterTranscript | null>(null);

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);
  useEffect(() => { currentProjectIdRef.current = currentProjectId; }, [currentProjectId]);
  
  const [isProjectPanelOpen, setProjectPanelOpen] = useState(false);
  const [isConfigOpen, setConfigOpen] = useState(false);
  const [isCredentialsOpen, setCredentialsOpen] = useState(false);
  const [isGuideOpen, setGuideOpen] = useState(false);
  const [isAppLangOpen, setIsAppLangOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [themeColor, setThemeColor] = useState(THEME_COLORS[0]);
  const [currentTime, setCurrentTime] = useState(0);

  const [backgroundTasks, setBackgroundTasks] = useState<{
    id: string;
    name: string;
    status: ProcessingStatus;
    progressMsg: string;
    progress: number;
    error?: string;
  }[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [mobileEdit, setMobileEdit] = useState<MobileEditState | null>(null);
  const mobileInputRef = useRef<HTMLTextAreaElement>(null);

  const [toast, setToast] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
  const isCancelledRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  
  // Shared ref for the video element to sync between player controls and editor preview
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const isVideo = currentFile?.type.startsWith('video/') || false;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsAppLangOpen(false);
      }
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target as Node)) {
        setIsThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (mobileEdit && mobileInputRef.current) {
      mobileInputRef.current.focus();
      mobileInputRef.current.setSelectionRange(mobileEdit.value.length, mobileEdit.value.length);
    }
  }, [mobileEdit]);

  const showToast = (msg: string) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: '' }), 2000);
  };

  useEffect(() => {
    saveProjectsToLocalStorage(savedProjects);
  }, [savedProjects]);

  useEffect(() => {
    if (currentFile) {
        const url = URL.createObjectURL(currentFile);
        setCurrentAudioUrl(url);
        let fname = 'audio.webm';
        if ('name' in currentFile) {
            fname = (currentFile as File).name;
        } else if (!currentFileName) {
            fname = `Recording_${new Date().toLocaleTimeString()}.webm`;
        }
        setCurrentFileName(fname);
        if (!projectName) setProjectName(fname.replace(/\.[^/.]+$/, ""));
        return () => URL.revokeObjectURL(url);
    } else {
        setCurrentAudioUrl(null);
        setCurrentFileName(null);
        if (!currentProjectId) setProjectName(null);
    }
  }, [currentFile]);

  const handleSelectApiKey = async () => {
    try {
      await window.aistudio?.openSelectKey();
      setUseDefaultKey(false);
      setQuotaExceeded(false);
      setErrorMsg(null);
    } catch (e) {
      console.error("Failed to open key selector", e);
    }
  };

  const handleSplitModeChange = (newMode: SplitMode) => {
    setSplitMode(newMode);
    if (masterTranscript && masterTranscript.segments && masterTranscript.segments.length > 0) {
        const newBlocks = processTranscriptToBlocks(masterTranscript, newMode);
        setSubtitles(newBlocks);
    }
  };

  const constructProjectObject = async (name: string, transcriptData: MasterTranscript, currentSubtitles: SubtitleBlock[]): Promise<SavedProject> => {
      let fileBase64: string | undefined = undefined;
      let mimeType: string | undefined = undefined;
      if (currentFile) {
        fileBase64 = await fileToBase64(currentFile);
        mimeType = currentFile.type || 'audio/mp3';
      }
      return {
          id: currentProjectId || Date.now().toString(),
          name: name,
          date: new Date().toISOString(),
          // Include current style in config
          config: { targetLanguages, splitMode, modelType, isOffline: false, style: subtitleStyle },
          subtitles: currentSubtitles,
          masterTranscript: transcriptData,
          fileData: fileBase64,
          fileName: currentFileName || 'audio.webm',
          fileType: mimeType
      };
  };

  const handleProcess = async () => {
    if (!currentFile) return;
    if (!useDefaultKey) {
        const hasKey = await window.aistudio?.hasSelectedApiKey();
        if (!hasKey) {
            setErrorMsg(t.keyRequired);
            setCredentialsOpen(true);
            return;
        }
    }

    const taskId = Date.now().toString();
    const pName = projectName || (currentFileName ? currentFileName.replace(/\.[^/.]+$/, "") : `Project ${new Date().toLocaleTimeString()}`);
    
    const newTask = {
      id: taskId,
      name: pName,
      status: 'processing' as ProcessingStatus,
      progressMsg: t.decoding,
      progress: 0
    };

    setBackgroundTasks(prev => [newTask, ...prev]);
    
    // If we are not currently viewing a project, show processing in main UI too
    if (status === 'idle' || status === 'error') {
      setStatus('processing');
      setProgressMsg(t.decoding);
      setErrorMsg(null);
    }

    const processFile = currentFile;
    const processTargetLangs = [...targetLanguages];
    const processModelType = modelType;
    const processSplitMode = splitMode;
    const processFileName = currentFileName;

    // Run in background
    (async () => {
      try {
        const updateTask = (updates: Partial<typeof newTask>) => {
          setBackgroundTasks(prev => prev.map(tk => tk.id === taskId ? { ...tk, ...updates } : tk));
          if (statusRef.current === 'processing' && currentProjectIdRef.current === null) {
             if (updates.progressMsg) setProgressMsg(updates.progressMsg);
          }
        };

        const chunks = await extractAndChunkAudio(processFile, 25, 5);
        updateTask({ progressMsg: t.transcribing, progress: 10 });

        const transcript = await generateSubtitlesFromChunks(
          chunks, 
          processTargetLangs, 
          processModelType, 
          t,
          (msg) => updateTask({ progressMsg: msg }),
          () => isCancelledRef.current && taskId === currentProjectId // Simplified cancel check
        );

        const initialBlocks = processTranscriptToBlocks(transcript, processSplitMode);
        
        // Construct project object
        let fileBase64: string | undefined = undefined;
        let mimeType: string | undefined = undefined;
        fileBase64 = await fileToBase64(processFile);
        mimeType = processFile.type || 'audio/mp3';

        const finalProject: SavedProject = {
            id: taskId,
            name: pName,
            date: new Date().toISOString(),
            config: { targetLanguages: processTargetLangs, splitMode: processSplitMode, modelType: processModelType, isOffline: false, style: subtitleStyle },
            subtitles: initialBlocks,
            masterTranscript: transcript,
            fileData: fileBase64,
            fileName: processFileName || 'audio.webm',
            fileType: mimeType
        };

        setSavedProjects(prev => [finalProject, ...prev]);
        updateTask({ status: 'completed', progress: 100, progressMsg: 'Completed' });
        
        // If the user is still on the processing screen for THIS specific task
        if (statusRef.current === 'processing' && !currentProjectIdRef.current) {
          setSubtitles(initialBlocks);
          setMasterTranscript(transcript);
          setCurrentProjectId(taskId);
          setProjectName(pName);
          setStatus('completed');
        }
      } catch (err: any) {
        console.error(err);
        const errorText = err.message === "QUOTA_EXHAUSTED" || err.message === "AUTH_ERROR" ? t.authError : (err.message || t.generalError);
        setBackgroundTasks(prev => prev.map(tk => tk.id === taskId ? { ...tk, status: 'error', error: errorText } : tk));
        
        if (statusRef.current === 'processing' && !currentProjectIdRef.current) {
          setErrorMsg(errorText);
          setStatus('error');
        }
      }
    })();

    // Allow user to start another project immediately if they want
    // But we don't force reset here, we let them click "New Project"
  };

  const handleManualSave = async () => {
     if (!currentProjectId || !masterTranscript) return;
     const pName = projectName || "Project";
     const updatedProject = await constructProjectObject(pName, masterTranscript || { segments: [] }, subtitles);
     updatedProject.id = currentProjectId;
     setSavedProjects(prev => prev.map(p => p.id === currentProjectId ? updatedProject : p));
     showToast(t.toastSaved);
  };

  const handleNewProject = () => {
    setStatus('idle');
    setSubtitles([]);
    setMasterTranscript(null);
    setCurrentFile(null);
    setCurrentFileName(null);
    setProjectName(null);
    setCurrentAudioUrl(null);
    setCurrentProjectId(null);
    setErrorMsg(null);
    setQuotaExceeded(false);
    setSearchTerm('');
    setSubtitleStyle(DEFAULT_SUBTITLE_STYLE); // Reset style
    showToast(t.toastNew);
  };

  const handleExportJSON = async () => {
    if (subtitles.length === 0 && !currentFile) return;
    try {
        let name = projectName || "project_export";
        const project = await constructProjectObject(name, masterTranscript || { segments: [] }, subtitles);
        saveProjectFile(project);
        showToast(t.toastExport);
    } catch (e) {
        console.error("Export failed", e);
    }
  };

  const handleSelectMediaForProject = (file: File) => {
    setCurrentFile(file);
    setCurrentFileName(file.name);
    const url = URL.createObjectURL(file);
    setCurrentAudioUrl(url);
    
    // If we have an active project, update it in savedProjects too
    if (currentProjectId) {
        (async () => {
            const base64 = await fileToBase64(file);
            setSavedProjects(prev => prev.map(p => {
                if (p.id === currentProjectId) {
                    return {
                        ...p,
                        fileData: base64,
                        fileName: file.name,
                        fileType: file.type
                    };
                }
                return p;
            }));
        })();
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'json') {
      loadProjectFile(file)
          .then((importedProject) => {
              importedProject.id = `imported_${Date.now()}`;
              importedProject.date = new Date().toISOString();
              setSavedProjects(prev => [importedProject, ...prev]);
              loadProjectToView(importedProject);
              setProjectPanelOpen(true);
          })
          .catch(err => alert(err.message))
          .finally(() => {
              if (importInputRef.current) importInputRef.current.value = '';
          });
      return;
    }

    // Handle subtitle formats (SRT, ASS, CSV)
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      let importedBlocks: SubtitleBlock[] = [];
      
      try {
        if (extension === 'csv') {
          importedBlocks = parseCSVString(content);
        } else if (extension === 'srt' || extension === 'ass') {
          const parsed = extension === 'ass' ? parseASSString(content) : parseSRTString(content);
          importedBlocks = parsed.map((item, idx) => ({
            id: idx + 1,
            start: item.start,
            end: item.end,
            originalText: item.text,
            translations: {} as Record<Language, string>
          }));
        }

        if (importedBlocks.length > 0) {
          // Create a basic project from the imported subtitles
          const pName = file.name.replace(/\.[^/.]+$/, "");
          setProjectName(pName);
          setSubtitles(importedBlocks);
          const dummyTranscript = { segments: [] };
          setMasterTranscript(dummyTranscript);
          setStatus('completed');
          
          // Save to projects
          const newProject = await constructProjectObject(pName, dummyTranscript, importedBlocks);
          setSavedProjects(prev => [newProject, ...prev]);
          setCurrentProjectId(newProject.id);
          
          showToast(t.toastSaved);
        }
      } catch (err: any) {
        alert(err.message);
      }
    };
    reader.readAsText(file);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const loadProjectToView = (project: SavedProject) => {
      setCurrentProjectId(project.id);
      setProjectName(project.name);
      setTargetLanguages(project.config.targetLanguages);
      setSplitMode(project.config.splitMode);
      
      // Load Style if exists, else default
      if (project.config.style) {
          setSubtitleStyle(project.config.style);
      } else {
          setSubtitleStyle(DEFAULT_SUBTITLE_STYLE);
      }

      setSubtitles(project.subtitles);
      setMasterTranscript(project.masterTranscript || null);
      if (project.fileData && project.fileType) {
        const blob = base64ToBlob(project.fileData, project.fileType);
        let restoredFile: File | Blob = blob;
        if (project.fileName) {
            try { restoredFile = new File([blob], project.fileName, { type: project.fileType }); } catch(e) {}
        }
        setCurrentFileName(project.fileName || 'Audio');
        setCurrentFile(restoredFile);
      } else {
        setCurrentFile(null);
        setCurrentFileName(null);
      }
      setStatus('completed');
      setQuotaExceeded(false);
  };

  const handleLoadFromPanel = (id: string) => {
    const project = savedProjects.find(p => p.id === id);
    if (!project) return;
    loadProjectToView(project);
    setProjectPanelOpen(false);
  };

  const handleDeleteProject = (id: string) => {
    setSavedProjects(prev => prev.filter(p => p.id !== id));
    if (currentProjectId === id) {
        setCurrentProjectId(null);
        setProjectName(null);
        setSubtitles([]);
        setMasterTranscript(null);
        setCurrentFile(null);
        setCurrentFileName(null);
        setCurrentAudioUrl(null);
        setSubtitleStyle(DEFAULT_SUBTITLE_STYLE);
        setStatus('idle');
    }
    showToast(t.delete);
  };

  const handleRenameProject = (id: string, newName: string) => {
    setSavedProjects(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
    if (currentProjectId === id) setProjectName(newName);
    showToast(t.toastSaved);
  };

  const handleMobileEditUpdate = (newValue: string) => {
      if (!mobileEdit) return;
      setMobileEdit({ ...mobileEdit, value: newValue });
      setSubtitles(prev => prev.map(b => {
          if (b.id === mobileEdit.blockId) {
             if (mobileEdit.lang === 'original') return { ...b, originalText: newValue };
             return { ...b, translations: { ...b.translations, [mobileEdit.lang]: newValue } };
          }
          return b;
      }));
  };

  const currentAppLang = APP_LANGUAGES.find(l => l.code === uiLang) || APP_LANGUAGES[0];
  const isReadyToGenerate = currentFile !== null;
  const isCompleted = (status === 'completed' || status === 'idle') && subtitles.length > 0;
  
  return (
    <div 
      className="min-h-screen text-gray-200 p-4 md:p-8 pb-48 pt-28 md:pt-32 font-sans selection:bg-razer selection:text-black transition-all duration-700"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 0%, ${themeColor.secondary}22 0%, #000000 70%)`,
        backgroundColor: '#000000'
      }}
    >
      <style>{`
        :root {
          --razer-color: ${themeColor.color};
          --razer-dim: ${themeColor.secondary};
          --razer-glow: ${themeColor.color};
          /* For tailwind opacity support if needed */
          --razer-rgb: ${themeColor.rgb};
        }
      `}</style>
      {toast.show && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-6 py-3 bg-white/10 backdrop-blur-2xl border border-white/10 rounded-full shadow-2xl animate-in slide-in-from-top-4 duration-300">
          <div className="bg-razer rounded-full p-1"><Check size={12} strokeWidth={4} className="text-black" /></div>
          <span className="text-xs font-bold text-white tracking-wide">{toast.msg}</span>
        </div>
      )}

      {/* Floating Header Controls */}
      <div className="fixed top-6 left-6 right-6 flex items-center justify-between z-50 pointer-events-none">
        <div className="pointer-events-auto">
            <button 
                onClick={() => setCredentialsOpen(true)}
                className={`glass-button flex items-center justify-center p-3 rounded-full transition-all group shadow-xl
                ${quotaExceeded ? 'border-red-500/50 bg-red-500/10 text-red-500 animate-pulse' : 'text-gray-400 hover:text-razer'}
                `}
                title={t.apiStatus}
            >
                <KeyRound size={18} className="group-hover:rotate-45 transition-transform duration-300" />
            </button>
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
            <div className="glass-panel p-1 rounded-full flex items-center gap-1 shadow-2xl">
                <button onClick={() => setGuideOpen(true)} className="p-2.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                    <HelpCircle size={18} />
                </button>
            </div>

            <div className="relative" ref={themeDropdownRef}>
                <button onClick={() => setIsThemeOpen(!isThemeOpen)} className="glass-button flex items-center justify-center p-3 rounded-full text-gray-400 hover:text-white shadow-2xl transition-all" title={t.themeSelect}>
                    <Palette size={18} style={{ color: themeColor.color }} />
                </button>
                {isThemeOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 shadow-2xl z-50 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-2">
                        <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-white/5 mb-1">
                            {t.themeSelect}
                        </div>
                        <div className="grid grid-cols-3 gap-1 p-1">
                            {THEME_COLORS.map(theme => (
                                <button 
                                    key={theme.name} 
                                    onClick={() => { setThemeColor(theme); setIsThemeOpen(false); }} 
                                    className={`aspect-square rounded-lg transition-all border-2 ${themeColor.name === theme.name ? 'border-white scale-95' : 'border-transparent hover:scale-105'}`}
                                    style={{ backgroundColor: theme.color }}
                                    title={theme.name}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="relative" ref={langDropdownRef}>
                <button onClick={() => setIsAppLangOpen(!isAppLangOpen)} className="glass-button flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold text-gray-300 hover:text-white shadow-2xl">
                    <Globe size={16} />
                    <span className="hidden md:inline">{currentAppLang.label}</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isAppLangOpen ? 'rotate-180' : ''}`} />
                </button>
                {isAppLangOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 shadow-2xl z-50 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-1">
                        {APP_LANGUAGES.map(lang => (
                            <button key={lang.code} onClick={() => { setUiLang(lang.code); setIsAppLangOpen(false); }} className={`w-full text-left px-4 py-2.5 text-xs rounded-xl transition-all flex items-center gap-3 ${uiLang === lang.code ? 'bg-white/10 text-white font-bold' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                                <span className="text-base">{lang.flag}</span>{lang.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
      </div>

      <ProjectPanel isOpen={isProjectPanelOpen} onClose={() => setProjectPanelOpen(false)} projects={savedProjects} onLoadProject={handleLoadFromPanel} onDeleteProject={handleDeleteProject} onRenameProject={handleRenameProject} activeProjectId={currentProjectId} ui={t} />
      <UserGuide isOpen={isGuideOpen} onClose={() => setGuideOpen(false)} ui={t} />

      <div className="max-w-[1700px] mx-auto transition-all duration-500 ease-in-out">
        {!isCompleted && (
            <header className="mb-8 md:mb-10 text-center relative px-4 flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              <h1 className="text-5xl md:text-7xl font-black text-white mb-4 tracking-tight">
                Sub<span className="text-transparent bg-clip-text bg-gradient-to-r from-razer to-razer-glow">Genius</span>
              </h1>
              <p className="text-gray-500 max-w-xl text-sm md:text-base font-medium tracking-wide">{t.tagline}</p>
            </header>
        )}

        <div className={`max-w-6xl mx-auto ${isCompleted ? 'space-y-[10px]' : 'space-y-6'}`}>
            <div className={`transition-all duration-500 ease-in-out ${isCompleted ? 'w-full' : 'w-full max-w-2xl mx-auto px-4'}`}>
                <div className={`flex items-center justify-between p-2 glass-panel rounded-3xl transition-all duration-500 shadow-2xl`}>
                    <div className="flex items-center gap-2">
                         {(isCompleted || status === 'processing') && (
                            <>
                                <button onClick={handleNewProject} className="glass-button h-11 px-5 flex items-center gap-2 text-white rounded-2xl hover:bg-razer hover:text-black transition-all group active:scale-95">
                                    <PlusCircle size={16} className="group-hover:rotate-90 transition-transform" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">{t.newProject}</span>
                                </button>
                                {isCompleted && (
                                    <button onClick={handleManualSave} className="glass-button h-11 px-5 flex items-center gap-2 text-gray-300 hover:text-white rounded-2xl transition-all active:scale-95" title={t.saveProject}>
                                        <Save size={16} />
                                        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest">{t.saveProject}</span>
                                    </button>
                                )}
                            </>
                         )}
                         {!isCompleted && status === 'idle' && (
                             <div className="px-4 py-2 flex items-center gap-2 opacity-50">
                                 <div className="w-2 h-2 bg-razer rounded-full animate-pulse"></div>
                                 <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{t.ready}</span>
                             </div>
                         )}
                    </div>

                    <div className="flex items-center gap-2">
                        {(isCompleted || status === 'processing') && <div className="h-5 w-px bg-white/10 mx-1 hidden sm:block"></div>}
                        <input type="file" ref={importInputRef} onChange={handleImportFile} accept=".json,.srt,.csv,.ass" className="hidden" />
                        <button onClick={() => importInputRef.current?.click()} className="glass-button h-11 w-11 md:w-auto md:px-5 flex items-center justify-center gap-2 text-gray-300 hover:text-white rounded-2xl transition-all active:scale-95" title={t.importBtn}>
                            <Upload size={16} />
                            <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest">{t.importBtn}</span>
                        </button>
                        <button onClick={() => setConfigOpen(true)} className="glass-button h-11 w-11 md:w-auto md:px-5 flex items-center justify-center gap-2 text-gray-300 hover:text-white rounded-2xl transition-all active:scale-95" title={t.config}>
                            <Settings size={16} />
                            <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest">{t.config}</span>
                        </button>
                        <button onClick={() => setProjectPanelOpen(true)} className="glass-button h-11 w-11 md:w-auto md:px-5 flex items-center justify-center gap-2 text-gray-300 hover:text-white rounded-2xl transition-all active:scale-95" title={t.projects}>
                            <FolderClosed size={16} />
                            <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest">{t.projects}</span>
                        </button>
                    </div>
                </div>
            </div>

            {!isCompleted && <AudioHandler onAudioReady={setCurrentFile} status={status} ui={t} currentFileName={currentFileName} />}

            <div className="flex flex-col items-center justify-center space-y-6 px-4">
                 {!isCompleted && (
                     <div className="flex flex-col items-center gap-4">
                        <button 
                            onClick={handleProcess} 
                            disabled={!isReadyToGenerate || status === 'processing'} 
                            className={`group relative px-10 py-5 rounded-full font-black text-xs uppercase tracking-[0.25em] transition-all duration-300
                                ${!isReadyToGenerate ? 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5' : status === 'processing' ? 'bg-razer/10 text-razer border border-razer/30 cursor-wait' : 'bg-razer hover:bg-razer-glow text-black shadow-[0_0_40px_rgba(68,214,44,0.4)] hover:shadow-[0_0_60px_rgba(68,214,44,0.6)] active:scale-95'}
                            `}
                        >
                            <div className="flex items-center gap-3 relative z-10">
                                {status === 'processing' ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} fill="currentColor" />}
                                <span>{status === 'processing' ? t.processing : t.generateBtn}</span>
                            </div>
                        </button>

                        {status === 'processing' && (
                            <button 
                                onClick={() => { isCancelledRef.current = true; }}
                                className="flex items-center gap-2 px-6 py-2 rounded-full bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 border border-white/10 hover:border-red-500/30 transition-all text-[10px] font-black uppercase tracking-widest"
                            >
                                <X size={14} />
                                {t.cancel}
                            </button>
                        )}
                     </div>
                 )}
                {status === 'processing' && <p className="text-center text-xs text-razer/80 font-mono uppercase tracking-widest animate-pulse">{progressMsg}</p>}
                {errorMsg && (
                    <div className={`w-full max-w-xl p-6 rounded-3xl flex flex-col items-center gap-4 border backdrop-blur-md animate-in slide-in-from-top-4 ${quotaExceeded ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
                        <div className="flex items-center gap-3 text-center">
                            <AlertCircle className={`w-6 h-6 shrink-0 ${quotaExceeded ? 'text-red-500' : 'text-gray-400'}`} />
                            <p className={`text-sm font-medium ${quotaExceeded ? 'text-red-200' : 'text-gray-300'}`}>{errorMsg}</p>
                        </div>
                        {quotaExceeded && (
                            <button onClick={() => setCredentialsOpen(true)} className="px-6 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-red-500/30 transition-all active:scale-95">
                                {t.selectKeyBtn}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {isCompleted && (
              <SubtitleEditor 
                blocks={subtitles} 
                setBlocks={setSubtitles} 
                title={projectName || "Project"} 
                ui={t} 
                uiLang={uiLang}
                targetLanguages={targetLanguages} 
                audioTime={currentTime} 
                modelType={modelType} 
                splitMode={splitMode} 
                setSplitMode={handleSplitModeChange} 
                isOfflineMode={false} 
                mobileEdit={mobileEdit} 
                setMobileEdit={setMobileEdit} 
                isMobileSearchOpen={false} 
                setIsMobileSearchOpen={() => {}} 
                searchTerm={searchTerm} 
                setSearchTerm={setSearchTerm}
                mediaUrl={currentAudioUrl}
                isVideo={isVideo}
                videoRef={videoElementRef}
                style={subtitleStyle}
                setStyle={setSubtitleStyle}
                onExportProject={handleExportJSON}
                onSelectMedia={handleSelectMediaForProject}
              />
            )}
            {status === 'idle' && !currentFile && (
                <div className="flex flex-col items-center justify-center py-20 opacity-50 space-y-4">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                        <Music className="w-8 h-8 text-gray-500" />
                    </div>
                    <p className="text-sm text-gray-500 font-medium tracking-wide">{t.readyDesc}</p>
                </div>
            )}

            {/* Background Tasks Section */}
            {backgroundTasks.length > 0 && (
                <div className="w-full max-w-4xl mx-auto mt-12 space-y-4">
                    <div className="flex items-center gap-3 px-4">
                        {backgroundTasks.some(t => t.status === 'processing') ? (
                            <Loader2 size={16} className="text-razer animate-spin" />
                        ) : (
                            <CheckSquare size={16} className="text-razer" />
                        )}
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Active Generations</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {backgroundTasks.map(task => (
                            <div key={task.id} className={`glass-panel p-5 rounded-3xl border transition-all ${task.status === 'error' ? 'border-red-500/20 bg-red-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-white truncate max-w-[200px]">{task.name}</span>
                                        <span className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${task.status === 'error' ? 'text-red-500' : 'text-razer'}`}>
                                            {task.status === 'processing' ? task.progressMsg : task.status === 'completed' ? 'Completed' : 'Error'}
                                        </span>
                                    </div>
                                    <button onClick={() => setBackgroundTasks(prev => prev.filter(t => t.id !== task.id))} className="text-gray-600 hover:text-white transition-colors">
                                        <X size={14} />
                                    </button>
                                </div>
                                {task.status === 'processing' && (
                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-razer animate-pulse" style={{ width: '100%' }} />
                                    </div>
                                )}
                                {task.status === 'error' && (
                                    <p className="text-[9px] text-red-400/80 mt-2 leading-relaxed">{task.error}</p>
                                )}
                                {task.status === 'completed' && (
                                    <button 
                                        onClick={() => handleLoadFromPanel(task.id)}
                                        className="mt-3 w-full py-2 bg-razer/10 hover:bg-razer text-razer hover:text-black text-[9px] font-black uppercase tracking-widest rounded-xl transition-all"
                                    >
                                        Open Project
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>

      {isCompleted && currentAudioUrl && (
        <AudioPlayer 
          audioUrl={currentAudioUrl} 
          currentTime={currentTime} 
          onTimeUpdate={setCurrentTime} 
          ui={t} 
          externalMediaRef={isVideo ? videoElementRef : undefined}
        />
      )}

      {mobileEdit && (
          <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex flex-col items-center p-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-full flex justify-between items-center mb-10">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-razer uppercase tracking-[0.3em] mb-1">{t.focusedEditing}</span>
                  <span className="text-xs text-gray-500 font-medium">{t.textUpdateTip}</span>
                </div>
                <button onClick={() => setMobileEdit(null)} className="p-4 bg-white/5 hover:bg-white/10 rounded-full text-white transition-all"><X size={24} /></button>
            </div>
            <div className="w-full flex-1 flex flex-col justify-start max-h-[75vh] mb-10 overflow-hidden">
                <div className="w-full flex flex-col gap-4 h-full">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 mb-2 inline-flex self-start">
                    <p className="text-[10px] font-black text-razer uppercase tracking-widest">{mobileEdit?.lang === 'original' ? t.original : mobileEdit?.lang}</p>
                </div>
                <textarea ref={mobileInputRef} className="w-full flex-1 bg-white/5 border border-white/10 focus:border-razer p-8 rounded-[40px] text-2xl md:text-3xl font-black text-white outline-none resize-none shadow-2xl transition-all leading-snug" value={mobileEdit?.value} onChange={(e) => handleMobileEditUpdate(e.target.value)} />
                </div>
            </div>
            <button onClick={() => setMobileEdit(null)} className="w-full py-6 bg-razer text-black font-black uppercase tracking-widest text-sm rounded-[30px] flex items-center justify-center gap-3 shadow-glow hover:bg-razer-glow transition-all active:scale-95 group">
                <Check size={20} strokeWidth={3} className="group-hover:scale-110 transition-transform" /> {t.ok}
            </button>
          </div>
        )}

      {isCredentialsOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6 animate-in fade-in duration-300">
             <div className="glass-panel w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden transform transition-all">
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                     <h2 className="text-lg font-bold text-white flex items-center gap-3"><ShieldCheck className="text-razer" size={20} />{t.apiKeyLabel}</h2>
                    <button onClick={() => setCredentialsOpen(false)} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"><X size={16} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <button className={`w-full flex items-start gap-4 p-5 rounded-2xl border transition-all text-left ${useDefaultKey ? 'bg-razer/10 border-razer/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}`} onClick={() => setUseDefaultKey(true)}>
                        <div className="mt-0.5 shrink-0">{useDefaultKey ? <div className="w-5 h-5 rounded-full bg-razer flex items-center justify-center"><Check size={12} className="text-black" /></div> : <div className="w-5 h-5 rounded-full border-2 border-gray-600" />}</div>
                        <div>
                            <p className="text-sm font-bold text-white">{t.useDefaultKey}</p>
                            <p className="text-xs text-gray-400 mt-1">{t.useDefaultKeyHelp}</p>
                        </div>
                    </button>
                    <button className={`w-full flex items-start gap-4 p-5 rounded-2xl border transition-all text-left ${!useDefaultKey ? 'bg-razer/10 border-razer/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}`} onClick={() => setUseDefaultKey(false)}>
                        <div className="mt-0.5 shrink-0">{!useDefaultKey ? <div className="w-5 h-5 rounded-full bg-razer flex items-center justify-center"><Check size={12} className="text-black" /></div> : <div className="w-5 h-5 rounded-full border-2 border-gray-600" />}</div>
                        <div className="w-full">
                            <p className="text-sm font-bold text-white">{t.usePersonalKey}</p>
                            <p className="text-xs text-gray-400 mt-1 mb-3">{t.usePersonalKeyHelp}</p>
                            {!useDefaultKey && (
                                <div onClick={(e) => { e.stopPropagation(); handleSelectApiKey(); }} className="inline-flex items-center gap-2 px-4 py-2 bg-razer text-black font-bold text-xs uppercase tracking-wider rounded-full hover:bg-razer-glow transition-all">
                                    <KeyRound size={14} />{t.selectKeyBtn}
                                </div>
                            )}
                        </div>
                    </button>
                </div>
                <div className="p-6 pt-0">
                    <button onClick={() => setCredentialsOpen(false)} className="w-full py-4 bg-white text-black font-bold text-sm rounded-2xl hover:bg-gray-200 transition-colors">{t.saveClose}</button>
                </div>
            </div>
        </div>
      )}

      {isConfigOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6 animate-in fade-in duration-300">
            <div className="glass-panel w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                     <h2 className="text-lg font-bold text-white flex items-center gap-3"><Settings size={20} />{t.config}</h2>
                    <button onClick={() => { setConfigOpen(false); setActiveLangSlot(null); }} className="p-2 bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"><X size={16} /></button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-8 max-h-[60vh]">
                     {activeLangSlot === null ? (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider flex items-center gap-2"><LayoutGrid size={14} className="text-razer" />{t.splitRules}</label>
                                <div className="grid grid-cols-2 gap-3">
                                     {t.splitModes.map(mode => (
                                        <button key={mode.value} onClick={() => handleSplitModeChange(mode.value as SplitMode)} className={`w-full text-center px-4 py-4 rounded-2xl transition-all flex flex-col items-center justify-center gap-1 border ${splitMode === mode.value ? 'bg-razer text-black border-razer' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'}`}>
                                          <span className="text-xs font-black uppercase tracking-wider">{mode.label}</span>
                                          <span className={`text-[10px] ${splitMode === mode.value ? 'text-black/60 font-bold' : 'text-gray-500'}`}>{mode.hint}</span>
                                        </button>
                                    ))}
                                </div>
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.targetLang}</label>
                                <p className="text-[10px] text-gray-500 mb-4">{t.targetLangHelp}</p>
                                <div className="grid grid-cols-2 gap-3">
                                {[0, 1, 2, 3, 4, 5].map((index) => {
                                    const langValue = targetLanguages[index];
                                    const langData = SUPPORTED_LANGUAGES.find(l => l.value === langValue);
                                    return (
                                        <div key={index} className="relative group">
                                            <button 
                                                onClick={() => { setActiveLangSlot(index); setLangSearch(''); }} 
                                                className={`w-full h-14 flex items-center justify-center gap-2 rounded-xl border transition-all ${langData ? 'bg-razer/10 border-razer text-white' : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10 border-dashed'}`}
                                            >
                                                {langData ? (
                                                    <>
                                                        <span className="text-xl">{langData.flag}</span>
                                                        <span className="text-xs font-bold truncate max-w-[100px]">{langData.label}</span>
                                                    </>
                                                ) : (
                                                    <PlusCircle size={18} className="opacity-50" />
                                                )}
                                            </button>
                                            {langData && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newLangs = targetLanguages.filter((_, i) => i !== index);
                                                        setTargetLanguages(newLangs);
                                                    }}
                                                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:scale-110"
                                                >
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                                </div>
                             </div>
                        </>
                     ) : (
                        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex items-center gap-3 mb-4 sticky top-0 bg-[#1a1a1a] z-10 pb-2">
                                <button onClick={() => setActiveLangSlot(null)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><ArrowLeft size={18} /></button>
                                <div className="flex-1 relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input 
                                        type="text" 
                                        placeholder={t.search} 
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-razer text-white placeholder:text-gray-600"
                                        value={langSearch}
                                        onChange={(e) => setLangSearch(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                {SUPPORTED_LANGUAGES.filter(l => l.label.toLowerCase().includes(langSearch.toLowerCase()) || l.value.toLowerCase().includes(langSearch.toLowerCase())).map(lang => {
                                    const isSelected = targetLanguages.includes(lang.value);
                                    return (
                                        <button 
                                            key={lang.value} 
                                            onClick={() => {
                                                const newLangs = [...targetLanguages];
                                                // If slot index is beyond current length, push. Else replace.
                                                // But since we removed items, indices shift. 
                                                // The activeLangSlot index refers to the visual slot.
                                                // If I click slot 3 (index 2) but array length is 1, I should push.
                                                // Actually, the UI renders slots 0-5.
                                                // If targetLanguages has 2 items, slots 0,1 are filled.
                                                // If I click slot 2 (empty), I am adding a new item.
                                                // If I click slot 4 (empty), I am also adding a new item (at the end).
                                                
                                                if (activeLangSlot >= newLangs.length) {
                                                    newLangs.push(lang.value);
                                                } else {
                                                    newLangs[activeLangSlot] = lang.value;
                                                }
                                                
                                                // Remove duplicates if any (except the one we just added/modified)
                                                // Actually, let's just allow duplicates or filter them?
                                                // Better to filter out previous occurrence of this lang to avoid duplicates
                                                // But that might shift indices. Let's keep it simple: allow, or just warn.
                                                // User didn't specify. I'll allow it.
                                                
                                                setTargetLanguages(newLangs);
                                                setActiveLangSlot(null);
                                                setLangSearch('');
                                            }} 
                                            className={`flex items-center justify-between p-3 rounded-xl text-left transition-all ${isSelected ? 'bg-razer/10 border border-razer/30' : 'hover:bg-white/5 border border-transparent'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl">{lang.flag}</span>
                                                <span className={`text-sm font-medium ${isSelected ? 'text-razer' : 'text-gray-300'}`}>{lang.label}</span>
                                            </div>
                                            {isSelected && <Check size={16} className="text-razer" />}
                                        </button>
                                    );
                                })}
                                {SUPPORTED_LANGUAGES.filter(l => l.label.toLowerCase().includes(langSearch.toLowerCase())).length === 0 && (
                                    <p className="text-center text-gray-500 py-8 text-xs uppercase tracking-widest">No languages found</p>
                                )}
                            </div>
                        </div>
                     )}
                </div>
                <div className="p-6 pt-0">
                  <button onClick={() => { setConfigOpen(false); setActiveLangSlot(null); }} className="w-full py-4 bg-white text-black font-bold text-sm rounded-2xl hover:bg-gray-200 transition-colors shadow-lg">{t.ok}</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
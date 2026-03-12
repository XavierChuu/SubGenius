
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SubtitleBlock, Language, ModelType, SplitMode, MobileEditState, SubtitleStyle, WordData } from '../types';
import { Download, Table, RefreshCcw, X, FileUp, Loader2, Clock, MonitorPlay, Search, User, ChevronUp, ChevronDown, CaseSensitive, Palette, Check, Film, AlignLeft, AlignCenter, AlignRight, Move, Bold, Italic, Underline, Plus, SearchIcon, Languages, FileJson, AlertTriangle, LayoutGrid, FileText, File, Copy, ListTodo } from 'lucide-react';
import { downloadSRT, downloadASS, downloadCSV, downloadDOC, parseSRTString, parseCSVString, parseASSString } from '../utils/fileUtils';
import { reTranslateSubtitles } from '../services/geminiService';
import { timeToSeconds, secondsToTime } from '../utils/timeUtils';
import { LANGUAGE_CODE_MAP, FONT_FAMILIES } from '../constants';
import Timeline from './Timeline';

// --- Interfaces ---
interface SearchMatch {
    blockId: number;
    occurrenceIndex: number;
}

interface SubtitleEditorProps {
    blocks: SubtitleBlock[];
    setBlocks: (blocks: SubtitleBlock[]) => void;
    title: string;
    ui: any;
    uiLang: string;
    targetLanguages: Language[];
    audioTime: number;
    modelType: ModelType;
    splitMode: SplitMode;
    setSplitMode: (mode: SplitMode) => void;
    isOfflineMode: boolean;
    mobileEdit: MobileEditState | null;
    setMobileEdit: (state: MobileEditState | null) => void;
    isMobileSearchOpen: boolean;
    setIsMobileSearchOpen: (open: boolean) => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    mediaUrl: string | null;
    isVideo: boolean;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    style: SubtitleStyle;
    setStyle: (style: SubtitleStyle) => void;
    onExportProject?: () => void;
    onSelectMedia?: (file: File) => void;
}

// --- Component: HighlightableText ---
interface HighlightableTextProps {
    text: string;
    searchTerm: string;
    isCaseSensitive: boolean;
    isFocusedBlock: boolean;
    currentOccurrenceInBlock: number | null;
    className?: string;
    style?: React.CSSProperties;
}

const HighlightableText: React.FC<HighlightableTextProps> = ({ 
    text, searchTerm, isCaseSensitive, isFocusedBlock, currentOccurrenceInBlock, className, style 
}) => {
    if (!searchTerm) return <span className={className} style={style}>{text}</span>;

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, isCaseSensitive ? 'g' : 'gi');
    const parts = text.split(regex);
    let occurrenceCounter = 0;

    return (
        <span className={className} style={style}>
            {parts.map((part, i) => {
                if (part.toLowerCase() === searchTerm.toLowerCase()) {
                    const isCurrent = isFocusedBlock && occurrenceCounter === currentOccurrenceInBlock;
                    occurrenceCounter++;
                    return (
                        <mark 
                            key={i} 
                            className={`rounded-sm px-0.5 transition-colors duration-200 ${isCurrent ? 'bg-razer text-black font-bold' : 'bg-yellow-400/90 text-black'}`}
                        >
                            {part}
                        </mark>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
};

// --- Sub-Component: EditableText ---
interface EditableTextProps {
    value: string;
    onChange: (newValue: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onPaste?: (e: React.ClipboardEvent) => void;
    className?: string;
    style?: React.CSSProperties;
    disabled?: boolean;
    placeholder?: string;
    searchTerm?: string;
    isCaseSensitive?: boolean;
    isFocusedBlock?: boolean;
    currentOccurrenceInBlock?: number | null;
}

const EditableText: React.FC<EditableTextProps> = ({ 
    value, onChange, onFocus, onBlur, onPaste, className, style, disabled, placeholder,
    searchTerm, isCaseSensitive, isFocusedBlock, currentOccurrenceInBlock
}) => {
    const elRef = useRef<HTMLDivElement>(null);
    const isFocused = useRef(false);

    useEffect(() => {
        if (elRef.current) {
            // Cập nhật nội dung nếu không đang focus HOẶC nếu giá trị prop khác với nội dung hiện tại
            // (Điều này giúp đồng bộ khi có thay đổi từ bên ngoài như Replace)
            if (!isFocused.current || elRef.current.innerText !== value) {
                elRef.current.innerText = value;
            }
        }
    }, [value]);

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        const newValue = e.currentTarget.innerText;
        onChange(newValue);
    };

    const handleFocus = () => {
        isFocused.current = true;
        onFocus?.();
    };

    const handleBlur = () => {
        isFocused.current = false;
        onBlur?.();
    };

    if (searchTerm && !isFocused.current && !disabled) {
        return (
            <div
                className={`relative cursor-text outline-none ${className || ''}`}
                style={{ ...style, minHeight: '1.2em' }}
                onClick={() => elRef.current?.focus()}
            >
                <HighlightableText 
                    text={value} 
                    searchTerm={searchTerm} 
                    isCaseSensitive={isCaseSensitive || false} 
                    isFocusedBlock={isFocusedBlock || false} 
                    currentOccurrenceInBlock={currentOccurrenceInBlock ?? null}
                />
                <div
                    ref={elRef}
                    contentEditable={!disabled}
                    suppressContentEditableWarning
                    onInput={handleInput}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onPaste={onPaste}
                    className="absolute inset-0 opacity-0 pointer-events-auto"
                />
            </div>
        );
    }

    return (
        <div
            ref={elRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            onInput={handleInput}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onPaste={onPaste}
            className={`outline-none focus:ring-0 min-h-[1em] ${className || ''}`}
            data-placeholder={placeholder}
            style={{ 
                ...style, 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                cursor: disabled ? 'default' : 'text',
                display: style?.display || 'inline-block',
                width: style?.width || '100%'
            }}
        />
    );
};

// --- Font Dropdown ---
const FontDropdown: React.FC<{
    value: string;
    onChange: (val: string) => void;
    fonts: {label: string, value: string}[];
    ui: any;
    onUpload: () => void;
}> = ({ value, onChange, fonts, ui, onUpload }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        return fonts.filter(f => f.label.toLowerCase().includes(search.toLowerCase()));
    }, [fonts, search]);

    const activeFontLabel = useMemo(() => {
        return fonts.find(f => f.value === value)?.label || value.split(',')[0].replace(/"/g, '');
    }, [fonts, value]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-white flex items-center justify-between hover:border-razer/30 transition-all outline-none"
            >
                <span className="truncate" style={{ fontFamily: value }}>{activeFontLabel}</span>
                <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180 text-razer' : 'text-gray-500'}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-dark-900 border border-white/10 rounded-2xl shadow-2xl z-[10001] animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[350px]">
                    <div className="p-2 border-b border-white/5 sticky top-0 bg-dark-900 z-10 space-y-2">
                        <div className="relative">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                            <input 
                                type="text"
                                autoFocus
                                placeholder={ui.fontSearch}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-black/40 border border-white/5 rounded-lg pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-razer/30 transition-all"
                            />
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onUpload(); }} className="w-full py-2 bg-razer/10 hover:bg-razer/20 text-razer text-[10px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-2">
                            <Plus size={14} /> {ui.uploadFont}
                        </button>
                    </div>
                    <div className="overflow-y-auto no-scrollbar py-1">
                        {filtered.length > 0 ? filtered.map((f) => (
                            <button 
                                key={f.value}
                                onClick={() => { onChange(f.value); setIsOpen(false); }}
                                className={`w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-all flex items-center justify-between group ${value === f.value ? 'bg-razer/10 text-razer' : 'text-gray-400'}`}
                            >
                                <span style={{ fontFamily: f.value }} className="truncate">{f.label}</span>
                                {value === f.value && <Check size={14} />}
                            </button>
                        )) : (
                            <div className="p-8 text-center text-gray-600 text-[10px] font-bold uppercase tracking-widest italic">No fonts found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Style Panel ---
interface StylePanelProps {
    style: SubtitleStyle;
    setStyle: (s: SubtitleStyle) => void;
    onClose: () => void;
    ui: any;
    customFonts: {label: string, value: string}[];
    onFontUpload: () => void;
    pos: {x: number, y: number};
    setPos: (p: {x: number, y: number}) => void;
}

const StylePanelInternal: React.FC<StylePanelProps> = ({ style, setStyle, onClose, ui, customFonts, onFontUpload, pos, setPos }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const currentPos = useRef({ x: pos.x, y: pos.y });

    useEffect(() => {
        if (panelRef.current) {
            const padding = 16;
            const maxX = window.innerWidth - panelRef.current.offsetWidth - padding;
            const actualX = Math.min(pos.x, maxX > padding ? maxX : padding);
            currentPos.current = { ...currentPos.current, x: actualX };
            panelRef.current.style.transform = `translate3d(${actualX}px, ${pos.y}px, 0)`;
        }
    }, [pos.y, pos.x]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('input, button, select, .no-drag')) return;
        isDragging.current = true;
        startPos.current = {
            x: e.clientX - currentPos.current.x,
            y: e.clientY - currentPos.current.y
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current || !panelRef.current) return;
        let newX = e.clientX - startPos.current.x;
        let newY = e.clientY - startPos.current.y;
        const padding = 10;
        newX = Math.max(padding, Math.min(newX, window.innerWidth - panelRef.current.offsetWidth - padding));
        newY = Math.max(padding, Math.min(newY, window.innerHeight - panelRef.current.offsetHeight - padding));
        currentPos.current = { x: newX, y: newY };
        panelRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        setPos(currentPos.current);
    };

    const updateStyle = (key: keyof SubtitleStyle, val: any) => {
        setStyle({ ...style, [key]: val });
    };

    return (
        <div 
            ref={panelRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="fixed z-[10000] glass-panel rounded-[24px] w-[calc(100%-32px)] md:w-[350px] border border-white/10 shadow-2xl flex flex-col max-h-[75vh] top-0 left-0 touch-none select-none"
        >
            <div className="flex justify-between items-center p-5 border-b border-white/5 cursor-grab active:cursor-grabbing group bg-black/40 rounded-t-[24px]">
                <span className="text-xs font-black text-razer uppercase tracking-widest flex items-center gap-2 pointer-events-none">
                    <Palette size={16} /> {ui.subtitleStyle}
                </span>
                <div className="flex items-center gap-3 pointer-events-none">
                    <Move size={14} className="text-gray-600 group-hover:text-razer transition-colors" />
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClose(); }} 
                        className="text-gray-500 hover:text-white bg-white/5 rounded-full p-1.5 transition-colors no-drag pointer-events-auto"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div 
                className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-6 pb-12"
                onPointerDown={(e) => e.stopPropagation()} 
            >
                <div className="space-y-4 no-drag">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{ui.showSecondary}</label>
                        <button onClick={() => updateStyle('showSecondarySubtitle', !style.showSecondarySubtitle)} className={`w-9 h-5 rounded-full relative transition-all ${style.showSecondarySubtitle ? 'bg-razer shadow-[0_0_8px_#44d62c]' : 'bg-gray-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${style.showSecondarySubtitle ? 'left-5' : 'left-1'}`} />
                        </button>
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5 no-drag">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">{ui.textAlign} & Position</label>
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                        {(['left', 'center', 'right'] as const).map(align => (
                            <button key={align} onClick={() => updateStyle('textAlign', align)} className={`flex-1 py-2 flex justify-center rounded-lg transition-all ${style.textAlign === align ? 'bg-white/10 text-razer' : 'text-gray-400 hover:text-gray-300'}`}>
                                {align === 'left' ? <AlignLeft size={18} /> : align === 'center' ? <AlignCenter size={18} /> : <AlignRight size={18} />}
                            </button>
                        ))}
                    </div>
                    
                    {[
                        { label: 'Y-Pos', key: 'verticalPosition' as const, min: 0, max: 100, unit: '%' },
                        { label: 'X-Pos', key: 'horizontalPosition' as const, min: 0, max: 100, unit: '%' },
                        { label: ui.maxWidth, key: 'maxWidth' as const, min: 20, max: 100, unit: '%' }
                    ].map(ctrl => (
                        <div key={ctrl.key} className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-gray-500">{ctrl.label}</span>
                                <div className="flex items-center gap-1">
                                    <input 
                                        type="number" 
                                        value={style[ctrl.key]} 
                                        onChange={(e) => updateStyle(ctrl.key, parseInt(e.target.value) || 0)}
                                        className="bg-black/60 border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono text-razer w-10 text-right outline-none"
                                    />
                                    <span className="text-[9px] text-gray-600 font-bold">{ctrl.unit}</span>
                                </div>
                            </div>
                            <input 
                                type="range" min={ctrl.min} max={ctrl.max} step="1"
                                value={style[ctrl.key]} 
                                onChange={(e) => updateStyle(ctrl.key, parseInt(e.target.value))}
                                className="w-full accent-razer h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer" 
                            />
                        </div>
                    ))}
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5 no-drag">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Typography</label>
                    <FontDropdown 
                        value={style.fontFamily} 
                        onChange={(val) => updateStyle('fontFamily', val)}
                        fonts={[...FONT_FAMILIES, ...customFonts]}
                        ui={ui}
                        onUpload={onFontUpload}
                    />
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-gray-500">{ui.fontSize}</span>
                            <div className="flex items-center gap-1">
                                <input 
                                    type="number" 
                                    value={style.fontSize} 
                                    onChange={(e) => updateStyle('fontSize', parseInt(e.target.value) || 12)}
                                    className="bg-black/60 border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono text-razer w-10 text-right outline-none"
                                />
                                <span className="text-[9px] text-gray-600 font-bold">px</span>
                            </div>
                        </div>
                        <input 
                            type="range" min="8" max="200" 
                            value={style.fontSize} 
                            onChange={(e) => updateStyle('fontSize', parseInt(e.target.value))}
                            className="w-full accent-razer h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer" 
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => updateStyle('fontWeight', style.fontWeight === 'bold' ? 'normal' : 'bold')} className={`flex-1 py-2 rounded-lg border flex justify-center items-center transition-all ${style.fontWeight === 'bold' ? 'bg-white text-black border-white' : 'bg-transparent border-white/10 text-gray-500 hover:text-white'}`}><Bold size={16} /></button>
                        <button onClick={() => updateStyle('fontStyle', style.fontStyle === 'italic' ? 'normal' : 'italic')} className={`flex-1 py-2 rounded-lg border flex justify-center items-center transition-all ${style.fontStyle === 'italic' ? 'bg-white text-black border-white' : 'bg-transparent border-white/10 text-gray-500 hover:text-white'}`}><Italic size={16} /></button>
                        <button onClick={() => updateStyle('textDecoration', style.textDecoration === 'underline' ? 'none' : 'underline')} className={`flex-1 py-2 rounded-lg border flex justify-center items-center transition-all ${style.textDecoration === 'underline' ? 'bg-white text-black border-white' : 'bg-transparent border-white/10 text-gray-500 hover:text-white'}`}><Underline size={16} /></button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5 no-drag">
                    {[
                        { label: ui.fontColor, key: 'textColor' as const },
                        { label: ui.highlight, key: 'highlightColor' as const }
                    ].map(c => (
                        <div key={c.key}>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">{c.label}</label>
                            <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/5">
                                <input type="color" value={style[c.key]} onChange={(e) => updateStyle(c.key, e.target.value)} className="w-8 h-8 rounded-lg overflow-hidden border-none cursor-pointer bg-transparent" />
                                <span className="text-[10px] font-mono text-gray-500 uppercase">{style[c.key]}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5 no-drag">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{ui.highlightPerWord}</label>
                        <button onClick={() => updateStyle('highlightWords', !style.highlightWords)} className={`w-9 h-5 rounded-full relative transition-all ${style.highlightWords ? 'bg-razer shadow-[0_0_8px_#44d62c]' : 'bg-gray-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${style.highlightWords ? 'left-5' : 'left-1'}`} />
                        </button>
                    </div>
                    {style.highlightWords && (
                        <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                            {(['highlightBold', 'highlightItalic', 'highlightUnderline'] as const).map(h => (
                                <button key={h} onClick={() => updateStyle(h, !style[h])} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg border transition-all ${style[h] ? 'bg-razer/20 text-razer border-razer' : 'border-white/5 text-gray-500'}`}>
                                    {h.replace('highlight', '')}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5 no-drag">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{ui.bgColor}</label>
                        <button onClick={() => updateStyle('showBackground', !style.showBackground)} className={`w-9 h-5 rounded-full relative transition-all ${style.showBackground ? 'bg-razer shadow-[0_0_8px_#44d62c]' : 'bg-gray-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${style.showSecondarySubtitle ? 'left-5' : 'left-1'}`} />
                        </button>
                    </div>
                    {style.showBackground && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-top-1">
                            <div className="flex items-center gap-4">
                                <input type="color" value={style.backgroundColor} onChange={(e) => updateStyle('backgroundColor', e.target.value)} className="w-10 h-8 rounded-lg border-none cursor-pointer bg-transparent" />
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">{ui.bgOpacity}</label>
                                        <input 
                                            type="number" step="0.05" min="0" max="1"
                                            value={style.backgroundOpacity} 
                                            onChange={(e) => updateStyle('backgroundOpacity', parseFloat(e.target.value) || 0)}
                                            className="bg-black/60 border border-white/10 rounded px-1 text-[9px] font-mono text-razer w-10 text-right outline-none"
                                        />
                                    </div>
                                    <input type="range" min="0" max="1" step="0.05" value={style.backgroundOpacity} onChange={(e) => updateStyle('backgroundOpacity', parseFloat(e.target.value))} className="w-full accent-razer h-1.5 bg-white/5 rounded-full appearance-none" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: ui.borderRadius, key: 'borderRadius' as const, max: 60 },
                                    { label: ui.padding, key: 'padding' as const, max: 120 }
                                ].map(attr => (
                                    <div key={attr.key}>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-[9px] font-bold text-gray-500 uppercase">{attr.label}</label>
                                            <input 
                                                type="number"
                                                value={style[attr.key]} 
                                                onChange={(e) => updateStyle(attr.key, parseInt(e.target.value) || 0)}
                                                className="bg-black/60 border border-white/10 rounded px-1 text-[9px] font-mono text-razer w-8 text-right outline-none"
                                            />
                                        </div>
                                        <input type="range" min="0" max={attr.max} value={style[attr.key]} onChange={(e) => updateStyle(attr.key, parseInt(e.target.value))} className="w-full accent-razer h-1.5 bg-white/5 rounded-full appearance-none" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5 no-drag">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{ui.glow}</label>
                        <button onClick={() => updateStyle('showGlow', !style.showGlow)} className={`w-9 h-5 rounded-full relative transition-all ${style.showGlow ? 'bg-razer shadow-[0_0_8px_#44d62c]' : 'bg-gray-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${style.showGlow ? 'left-5' : 'left-1'}`} />
                        </button>
                    </div>
                    {style.showGlow && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-top-1">
                            <div className="flex items-center gap-4">
                                <input type="color" value={style.glowColor} onChange={(e) => updateStyle('glowColor', e.target.value)} className="w-10 h-8 rounded-lg border-none cursor-pointer bg-transparent" />
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[9px] font-bold text-gray-500 uppercase">{ui.glowOpacity}</label>
                                        <input 
                                            type="number" step="0.05" min="0" max="1"
                                            value={style.glowOpacity} 
                                            onChange={(e) => updateStyle('glowOpacity', parseFloat(e.target.value) || 0)}
                                            className="bg-black/60 border border-white/10 rounded px-1 text-[9px] font-mono text-razer w-10 text-right outline-none"
                                        />
                                    </div>
                                    <input type="range" min="0" max="1" step="0.05" value={style.glowOpacity} onChange={(e) => updateStyle('glowOpacity', parseFloat(e.target.value))} className="w-full accent-razer h-1.5 bg-white/5 rounded-full appearance-none" />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-gray-500">{ui.glowBlur}</span>
                                    <input 
                                        type="number" 
                                        value={style.glowBlur} 
                                        onChange={(e) => updateStyle('glowBlur', parseInt(e.target.value) || 0)}
                                        className="bg-black/60 border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono text-razer w-10 text-right outline-none"
                                    />
                                </div>
                                <input 
                                    type="range" min="0" max="100" step="1"
                                    value={style.glowBlur} 
                                    onChange={(e) => updateStyle('glowBlur', parseInt(e.target.value))}
                                    className="w-full accent-razer h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer" 
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/80 to-transparent pointer-events-none rounded-b-[24px]" />
        </div>
    );
};

// --- Main Component ---
const SubtitleEditor: React.FC<SubtitleEditorProps> = ({ 
    blocks, setBlocks, title, ui, uiLang, targetLanguages, audioTime, modelType, 
    splitMode, setSplitMode, isOfflineMode,
    mobileEdit, setMobileEdit,
    searchTerm, setSearchTerm,
    mediaUrl, isVideo, videoRef,
    style, setStyle, onExportProject, onSelectMedia
}) => {
  const [activeTab, setActiveTab] = useState<string>('original');
  const [viewMode, setViewMode] = useState<'grid' | 'text'>('grid');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [replaceTerm, setReplaceTerm] = useState('');
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [isStylePanelOpen, setIsStylePanelOpen] = useState(false);
  const [isPlayerCollapsed, setIsPlayerCollapsed] = useState(false);
  const [playerZoom, setPlayerZoom] = useState(1);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showCuesList, setShowCuesList] = useState(true);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [customFonts, setCustomFonts] = useState<{label: string, value: string}[]>([]);
  const fontUploadRef = useRef<HTMLInputElement>(null);
  const [stylePanelPos, setStylePanelPos] = useState({ x: 16, y: 120 });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeCueRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [isExportModalOpen, setExportModalOpen] = useState(false);
  const [selectedExportLangs, setSelectedExportLangs] = useState<string[]>(['original']);
  const [exportFormat, setExportFormat] = useState<'srt' | 'ass' | 'csv'>('srt');
  const [isVideoExportModalOpen, setVideoExportModalOpen] = useState(false);
  const [history, setHistory] = useState<SubtitleBlock[][]>([]);

  const pushToHistory = useCallback(() => {
    setHistory(prev => {
      const newHistory = [...prev, [...blocks]];
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
  }, [blocks]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const lastState = history[history.length - 1];
    setBlocks(lastState);
    setHistory(prev => prev.slice(0, -1));
  }, [history, setBlocks]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo]);

  const groupedBlocks = useMemo(() => {
    const groups: { speaker: string; blocks: SubtitleBlock[] }[] = [];
    let currentGroup: { speaker: string; blocks: SubtitleBlock[] } | null = null;

    blocks.forEach(block => {
      const speaker = block.speaker || ui.speaker || 'Speaker';
      if (!currentGroup || currentGroup.speaker !== speaker) {
        currentGroup = { speaker, blocks: [block] };
        groups.push(currentGroup);
      } else {
        currentGroup.blocks.push(block);
      }
    });
    return groups;
  }, [blocks, ui.speaker]);
  
  // Video metrics for responsive scaling
  const [videoMetrics, setVideoMetrics] = useState({ 
    width: 0, height: 0, top: 0, left: 0, aspectRatio: 16/9 
  });

  const [isPreviewEditing, setIsPreviewEditing] = useState(false);

  const actualVideoRef = videoRef || localVideoRef;

  // Responsive Scaling Logic with "Logical Stage" concept
  useEffect(() => {
    const calculateMetrics = () => {
        if (!containerRef.current) return;
        
        const containerW = containerRef.current.offsetWidth;
        const containerH = containerRef.current.offsetHeight;
        
        // Default 16:9 HD resolution if no video or metadata not loaded
        let videoW = actualVideoRef.current?.videoWidth || 1280;
        let videoH = actualVideoRef.current?.videoHeight || 720;
        
        if (videoW === 0) videoW = 1280;
        if (videoH === 0) videoH = 720;
        
        const aspect = videoW / videoH;
        const containerAspect = containerW / containerH;
        
        let renderW, renderH, top, left;
        
        if (containerAspect > aspect) {
            // Container is wider than video -> Video fits height
            renderH = containerH;
            renderW = containerH * aspect;
            top = 0;
            left = (containerW - renderW) / 2;
        } else {
            // Container is taller than video -> Video fits width
            renderW = containerW;
            renderH = containerW / aspect;
            left = 0;
            top = (containerH - renderH) / 2;
        }
        
        setVideoMetrics({
            width: renderW,
            height: renderH,
            top,
            left,
            aspectRatio: aspect
        });
    };

    calculateMetrics();
    const ro = new ResizeObserver(calculateMetrics);
    if (containerRef.current) ro.observe(containerRef.current);
    
    window.addEventListener('resize', calculateMetrics);
    const videoEl = actualVideoRef.current;
    if(videoEl) videoEl.addEventListener('loadedmetadata', calculateMetrics);
    
    // Trigger once to ensure initial state
    calculateMetrics();

    return () => {
        ro.disconnect();
        window.removeEventListener('resize', calculateMetrics);
        if(videoEl) videoEl.removeEventListener('loadedmetadata', calculateMetrics);
    };
  }, [isVideo, mediaUrl, isPlayerCollapsed, playerZoom]);

  const handlePaste = (e: React.ClipboardEvent, blockId: number, field: 'original' | 'translation') => {
    const pasteData = e.clipboardData.getData('text');
    if (pasteData.includes('\t') || pasteData.includes('\n')) {
      e.preventDefault();
      const rows = pasteData.split(/\r?\n/).filter(row => row.trim() !== '');
      if (rows.length > 1) {
        const newBlocks = [...blocks];
        const startIdx = newBlocks.findIndex(b => b.id === blockId);
        if (startIdx === -1) return;

        rows.forEach((row, i) => {
          const targetIdx = startIdx + i;
          if (targetIdx < newBlocks.length) {
            const columns = row.split('\t');
            const text = columns[0]; 
            if (field === 'original') {
              newBlocks[targetIdx] = { ...newBlocks[targetIdx], originalText: text };
            } else {
              newBlocks[targetIdx] = { 
                ...newBlocks[targetIdx], 
                translations: { ...newBlocks[targetIdx].translations, [activeTab as Language]: text } 
              };
            }
          }
        });
        setBlocks(newBlocks);
      } else {
        const text = pasteData.replace(/\t/g, ' ');
        if (field === 'original') handleOriginalChange(blockId, text);
        else handleTranslationChange(blockId, activeTab as Language, text);
      }
    }
  };

  const handleFontUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const fontName = file.name.replace(/\.[^/.]+$/, "");
      const reader = new FileReader();
      reader.onload = (event) => {
          const content = event.target?.result as string;
          const newStyle = document.createElement('style');
          newStyle.textContent = `@font-face { font-family: "${fontName}"; src: url("${content}"); }`;
          document.getElementById('custom-fonts-container')?.appendChild(newStyle);
          const newFontObj = { label: `[Custom] ${fontName}`, value: `"${fontName}", sans-serif` };
          setCustomFonts(prev => [...prev, newFontObj]);
          setStyle({ ...style, fontFamily: newFontObj.value });
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  }, [style, setStyle]);

  const allMatches = useMemo(() => {
    if (!searchTerm || searchTerm.length < 1) return [];
    const matches: SearchMatch[] = [];
    blocks.forEach(block => {
      const text = activeTab === 'original' ? block.originalText : (block.translations[activeTab as Language] || '');
      const searchText = isCaseSensitive ? text : text.toLowerCase();
      const term = isCaseSensitive ? searchTerm : searchTerm.toLowerCase();
      let pos = searchText.indexOf(term);
      let occurrenceCountInBlock = 0;
      while (pos !== -1) {
        matches.push({ blockId: block.id, occurrenceIndex: occurrenceCountInBlock });
        occurrenceCountInBlock++;
        pos = searchText.indexOf(term, pos + 1);
      }
    });
    return matches;
  }, [blocks, searchTerm, activeTab, isCaseSensitive]);

  const activeIndex = useMemo(() => blocks.findIndex(b => {
    const start = timeToSeconds(b.start);
    const end = timeToSeconds(b.end);
    return audioTime >= start && audioTime <= end;
  }), [blocks, audioTime]);

  const activeBlock = activeIndex !== -1 ? blocks[activeIndex] : null;

  useEffect(() => {
    if (isSearchPanelOpen && allMatches.length > 0) {
        const match = allMatches[currentMatchIndex];
        const el = document.getElementById(`cue-${match.blockId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatchIndex, allMatches, isSearchPanelOpen]);

  const handleOriginalChange = useCallback((id: number, newText: string) => {
    setBlocks(prevBlocks => prevBlocks.map(b => {
        if (b.id !== id) return b;
        const originalWords = b.words || [];
        const currentWordsInInput = newText.trim().split(/\s+/).filter(Boolean);
        let finalText = newText;
        if (currentWordsInInput.length > originalWords.length && originalWords.length > 0) {
            finalText = currentWordsInInput.slice(0, originalWords.length).join(' ');
        }
        const updatedWords = originalWords.map((w, idx) => ({
            ...w,
            text: currentWordsInInput[idx] || w.text
        }));
        return { ...b, originalText: finalText, words: updatedWords };
    }));
  }, [setBlocks]);

  const handleTranslationChange = useCallback((id: number, lang: Language, newText: string) => {
    setBlocks(prevBlocks => prevBlocks.map(b => b.id === id ? { ...b, translations: { ...b.translations, [lang]: newText } } : b));
  }, [setBlocks]);

  const handleSpeakerChange = (id: number, newSpeaker: string) => {
    pushToHistory();
    setBlocks(blocks.map(b => b.id === id ? { ...b, speaker: newSpeaker } : b));
  };

  const handleTimeChange = (id: number, field: 'start' | 'end', newTime: string) => {
    pushToHistory();
    setBlocks(blocks.map(b => b.id === id ? { ...b, [field]: newTime } : b));
  };

  const handleReTranslate = async () => {
    if (activeTab === 'original') return;
    setIsRefreshing(true);
    try {
        const updated = await reTranslateSubtitles(blocks, activeTab as Language, modelType);
        setBlocks(updated);
    } catch (e: any) { alert(e.message); }
    finally { setIsRefreshing(false); }
  };

  // --- Tối ưu hóa xuất Video: Web Audio API Sync + Multi Format ---
  const handleCopyColumn = (col: 'time' | 'speaker' | 'original' | 'translation') => {
    let text = '';
    blocks.forEach(b => {
      let val = '';
      if (col === 'time') val = b.start;
      else if (col === 'speaker') val = b.speaker || '';
      else if (col === 'original') val = b.originalText;
      else if (col === 'translation') val = b.translations[activeTab as Language] || '';
      
      text += val + '\n';
    });
    
    navigator.clipboard.writeText(text.trim()).then(() => {
      alert(uiLang === 'vn' ? `Đã sao chép cột ${col.toUpperCase()}!` : `Copied ${col.toUpperCase()} column!`);
    });
  };

  const handleExportVideo = async (format: 'webm' | 'mp4') => {
    if (!mediaUrl || !isVideo || !actualVideoRef.current) return;
    setVideoExportModalOpen(false);
    setIsExportingVideo(true);
    setExportProgress(0);
    
    const video = actualVideoRef.current;
    const originalMuted = video.muted;
    const originalCurrentTime = video.currentTime;
    const originalVolume = video.volume;
    
    video.pause();
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // --- KHẮC PHỤC ÂM THANH: Sử dụng AudioContext ---
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sourceNode = audioCtx.createMediaElementSource(video);
    const destinationNode = audioCtx.createMediaStreamDestination();
    
    // Kết nối âm thanh để thu
    sourceNode.connect(destinationNode);
    sourceNode.connect(audioCtx.destination); 

    // Đảm bảo AudioContext hoạt động (một số trình duyệt chặn tự động chạy)
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    let mimeType = 'video/webm;codecs=vp9,opus';
    if (format === 'mp4') {
        if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac')) mimeType = 'video/mp4;codecs=h264,aac';
        else if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';
    } else {
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8,opus';
    }

    const canvasStream = canvas.captureStream(30);
    const audioTrack = destinationNode.stream.getAudioTracks()[0];
    if (audioTrack) {
        canvasStream.addTrack(audioTrack);
    }

    const recorder = new MediaRecorder(canvasStream, { 
        mimeType: mimeType, 
        videoBitsPerSecond: 25000000 
    });
    
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
    };
    
    recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = format === 'mp4' ? 'mp4' : 'webm';
        a.download = `SubGenius_${title}_${activeTab}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        video.muted = originalMuted;
        video.currentTime = originalCurrentTime;
        video.volume = originalVolume;
        await audioCtx.close();
        setIsExportingVideo(false);
    };
    
    const duration = video.duration;
    const scale = canvas.width / 1280;
    const baseFontSize = style.fontSize * scale;
    const fontFamily = style.fontFamily.split(',')[0].replace(/"/g, '');
    const normalWeight = style.fontWeight;
    const normalStyle = style.fontStyle;
    const normalDecoration = style.textDecoration;
    const blockLayoutCache = new Map<number, any>();

    const getBlockLayout = (block: SubtitleBlock) => {
        if (blockLayoutCache.has(block.id)) return blockLayoutCache.get(block.id);
        const isKaraokeEligible = style.highlightWords && activeTab === 'original' && block.words;
        const primaryRaw = activeTab === 'original' ? block.originalText : (block.translations[activeTab as Language] || '');
        const secondaryRaw = (style.showSecondarySubtitle && activeTab !== 'original') ? block.originalText : null;
        const lines: any[] = [];
        
        const maxWidth = canvas.width * (style.maxWidth / 100);
        
        const processLineWithWords = (text: string, font: string, isPrimary: boolean, size: number, originalWords?: WordData[]) => {
            ctx.font = font;
            const words = text.split(' ');
            let currLine: string[] = [];
            let wordCursor = 0;
            const spaceWidth = ctx.measureText(" ").width;

            const flush = (wordList: string[]) => {
                const lineText = wordList.join(' ');
                const lineWidth = ctx.measureText(lineText).width;
                const lineWordsData: any[] = [];
                let xOffset = 0;
                wordList.forEach((w) => {
                    const wWidth = ctx.measureText(w).width;
                    lineWordsData.push({ text: w, width: wWidth, x: xOffset, timing: isPrimary && originalWords ? originalWords[wordCursor] : null });
                    xOffset += wWidth + spaceWidth;
                    wordCursor++;
                });
                lines.push({ words: lineWordsData, fullText: lineText, font, size, isPrimary, width: lineWidth });
            };

            words.forEach(w => {
                const test = currLine.length > 0 ? currLine.join(' ') + " " + w : w;
                if (ctx.measureText(test).width > maxWidth && currLine.length > 0) {
                    flush(currLine);
                    currLine = [w];
                } else {
                    currLine.push(w);
                }
            });
            if (currLine.length > 0) flush(currLine);
        };

        const primaryFont = `${normalStyle} ${normalWeight} ${baseFontSize}px ${fontFamily}`.trim();
        processLineWithWords(primaryRaw, primaryFont, true, baseFontSize, isKaraokeEligible ? block.words : undefined);
        if (secondaryRaw) {
            const secondaryFont = `${normalStyle} normal ${baseFontSize * 0.7}px ${fontFamily}`.trim();
            processLineWithWords(secondaryRaw, secondaryFont, false, baseFontSize * 0.7);
        }
        const padding = style.padding * scale;
        const totalH = lines.reduce((a, l) => a + (l.size * 1.4), 0) + (padding * 2);
        const maxW = Math.max(...lines.map(l => l.width));
        const res = { lines, totalH, maxW };
        blockLayoutCache.set(block.id, res);
        return res;
    };

    let lastRequest: number;
    const drawFrame = () => {
        // Khắc phục video bị đứng: Chỉ vẽ khi video đã sẵn sàng frame tiếp theo
        if (video.readyState < 2) {
            lastRequest = requestAnimationFrame(drawFrame);
            return;
        }

        const currentTime = video.currentTime;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const currentMs = Math.round(currentTime * 1000);
        const currentBlock = blocks.find(b => {
            const start = timeToSeconds(b.start);
            const end = timeToSeconds(b.end);
            return currentTime >= start && currentTime <= end;
        });
        
        if (currentBlock) {
            const layout = getBlockLayout(currentBlock);
            const padding = style.padding * scale;
            const xBase = (style.horizontalPosition / 100) * canvas.width;
            const yBase = (style.verticalPosition / 100) * canvas.height;
            const boxY = yBase - (layout.totalH / 2);

                    if (style.showBackground) {
                        ctx.save();
                        ctx.fillStyle = style.backgroundColor;
                        ctx.globalAlpha = style.backgroundOpacity;
                        
                        if (style.showGlow) {
                            ctx.shadowBlur = style.glowBlur * scale;
                            // Convert hex to rgba for better canvas support
                            const hex = style.glowColor.replace('#', '');
                            const r = parseInt(hex.substring(0, 2), 16);
                            const g = parseInt(hex.substring(2, 4), 16);
                            const b = parseInt(hex.substring(4, 6), 16);
                            ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${style.glowOpacity})`;
                        }

                        const boxW = layout.maxW + padding * 2;
                        let boxX = xBase;
                        if (style.textAlign === 'center') boxX -= boxW / 2;
                        else if (style.textAlign === 'right') boxX -= boxW;
                        ctx.beginPath();
                        if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, layout.totalH, style.borderRadius * scale);
                        else ctx.rect(boxX, boxY, boxW, layout.totalH);
                        ctx.fill();
                        ctx.restore();
                    }

            let currY = boxY + padding;
            layout.lines.forEach((line: any) => {
                const lineH = line.size * 1.4;
                const textY = currY + lineH / 2;
                let lineX = xBase;
                if (style.textAlign === 'center') lineX -= line.width / 2;
                else if (style.textAlign === 'right') lineX -= line.width;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';
                line.words.forEach((w: any) => {
                    // Timing chính xác tuyệt đối, loại bỏ padding offset gây trễ
                    const isSpoken = w.timing && currentMs >= w.timing.start_ms && currentMs <= w.timing.end_ms; 
                    const isHigh = style.highlightWords && isSpoken;
                    const wWeight = (isHigh && style.highlightBold) ? 'bold' : (line.isPrimary ? normalWeight : 'normal');
                    const wStyle = (isHigh && style.highlightItalic) ? 'italic' : normalStyle;
                    ctx.font = `${wStyle} ${wWeight} ${line.size}px ${fontFamily}`.trim();
                    ctx.fillStyle = isHigh ? style.highlightColor : (line.isPrimary ? style.textColor : `${style.textColor}BB`);
                    if (isHigh) {
                        ctx.save();
                        ctx.shadowBlur = 15 * scale;
                        ctx.shadowColor = style.highlightColor + "88";
                        ctx.fillText(w.text, lineX + w.x, textY);
                        ctx.restore();
                    } else {
                        if (style.showGlow) {
                            ctx.save();
                            ctx.shadowBlur = style.glowBlur * scale;
                            const hex = style.glowColor.replace('#', '');
                            const r = parseInt(hex.substring(0, 2), 16);
                            const g = parseInt(hex.substring(2, 4), 16);
                            const b = parseInt(hex.substring(4, 6), 16);
                            ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${style.glowOpacity})`;
                            ctx.fillText(w.text, lineX + w.x, textY);
                            ctx.restore();
                        } else {
                            ctx.fillText(w.text, lineX + w.x, textY);
                        }
                    }
                    if ((isHigh && style.highlightUnderline) || normalDecoration === 'underline') {
                        ctx.beginPath(); ctx.lineWidth = 2 * scale; ctx.strokeStyle = ctx.fillStyle;
                        ctx.moveTo(lineX + w.x, textY + (line.size / 2.2));
                        ctx.lineTo(lineX + w.x + w.width, textY + (line.size / 2.2));
                        ctx.stroke();
                    }
                });
                currY += lineH;
            });
        }
        setExportProgress(Math.floor((currentTime / duration) * 100));
        
        if (!video.ended) {
            lastRequest = requestAnimationFrame(drawFrame);
        } else {
            setTimeout(() => {
                cancelAnimationFrame(lastRequest);
                recorder.stop();
            }, 500);
        }
    };

    video.currentTime = 0;
    video.muted = false; 
    await new Promise(resolve => setTimeout(resolve, 800));
    recorder.start();
    video.play().catch(e => {
        console.error("Playback failed", e);
        setIsExportingVideo(false);
        audioCtx.close();
    });
    drawFrame();
  };

  const executeReplace = (isAll: boolean) => {
      if (!searchTerm) return;
      const flags = isCaseSensitive ? 'g' : 'gi';
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      
      const newBlocks = blocks.map(b => {
          if (isAll || (allMatches[currentMatchIndex]?.blockId === b.id)) {
              if (activeTab === 'original') {
                  const newText = b.originalText.replace(regex, replaceTerm);
                  const originalWords = b.words || [];
                  const currentWordsInInput = newText.trim().split(/\s+/).filter(Boolean);
                  
                  // Keep word count sync logic consistent with handleOriginalChange
                  let finalText = newText;
                  if (currentWordsInInput.length > originalWords.length && originalWords.length > 0) {
                      finalText = currentWordsInInput.slice(0, originalWords.length).join(' ');
                  }
                  
                  const updatedWords = originalWords.map((w, idx) => ({
                      ...w,
                      text: currentWordsInInput[idx] || w.text
                  }));

                  // Sync with mobile edit if active
                  if (mobileEdit && mobileEdit.blockId === b.id && mobileEdit.lang === 'original') {
                      setMobileEdit({ ...mobileEdit, value: finalText });
                  }

                  return { ...b, originalText: finalText, words: updatedWords };
              } else {
                  const currentVal = b.translations[activeTab as Language] || '';
                  const newText = currentVal.replace(regex, replaceTerm);

                  // Sync with mobile edit if active
                  if (mobileEdit && mobileEdit.blockId === b.id && mobileEdit.lang === activeTab) {
                      setMobileEdit({ ...mobileEdit, value: newText });
                  }

                  return { ...b, translations: { ...b.translations, [activeTab as Language]: newText } };
              }
          }
          return b;
      });
      
      setBlocks(newBlocks);
      if (isAll) { 
          setIsSearchPanelOpen(false); 
          setSearchTerm(''); 
      }
  };

  const handleExportFinal = () => {
    setExportModalOpen(false);
    if (exportFormat === 'csv') {
      downloadCSV(blocks, title, selectedExportLangs);
      return;
    }
    if (exportFormat === 'doc') {
      // Export DOC only for the first selected language or active tab if none selected
      const lang = selectedExportLangs[0] || activeTab;
      downloadDOC(blocks, `${title}_${LANGUAGE_CODE_MAP[lang] || lang}`, lang);
      return;
    }

    selectedExportLangs.forEach(lang => {
      const filename = `${title}_${LANGUAGE_CODE_MAP[lang] || lang}`;
      const textForLang = (b: SubtitleBlock) => lang === 'original' ? b.originalText : (b.translations[lang as Language] || b.originalText);

      if (exportFormat === 'srt') {
        const cues = blocks.map(b => ({
          id: b.id,
          start: b.start,
          end: b.end,
          text: textForLang(b)
        }));
        downloadSRT(cues, filename, style);
      } else if (exportFormat === 'ass') {
        const exportBlocks = blocks.map(b => ({
          ...b,
          originalText: textForLang(b)
        }));
        downloadASS(exportBlocks, filename, style);
      }
    });
  };

  const renderKaraokeContent = () => {
    if (!activeBlock || !activeBlock.words) return null;
    const lines = activeBlock.originalText.split('\n');
    let wordCursor = 0;
    const currMs = audioTime * 1000;
    return (
        <div 
          className={`flex flex-col w-full outline-none cursor-pointer ${style.textAlign === 'center' ? 'items-center' : style.textAlign === 'right' ? 'items-end' : 'items-start'}`}
          onClick={() => setIsPreviewEditing(true)} 
        >
          {lines.map((line, lineIdx) => {
              const lineWords = line.trim().split(/\s+/).filter(Boolean);
              return (
                  <div key={lineIdx} className={`flex flex-wrap gap-x-[0.25em] min-h-[1.2em] ${style.textAlign === 'center' ? 'justify-center' : style.textAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                      {lineWords.map((wordText, wIdx) => {
                          const wordData = activeBlock.words![wordCursor];
                          wordCursor++;
                          if (!wordData) return <span key={wIdx}>{wordText}</span>;
                          // Tối ưu hiển thị Karaoke: Phản hồi tức thì không có offset giả
                          const isSpoken = currMs >= wordData.start_ms && currMs <= wordData.end_ms;
                          const isHighlighted = style.highlightWords && isSpoken;
                          return (
                              <span key={wIdx} style={{ 
                                  color: isHighlighted ? style.highlightColor : style.textColor,
                                  fontWeight: (isHighlighted && style.highlightBold) ? 'bold' : style.fontWeight,
                                  fontStyle: (isHighlighted && style.highlightItalic) ? 'italic' : style.fontStyle,
                                  textDecoration: (isHighlighted && style.highlightUnderline) || style.textDecoration === 'underline' ? 'underline' : 'none',
                                  textShadow: isHighlighted ? `0 0 12px ${style.highlightColor}AA` : 'none',
                                  transform: isHighlighted ? 'scale(1.04)' : 'scale(1)',
                                  transition: 'all 0.05s linear' // Hiệu ứng mượt hơn khi khớp từ
                              }}>{wordData.text}</span>
                          );
                      })}
                      {lineWords.length === 0 && <span className="opacity-0"> </span>}
                  </div>
              );
          })}
        </div>
    );
  };

  const renderStyledPreview = () => {
      if (!activeBlock) return null;
      const primaryText = activeTab === 'original' ? activeBlock.originalText : (activeBlock.translations[activeTab as Language] || '');
      const secondaryText = (style.showSecondarySubtitle && activeTab !== 'original') ? activeBlock.originalText : null;
      const focusedMatch = allMatches[currentMatchIndex];
      const isKaraokeMode = style.highlightWords && activeTab === 'original' && activeBlock.words;
      
      return (
          <div className="flex flex-col gap-1 w-full pointer-events-auto items-center overflow-visible group/preview">
              <div className={`w-full ${style.textAlign === 'center' ? 'text-center' : style.textAlign === 'right' ? 'text-right' : 'text-left'}`}>
                  {isKaraokeMode && !isPreviewEditing && !searchTerm ? (
                      renderKaraokeContent()
                  ) : (
                      <EditableText
                        value={primaryText}
                        onChange={(newVal) => {
                            if (activeTab === 'original') handleOriginalChange(activeBlock.id, newVal);
                            else handleTranslationChange(activeBlock.id, activeTab as Language, newVal);
                        }}
                        onFocus={() => setIsPreviewEditing(true)}
                        onBlur={() => setIsPreviewEditing(false)}
                        searchTerm={searchTerm}
                        isCaseSensitive={isCaseSensitive}
                        isFocusedBlock={focusedMatch?.blockId === activeBlock.id}
                        currentOccurrenceInBlock={focusedMatch?.blockId === activeBlock.id ? focusedMatch.occurrenceIndex : null}
                        style={{ fontWeight: style.fontWeight, fontStyle: style.fontStyle, textDecoration: style.textDecoration }}
                      />
                  )}
              </div>
              {secondaryText && <div className={`text-[0.7em] opacity-80 pointer-events-none italic whitespace-pre-wrap ${style.textAlign === 'center' ? 'text-center' : style.textAlign === 'right' ? 'text-right' : 'text-left'}`}>{secondaryText}</div>}
          </div>
      );
  };

  const LOGICAL_WIDTH = 1280;
  const scaleFactor = videoMetrics.width / LOGICAL_WIDTH;
  const logicalHeight = LOGICAL_WIDTH / videoMetrics.aspectRatio;

  return (
    <div className="glass-panel rounded-3xl overflow-hidden flex flex-col min-h-[80vh] h-auto animate-in fade-in duration-500 shadow-2xl relative mb-10">
        <div className="bg-black/20 border-b border-white/5 p-2 md:p-3 flex flex-col md:flex-row items-center gap-2 md:gap-3 z-30">
            <div className="relative flex items-center bg-black/40 rounded-full max-w-full overflow-hidden flex-1 md:flex-none">
                <div className="flex p-0.5 md:p-1 overflow-x-auto no-scrollbar scroll-smooth">
                    <button onClick={() => setActiveTab('original')} className={`px-3 md:px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all whitespace-nowrap ${activeTab === 'original' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>{ui.original}</button>
                    {targetLanguages.map(lang => (
                        <button key={lang} onClick={() => setActiveTab(lang)} className={`px-3 md:px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all whitespace-nowrap ${activeTab === lang ? 'bg-razer text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>{LANGUAGE_CODE_MAP[lang] || lang}</button>
                    ))}
                    {activeTab !== 'original' && (
                        <button 
                            onClick={handleReTranslate} 
                            disabled={isRefreshing}
                            className="ml-2 px-3 py-1.5 bg-razer/20 hover:bg-razer/40 text-razer text-[10px] font-black uppercase tracking-widest rounded-full transition-all flex items-center gap-2 border border-razer/30 disabled:opacity-50"
                        >
                            {isRefreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
                            {ui.refreshTranslation}
                        </button>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 md:ml-auto w-full md:w-auto justify-between md:justify-end">
                <div className="flex items-center gap-1.5">
                    <button onClick={() => setViewMode(viewMode === 'grid' ? 'text' : 'grid')} title={viewMode === 'grid' ? ui.viewModeText : ui.viewModeGrid} className={`p-2 rounded-full transition-all ${viewMode === 'text' ? 'bg-razer text-black' : 'text-gray-400 hover:text-white bg-white/5'}`}>
                        {viewMode === 'grid' ? <FileText size={16} /> : <LayoutGrid size={16} />}
                    </button>
                    <button onClick={() => setIsSearchPanelOpen(!isSearchPanelOpen)} title={ui.search} className={`p-2 rounded-full transition-all ${isSearchPanelOpen ? 'bg-razer text-black' : 'text-gray-400 hover:text-white bg-white/5'}`}><Search size={16} /></button>
                    <button onClick={() => setIsStylePanelOpen(!isStylePanelOpen)} title={ui.subtitleStyle} className={`p-2 rounded-full transition-all ${isStylePanelOpen ? 'bg-razer text-black' : 'text-gray-400 hover:text-white bg-white/5'}`}><Palette size={16} /></button>
                    <button onClick={() => setShowTimeline(!showTimeline)} title={ui.liveEditor} className={`p-2 rounded-full transition-all ${showTimeline ? 'bg-razer text-black' : 'text-gray-400 hover:text-white bg-white/5'}`}><ListTodo size={16} /></button>
                </div>
                <div className="w-px h-6 bg-white/10 mx-0.5 hidden md:block" />
                <div className="flex items-center gap-1.5">
                    <button 
                        onClick={() => setIsPlayerCollapsed(!isPlayerCollapsed)} 
                        title={ui.togglePlayer}
                        className={`p-2 rounded-full transition-all ${isPlayerCollapsed ? 'bg-razer text-black' : 'text-gray-400 hover:text-white bg-white/5'}`}
                    >
                        <MonitorPlay size={16} />
                    </button>
                    {!isPlayerCollapsed && (
                        <div className="flex items-center bg-white/5 rounded-full p-1 border border-white/5">
                            <button onClick={() => setPlayerZoom(Math.max(0.5, playerZoom - 0.1))} className="p-1.5 text-gray-400 hover:text-white transition-all" title={ui.zoomOut}><ChevronDown size={14} /></button>
                            <span className="text-[9px] font-black text-razer w-8 text-center tabular-nums">{Math.round(playerZoom * 100)}%</span>
                            <button onClick={() => setPlayerZoom(Math.min(2, playerZoom + 0.1))} className="p-1.5 text-gray-400 hover:text-white transition-all" title={ui.zoomIn}><ChevronUp size={14} /></button>
                        </div>
                    )}
                </div>
                <div className="w-px h-6 bg-white/10 mx-0.5 hidden md:block" />
                <div className="flex items-center gap-1.5">
                    <div className="flex items-center bg-white/5 rounded-full p-1 border border-white/5">
                        <button onClick={() => {
                            setSelectedExportLangs(prev => {
                                if (prev.includes(activeTab)) return prev;
                                return [...prev, activeTab];
                            });
                            setExportModalOpen(true);
                        }} title={ui.exportSubtitles} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 text-gray-300 hover:text-white rounded-full text-[10px] font-bold uppercase tracking-wider transition-all"><Download size={14} /><span className="hidden md:inline">{ui.exportSubtitles.split(' ')[1]?.toUpperCase() || 'SUBTITLES'}</span></button>
                        
                        {onExportProject && (
                            <button onClick={onExportProject} title={ui.exportProject} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 text-gray-300 hover:text-white rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border-l border-white/5"><FileJson size={14} /><span className="hidden md:inline">{ui.exportProject.split(' ')[1]?.toUpperCase() || 'PROJECT'}</span></button>
                        )}
                    </div>

                    <button onClick={() => setVideoExportModalOpen(true)} title={ui.exportVideo} className="flex items-center gap-2 p-2 md:px-3 md:py-2 bg-razer/10 hover:bg-razer text-razer hover:text-black rounded-full text-[10px] font-black uppercase tracking-wider transition-all border border-razer/30"><Film size={14} /><span className="hidden md:inline">{ui.exportVideo}</span></button>
                </div>
            </div>
        </div>

        <div 
            ref={containerRef} 
            className={`bg-[#050505] relative flex flex-col items-center justify-center transition-all duration-500 z-10 w-full overflow-hidden ${isPlayerCollapsed ? 'h-0 opacity-0' : isVideo ? '' : 'min-h-[220px]'}`}
            style={!isPlayerCollapsed ? { height: isVideo ? `${(containerRef.current?.offsetWidth || 0) / videoMetrics.aspectRatio * playerZoom}px` : undefined, maxHeight: '70vh' } : {}}
        >
            {isVideo && mediaUrl ? (
                <video ref={actualVideoRef} src={mediaUrl} className="w-full h-full object-contain" crossOrigin="anonymous" />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/80 flex items-center justify-center p-6">
                    {onSelectMedia ? (
                        <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300">
                            <input 
                                type="file" 
                                ref={mediaInputRef} 
                                className="hidden" 
                                accept="video/*,audio/*" 
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) onSelectMedia(file);
                                }}
                            />
                            <button 
                                onClick={() => mediaInputRef.current?.click()}
                                className="px-8 py-3 bg-razer text-black rounded-full text-xs font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(68,214,44,0.3)] flex items-center gap-2"
                            >
                                <MonitorPlay size={16} />
                                {ui.selectMedia}
                            </button>
                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider text-center max-w-xs">{ui.selectMediaHelp}</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-700">
                            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-2xl">
                                <MonitorPlay size={48} className="text-gray-700" />
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            <div style={{ position: 'absolute', top: videoMetrics.top, left: videoMetrics.left, width: videoMetrics.width, height: videoMetrics.height, overflow: 'hidden', pointerEvents: 'none', zIndex: 20 }}>
                <div style={{ width: LOGICAL_WIDTH, height: logicalHeight, transform: `scale(${scaleFactor})`, transformOrigin: 'top left', position: 'relative' }}>
                    <div style={{ 
                        position: 'absolute', top: `${style.verticalPosition}%`, left: `${style.horizontalPosition}%`,
                        transform: `translate(${style.textAlign === 'left' ? '0' : style.textAlign === 'right' ? '-100%' : '-50%'}, -50%)`,
                        width: `${style.maxWidth}%`, pointerEvents: 'auto',
                    }}>
                        {activeBlock ? (
                            <div style={{ 
                                fontFamily: style.fontFamily, fontSize: `${style.fontSize}px`, color: style.textColor, fontWeight: style.fontWeight, fontStyle: style.fontStyle, textDecoration: style.textDecoration,
                                backgroundColor: style.showBackground ? `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255).toString(16).padStart(2, '0')}` : 'transparent', 
                                borderRadius: `${style.borderRadius}px`, padding: `${style.padding}px`, textAlign: style.textAlign, lineHeight: '1.4', 
                                width: 'fit-content', maxWidth: '100%', display: 'block',
                                marginLeft: style.textAlign === 'center' ? 'auto' : style.textAlign === 'right' ? 'auto' : '0',
                                marginRight: style.textAlign === 'center' ? 'auto' : style.textAlign === 'left' ? 'auto' : '0',
                                boxShadow: style.showGlow ? `0 0 ${style.glowBlur}px ${style.glowColor}${Math.round(style.glowOpacity * 255).toString(16).padStart(2, '0')}` : 'none',
                                textShadow: style.showGlow ? `0 0 ${style.glowBlur / 4}px ${style.glowColor}${Math.round(style.glowOpacity * 255).toString(16).padStart(2, '0')}` : 'none'
                            }} className="animate-in fade-in duration-75 relative">
                                {renderStyledPreview()}
                            </div>
                        ) : !isVideo && (
                            <div className="opacity-40 flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full border border-white/5 mx-auto w-max">
                                <Clock size={12} className="text-razer animate-pulse" /><span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{ui.standbySeek}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isExportingVideo && (
                <div className="absolute inset-0 z-[60] bg-black/95 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-300 p-8">
                    <div className="flex flex-col items-center text-center max-w-sm w-full">
                        <h3 className="text-xl font-black text-white uppercase tracking-widest mb-2 animate-pulse">{ui.renderingVideo}</h3>
                        <div className="w-full max-w-[200px] h-1.5 bg-white/10 rounded-full overflow-hidden mt-4 mb-4">
                            <div className="h-full bg-razer shadow-[0_0_10px_#44d62c] transition-all duration-100 ease-linear" style={{ width: `${exportProgress}%` }} />
                        </div>
                        <span className="text-4xl font-black text-white tabular-nums mb-4">{exportProgress}%</span>
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider leading-relaxed px-4">Burning subtitles with perfect audio sync... <span className="text-razer block mt-1">Please keep this tab active.</span></p>
                    </div>
                </div>
            )}
            
            {isStylePanelOpen && createPortal(<StylePanelInternal style={style} setStyle={setStyle} onClose={() => setIsStylePanelOpen(false)} ui={ui} customFonts={customFonts} onFontUpload={() => fontUploadRef.current?.click()} pos={stylePanelPos} setPos={setStylePanelPos} />, document.body)}
            <input type="file" ref={fontUploadRef} onChange={handleFontUpload} accept=".ttf,.otf,.woff,.woff2" className="hidden" />

            {isSearchPanelOpen && (
                <div className="absolute top-4 left-4 z-[40] glass-panel p-5 rounded-3xl w-[calc(100%-32px)] md:w-80 border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center mb-4"><span className="text-[10px] font-black text-razer uppercase tracking-widest flex items-center gap-2"><Search size={14} /> {ui.search} & {ui.replace}</span><button onClick={() => setIsSearchPanelOpen(false)} className="text-gray-500 hover:text-white bg-white/5 rounded-full p-1 transition-colors"><X size={14} /></button></div>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <input type="text" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentMatchIndex(0); }} placeholder={ui.searchPlaceholder} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-razer/40 transition-all shadow-inner" />
                                {searchTerm && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-500 tabular-nums">{allMatches.length > 0 ? `${currentMatchIndex + 1}/${allMatches.length}` : '0'}</span>}
                            </div>
                            <button onClick={() => setIsCaseSensitive(!isCaseSensitive)} className={`p-2.5 rounded-xl border transition-all ${isCaseSensitive ? 'bg-razer border-razer text-black' : 'bg-white/5 border-white/10 text-gray-500'}`} title="Case Sensitive"><CaseSensitive size={16} /></button>
                        </div>
                        <input type="text" value={replaceTerm} onChange={(e) => setReplaceTerm(e.target.value)} placeholder={ui.replace + "..."} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white outline-none" />
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => executeReplace(false)} disabled={allMatches.length === 0} className="py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 text-[10px] font-black uppercase rounded-xl disabled:opacity-30 transition-all">{ui.replace}</button>
                            <button onClick={() => executeReplace(true)} disabled={allMatches.length === 0} className="py-2.5 bg-razer text-black text-[10px] font-black uppercase rounded-xl shadow-glow active:scale-95 transition-all">{ui.replaceAll}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {isVideoExportModalOpen && createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
                <div className="glass-panel w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/10">
                    <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                        <h3 className="text-xs font-black uppercase text-white tracking-[0.2em]">{ui.videoFormat}</h3>
                        <button onClick={() => setVideoExportModalOpen(false)} className="text-gray-500 hover:text-white bg-white/5 p-1.5 rounded-full transition-colors"><X size={16} /></button>
                    </div>
                    <div className="p-8 space-y-4">
                        <button onClick={() => handleExportVideo('mp4')} className="w-full flex items-center gap-5 p-5 rounded-[24px] border border-white/5 bg-white/5 hover:bg-razer/10 hover:border-razer/40 transition-all text-left group">
                            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-razer group-hover:bg-razer group-hover:text-black transition-all"><MonitorPlay size={24} /></div>
                            <div className="flex-1"><p className="text-sm font-black text-white uppercase">MP4 / MOV</p><p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Chuẩn nén tối ưu Mac / iOS</p></div>
                        </button>
                        <button onClick={() => handleExportVideo('webm')} className="w-full flex items-center gap-5 p-5 rounded-[24px] border border-white/5 bg-white/5 hover:bg-razer/10 hover:border-razer/40 transition-all text-left group">
                            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-razer group-hover:bg-razer group-hover:text-black transition-all"><Film size={24} /></div>
                            <div className="flex-1"><p className="text-sm font-black text-white uppercase">WebM (VP9)</p><p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Dung lượng cực nhẹ / Web</p></div>
                        </button>
                    </div>
                </div>
            </div>, document.body
        )}
        
        {showTimeline && (
            <Timeline 
                ui={ui}
                blocks={blocks}
                currentTime={audioTime}
                duration={actualVideoRef.current?.duration || 0}
                onBlocksUpdate={(updates) => {
                    setBlocks(prev => prev.map(b => {
                        const update = updates.find(u => u.id === b.id);
                        return update ? { ...b, start: update.start, end: update.end } : b;
                    }));
                }}
                onInteractionStart={pushToHistory}
                onUndo={undo}
                canUndo={history.length > 0}
                onSplitBlock={(id, time) => {
                    pushToHistory();
                    const blockIndex = blocks.findIndex(b => b.id === id);
                    if (blockIndex === -1) return;
                    const block = blocks[blockIndex];
                    const timeStr = secondsToTime(time);
                    
                    // Split text roughly
                    const words = block.originalText.split(' ');
                    const mid = Math.max(1, Math.floor(words.length / 2));
                    const text1 = words.slice(0, mid).join(' ');
                    const text2 = words.slice(mid).join(' ');

                    const newBlock1 = { ...block, end: timeStr, originalText: text1 };
                    const newBlock2 = { 
                        ...block, 
                        id: Date.now() + Math.floor(Math.random() * 1000), 
                        start: timeStr,
                        originalText: text2 || "...",
                        translations: {} 
                    };
                    
                    const newBlocks = [...blocks];
                    newBlocks.splice(blockIndex, 1, newBlock1, newBlock2);
                    setBlocks(newBlocks);
                }}
                onSeek={(time) => {
                    if (actualVideoRef.current) actualVideoRef.current.currentTime = time;
                }}
            />
        )}

        {showCuesList && (
            <div ref={scrollContainerRef} className={`overflow-y-auto custom-scrollbar bg-black/10 flex-1 min-h-[500px] relative ${viewMode === 'grid' ? 'p-0' : 'p-8 md:p-12'}`}>
                {viewMode === 'grid' ? (
                    <table className="w-full border-collapse text-left table-fixed">
                        <thead className="sticky top-0 z-20 bg-[#111] border-b border-white/10">
                            <tr>
                                <th className="w-[100px] p-3 text-[10px] font-black text-gray-500 uppercase tracking-widest border-r border-white/5">
                                    <div className="flex items-center justify-between">
                                        <span>{ui.start}</span>
                                    </div>
                                </th>
                                <th className="w-[100px] p-3 text-[10px] font-black text-gray-500 uppercase tracking-widest border-r border-white/5">
                                    <div className="flex items-center justify-between">
                                        <span>{ui.end}</span>
                                    </div>
                                </th>
                                <th className="w-[120px] p-3 text-[10px] font-black text-gray-500 uppercase tracking-widest border-r border-white/5">
                                    <div className="flex items-center justify-between">
                                        <span>{ui.speaker}</span>
                                        <button onClick={() => handleCopyColumn('speaker')} className="hover:text-razer transition-colors"><Copy size={10} /></button>
                                    </div>
                                </th>
                                <th className="p-3 text-[10px] font-black text-gray-500 uppercase tracking-widest border-r border-white/5">
                                    <div className="flex items-center justify-between">
                                        <span>{ui.original}</span>
                                        <button onClick={() => handleCopyColumn('original')} className="hover:text-razer transition-colors"><Copy size={10} /></button>
                                    </div>
                                </th>
                                {activeTab !== 'original' && (
                                    <th className="p-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                        <div className="flex items-center justify-between">
                                            <span>{ui.translation}</span>
                                            <button onClick={() => handleCopyColumn('translation')} className="hover:text-razer transition-colors"><Copy size={10} /></button>
                                        </div>
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {blocks.map((block) => {
                                const isActive = activeBlock?.id === block.id;
                                const focusedMatch = allMatches[currentMatchIndex];
                                const isFocusedBySearch = focusedMatch?.blockId === block.id;
                                const translationText = block.translations[activeTab as Language] || '';
                                
                                return (
                                    <tr 
                                        key={block.id} 
                                        id={`cue-${block.id}`} 
                                        ref={isActive ? activeCueRef : null}
                                        className={`group border-b border-white/5 transition-all ${isActive ? 'bg-razer/5' : 'hover:bg-white/[0.02]'} ${isFocusedBySearch ? 'ring-1 ring-inset ring-razer' : ''}`}
                                    >
                                        <td className="p-2 border-r border-white/5 align-top">
                                            <input 
                                                type="text" 
                                                value={block.start} 
                                                onChange={(e) => handleTimeChange(block.id, 'start', e.target.value)} 
                                                className={`w-full bg-transparent border-none outline-none text-[10px] font-mono px-1 py-1 rounded focus:bg-white/5 transition-all ${isActive ? 'text-razer font-bold' : 'text-gray-500'}`}
                                            />
                                        </td>
                                        <td className="p-2 border-r border-white/5 align-top">
                                            <input 
                                                type="text" 
                                                value={block.end} 
                                                onChange={(e) => handleTimeChange(block.id, 'end', e.target.value)} 
                                                className={`w-full bg-transparent border-none outline-none text-[10px] font-mono px-1 py-1 rounded focus:bg-white/5 transition-all ${isActive ? 'text-razer font-bold' : 'text-gray-500'}`}
                                            />
                                        </td>
                                        <td className="p-2 border-r border-white/5 align-top">
                                            <input 
                                                type="text" 
                                                value={block.speaker || ''} 
                                                onChange={(e) => handleSpeakerChange(block.id, e.target.value)} 
                                                className="w-full bg-transparent border-none outline-none text-[10px] font-bold uppercase text-gray-400 focus:text-white transition-colors"
                                                placeholder="Speaker"
                                            />
                                        </td>
                                        <td className="p-2 border-r border-white/5 align-top">
                                            <EditableText 
                                                value={block.originalText} 
                                                onChange={(newVal) => handleOriginalChange(block.id, newVal)}
                                                onPaste={(e) => handlePaste(e, block.id, 'original')}
                                                className={`w-full text-xs leading-relaxed outline-none ${isActive ? 'text-white' : 'text-gray-400'}`}
                                                searchTerm={activeTab === 'original' ? searchTerm : ''}
                                                isCaseSensitive={isCaseSensitive}
                                                isFocusedBlock={activeTab === 'original' && isFocusedBySearch}
                                                currentOccurrenceInBlock={activeTab === 'original' && isFocusedBySearch ? focusedMatch.occurrenceIndex : null}
                                            />
                                        </td>
                                        {activeTab !== 'original' && (
                                            <td className="p-2 align-top">
                                                <EditableText 
                                                    value={translationText} 
                                                    onChange={(newVal) => handleTranslationChange(block.id, activeTab as Language, newVal)}
                                                    onPaste={(e) => handlePaste(e, block.id, 'translation')}
                                                    className={`w-full text-xs leading-relaxed outline-none text-razer font-medium`}
                                                    searchTerm={activeTab !== 'original' ? searchTerm : ''}
                                                    isCaseSensitive={isCaseSensitive}
                                                    isFocusedBlock={activeTab !== 'original' && isFocusedBySearch}
                                                    currentOccurrenceInBlock={activeTab !== 'original' && isFocusedBySearch ? focusedMatch.occurrenceIndex : null}
                                                />
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="max-w-4xl mx-auto bg-white/5 p-8 md:p-16 rounded-[40px] border border-white/5 shadow-2xl leading-relaxed text-base md:text-lg text-gray-300 min-h-full space-y-10">
                        {groupedBlocks.map((group, gIdx) => (
                            <div key={gIdx} className="space-y-4">
                                <div className="flex items-center gap-3 opacity-50">
                                    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10"></div>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-razer flex items-center gap-2">
                                        <User size={12} /> {group.speaker}
                                    </span>
                                    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10"></div>
                                </div>
                                <div className="pl-0 md:pl-4">
                                    {group.blocks.map((block) => {
                                        const isActive = activeBlock?.id === block.id;
                                        const focusedMatch = allMatches[currentMatchIndex];
                                        const isFocusedBySearch = focusedMatch?.blockId === block.id;
                                        const blockText = activeTab === 'original' ? block.originalText : (block.translations[activeTab as Language] || '');
                                        
                                        return (
                                            <span 
                                                key={block.id} 
                                                id={`cue-${block.id}`}
                                                className={`relative group/text-item transition-all duration-300 rounded px-1 -mx-1 ${isActive ? 'bg-razer/10 text-white font-bold ring-1 ring-razer/30' : 'hover:bg-white/5'} ${isFocusedBySearch ? 'ring-2 ring-razer bg-razer/5' : ''}`}
                                            >
                                                <EditableText 
                                                    value={blockText} 
                                                    onChange={(newVal) => { if (activeTab === 'original') handleOriginalChange(block.id, newVal); else handleTranslationChange(block.id, activeTab as Language, newVal); }} 
                                                    className="inline outline-none focus:text-razer transition-colors"
                                                    style={{ display: 'inline', width: 'auto' }}
                                                    disabled={!!mobileEdit}
                                                    searchTerm={searchTerm}
                                                    isCaseSensitive={isCaseSensitive}
                                                    isFocusedBlock={isFocusedBySearch}
                                                    currentOccurrenceInBlock={isFocusedBySearch ? focusedMatch.occurrenceIndex : null}
                                                />
                                                <span className="inline-block w-2"> </span>
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {isExportModalOpen && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
                <div className="glass-panel w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/10">
                    <div className="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
                        <h3 className="text-sm font-black uppercase text-white tracking-[0.2em]">{ui.exportTitle}</h3>
                        <button onClick={() => setExportModalOpen(false)} className="text-gray-500 hover:text-white bg-white/5 p-2 rounded-full transition-colors"><X size={18} /></button>
                    </div>
                    <div className="p-8 space-y-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">{ui.config}</label>
                            <div className="grid grid-cols-4 gap-2">
                                {(['srt', 'ass', 'csv', 'doc'] as const).map(fmt => (
                                    <button key={fmt} onClick={() => setExportFormat(fmt)} className={`flex flex-col items-center gap-2 px-1 py-4 rounded-2xl border transition-all ${exportFormat === fmt ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/5 text-gray-500'}`}>
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${exportFormat === fmt ? 'border-razer' : 'border-gray-600'}`}>{exportFormat === fmt && <div className="w-2 h-2 bg-razer rounded-full" />}</div>
                                        <p className="text-[10px] font-black uppercase tracking-widest">{fmt}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3 animate-in slide-in-from-top-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">{exportFormat === 'csv' ? (uiLang === 'vn' ? 'Chọn các ngôn ngữ muốn đưa vào cột' : ui.targetLang) : ui.targetLang}</label>
                            <div className="grid grid-cols-2 gap-3 max-h-[250px] overflow-y-auto no-scrollbar">
                                <button onClick={() => setSelectedExportLangs(prev => prev.includes('original') ? (prev.length > 1 ? prev.filter(l => l !== 'original') : prev) : [...prev, 'original'])} className={`flex items-center justify-between px-5 py-3 border rounded-[20px] transition-all ${selectedExportLangs.includes('original') ? 'bg-razer/10 border-razer text-white shadow-glow' : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10'}`}>
                                    <span className="text-xs font-black uppercase tracking-widest">{ui.original}</span>
                                    {selectedExportLangs.includes('original') && <div className="w-2 h-2 bg-razer rounded-full" />}
                                </button>
                                {targetLanguages.map(lang => (
                                    <button key={lang} onClick={() => setSelectedExportLangs(prev => selectedExportLangs.includes(lang) ? (prev.length > 1 ? prev.filter(l => l !== lang) : prev) : [...prev, lang])} className={`flex items-center justify-between px-5 py-3 border rounded-[20px] transition-all ${selectedExportLangs.includes(lang) ? 'bg-razer/10 border-razer text-white shadow-glow' : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10'}`}>
                                        <span className="text-xs font-black uppercase tracking-widest">{LANGUAGE_CODE_MAP[lang] || lang}</span>
                                        {selectedExportLangs.includes(lang) && <div className="w-2 h-2 bg-razer rounded-full" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="p-8 pt-0">
                        <button onClick={handleExportFinal} disabled={selectedExportLangs.length === 0} className="w-full py-5 bg-razer text-black font-black text-xs uppercase tracking-[0.2em] rounded-[24px] shadow-glow hover:bg-razer-glow transition-all disabled:opacity-30">
                            {exportFormat === 'csv' ? `${ui.downloadFiles} (1 File CSV)` : 
                             exportFormat === 'doc' ? `${ui.downloadFiles} (1 File DOC)` :
                             `${ui.downloadFiles} (${selectedExportLangs.length} Files)`}
                        </button>
                    </div>
                </div>
            </div>, document.body
        )}
    </div>
  );
};

export default SubtitleEditor;

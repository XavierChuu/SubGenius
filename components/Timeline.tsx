
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { SubtitleBlock } from '../types';
import { timeToSeconds, secondsToTime } from '../utils/timeUtils';
import { GripVertical, Undo2, Check, MousePointer2, Scissors, ArrowLeftRight } from 'lucide-react';

type TimelineTool = 'select' | 'split' | 'trim';

interface TimelineProps {
    blocks: SubtitleBlock[];
    currentTime: number;
    duration: number;
    onBlocksUpdate: (updates: { id: number; start: string; end: string }[]) => void;
    onSplitBlock: (id: number, time: number) => void;
    onSeek: (time: number) => void;
    onUndo?: () => void;
    canUndo?: boolean;
    onInteractionStart?: () => void;
    onInteractionEnd?: () => void;
    ui: any;
}

const PIXELS_PER_SECOND = 100;

const Timeline: React.FC<TimelineProps> = ({ blocks, currentTime, duration, onBlocksUpdate, onSplitBlock, onSeek, onUndo, canUndo, onInteractionStart, onInteractionEnd, ui }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeTool, setActiveTool] = useState<TimelineTool>('select');
    const [isDragging, setIsDragging] = useState(false);
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [isEditingTime, setIsEditingTime] = useState(false);
    const [timeInput, setTimeInput] = useState('');
    const [dragState, setDragState] = useState<{
        id: number;
        type: 'move' | 'start' | 'end' | 'dual';
        initialX: number;
        initialStart: number;
        initialEnd: number;
        neighborId?: number;
        neighborInitialStart?: number;
        neighborInitialEnd?: number;
    } | null>(null);

    const sortedBlocks = useMemo(() => [...blocks].sort((a, b) => timeToSeconds(a.start) - timeToSeconds(b.start)), [blocks]);

    const handleMouseDown = (e: React.MouseEvent, block: SubtitleBlock, type: 'move' | 'start' | 'end') => {
        e.stopPropagation();
        
        if (activeTool === 'split') {
            const time = hoverTime !== null ? hoverTime : (timeToSeconds(block.start) + (e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left) / PIXELS_PER_SECOND);
            onSplitBlock(block.id, time);
            return;
        }

        if (onInteractionStart) onInteractionStart();

        const isShift = e.shiftKey || activeTool === 'trim';
        const blockIndex = sortedBlocks.findIndex(b => b.id === block.id);
        
        if (isShift && (type === 'start' || type === 'end')) {
            if (type === 'start' && blockIndex > 0) {
                const prev = sortedBlocks[blockIndex - 1];
                if (Math.abs(timeToSeconds(prev.end) - timeToSeconds(block.start)) < 0.2) {
                    setIsDragging(true);
                    setDragState({
                        id: block.id,
                        type: 'dual',
                        initialX: e.clientX,
                        initialStart: timeToSeconds(block.start),
                        initialEnd: timeToSeconds(block.end),
                        neighborId: prev.id,
                        neighborInitialStart: timeToSeconds(prev.start),
                        neighborInitialEnd: timeToSeconds(prev.end),
                    });
                    return;
                }
            } else if (type === 'end' && blockIndex < sortedBlocks.length - 1) {
                const next = sortedBlocks[blockIndex + 1];
                if (Math.abs(timeToSeconds(next.start) - timeToSeconds(block.end)) < 0.2) {
                    setIsDragging(true);
                    setDragState({
                        id: block.id,
                        type: 'dual',
                        initialX: e.clientX,
                        initialStart: timeToSeconds(block.start),
                        initialEnd: timeToSeconds(block.end),
                        neighborId: next.id,
                        neighborInitialStart: timeToSeconds(next.start),
                        neighborInitialEnd: timeToSeconds(next.end),
                    });
                    return;
                }
            }
        }

        setIsDragging(true);
        setDragState({
            id: block.id,
            type,
            initialX: e.clientX,
            initialStart: timeToSeconds(block.start),
            initialEnd: timeToSeconds(block.end),
        });
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !dragState) return;

            const deltaX = e.clientX - dragState.initialX;
            const deltaTime = deltaX / PIXELS_PER_SECOND;

            const blockIndex = sortedBlocks.findIndex(b => b.id === dragState.id);
            const prevBlock = blockIndex > 0 ? sortedBlocks[blockIndex - 1] : null;
            const nextBlock = blockIndex < sortedBlocks.length - 1 ? sortedBlocks[blockIndex + 1] : null;

            const prevLimit = prevBlock ? timeToSeconds(prevBlock.end) : 0;
            const nextLimit = nextBlock ? timeToSeconds(nextBlock.start) : duration;

            if (dragState.type === 'dual' && dragState.neighborId !== undefined) {
                let newBoundary = dragState.initialStart + deltaTime;
                if (dragState.neighborInitialEnd === dragState.initialStart) {
                    // Dragging boundary between prev and current
                    const limitMin = dragState.neighborInitialStart + 0.1;
                    const limitMax = dragState.initialEnd - 0.1;
                    newBoundary = Math.max(limitMin, Math.min(newBoundary, limitMax));
                    
                    onBlocksUpdate([
                        { id: dragState.neighborId, start: secondsToTime(dragState.neighborInitialStart!), end: secondsToTime(newBoundary) },
                        { id: dragState.id, start: secondsToTime(newBoundary), end: secondsToTime(dragState.initialEnd) }
                    ]);
                } else {
                    // Dragging boundary between current and next
                    newBoundary = dragState.initialEnd + deltaTime;
                    const limitMin = dragState.initialStart + 0.1;
                    const limitMax = dragState.neighborInitialEnd! - 0.1;
                    newBoundary = Math.max(limitMin, Math.min(newBoundary, limitMax));

                    onBlocksUpdate([
                        { id: dragState.id, start: secondsToTime(dragState.initialStart), end: secondsToTime(newBoundary) },
                        { id: dragState.neighborId, start: secondsToTime(newBoundary), end: secondsToTime(dragState.neighborInitialEnd!) }
                    ]);
                }
                return;
            }

            let newStart = dragState.initialStart;
            let newEnd = dragState.initialEnd;

            if (dragState.type === 'move') {
                newStart += deltaTime;
                newEnd += deltaTime;
                
                // Constraints
                if (newStart < prevLimit) {
                    newEnd += (prevLimit - newStart);
                    newStart = prevLimit;
                }
                if (newEnd > nextLimit) {
                    newStart -= (newEnd - nextLimit);
                    newEnd = nextLimit;
                }
            } else if (dragState.type === 'start') {
                newStart += deltaTime;
                if (newStart < prevLimit) newStart = prevLimit;
                if (newStart >= newEnd - 0.1) newStart = newEnd - 0.1;
            } else if (dragState.type === 'end') {
                newEnd += deltaTime;
                if (newEnd > nextLimit) newEnd = nextLimit;
                if (newEnd <= newStart + 0.1) newEnd = newStart + 0.1;
            }

            // Global bounds
            if (newStart < 0) {
                if (dragState.type === 'move') newEnd -= newStart;
                newStart = 0;
            }
            if (newEnd > duration) {
                if (dragState.type === 'move') newStart -= (newEnd - duration);
                newEnd = duration;
            }

            onBlocksUpdate([{ id: dragState.id, start: secondsToTime(newStart), end: secondsToTime(newEnd) }]);
        };

        const handleMouseUp = () => {
            if (isDragging && onInteractionEnd) onInteractionEnd();
            setIsDragging(false);
            setDragState(null);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragState, duration, onBlocksUpdate, sortedBlocks]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            const key = e.key.toLowerCase();
            if (key === 'v') {
                setActiveTool('select');
            } else if (key === 'c') {
                // If already in split tool, perform split at current time
                if (activeTool === 'split') {
                    const blockAtTime = blocks.find(b => {
                        const s = timeToSeconds(b.start);
                        const e = timeToSeconds(b.end);
                        return currentTime >= s && currentTime <= e;
                    });
                    if (blockAtTime) onSplitBlock(blockAtTime.id, currentTime);
                } else {
                    setActiveTool('split');
                }
            } else if (key === 't') {
                setActiveTool('trim');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [blocks, currentTime, onSplitBlock, activeTool]);

    const handleTimelineClick = (e: React.MouseEvent) => {
        if (isDragging) return;
        
        const time = hoverTime !== null ? hoverTime : 0;
        
        if (activeTool === 'split') {
            // Find block at this time
            const blockAtTime = blocks.find(b => {
                const s = timeToSeconds(b.start);
                const e = timeToSeconds(b.end);
                return time >= s && time <= e;
            });
            if (blockAtTime) {
                onSplitBlock(blockAtTime.id, time);
                return;
            }
        }
        
        onSeek(Math.max(0, Math.min(time, duration)));
    };

    const handleContainerMouseMove = (e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
            const x = e.clientX - rect.left + (containerRef.current?.scrollLeft || 0);
            let time = x / PIXELS_PER_SECOND;
            
            // Snapping to playhead (0.1s threshold)
            if (Math.abs(time - currentTime) < 0.1) {
                time = currentTime;
            }
            
            setHoverTime(time);
        }
    };

    // Auto-scroll to current time
    useEffect(() => {
        if (containerRef.current && !isDragging) {
            const scrollPos = currentTime * PIXELS_PER_SECOND - containerRef.current.offsetWidth / 2;
            containerRef.current.scrollTo({ left: scrollPos, behavior: 'smooth' });
        }
    }, [currentTime, isDragging]);

    return (
        <div className="w-full bg-[#0a0a0a] border-y border-white/5 select-none overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-1 border-b border-white/5 bg-black/40">
                <div className="flex items-center gap-4">
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{ui.liveEditor}</span>
                    
                    <div className="flex items-center bg-white/5 rounded-md p-0.5 border border-white/10">
                        <button 
                            onClick={() => setActiveTool('select')}
                            className={`p-1 rounded transition-all ${activeTool === 'select' ? 'bg-razer text-black' : 'text-gray-400 hover:text-white'}`}
                            title={`${ui.selectTool} (V)`}
                        >
                            <MousePointer2 size={12} />
                        </button>
                        <button 
                            onClick={() => setActiveTool('split')}
                            className={`p-1 rounded transition-all ${activeTool === 'split' ? 'bg-razer text-black' : 'text-gray-400 hover:text-white'}`}
                            title={`${ui.splitTool} (C)`}
                        >
                            <Scissors size={12} />
                        </button>
                        <button 
                            onClick={() => setActiveTool('trim')}
                            className={`p-1 rounded transition-all ${activeTool === 'trim' ? 'bg-razer text-black' : 'text-gray-400 hover:text-white'}`}
                            title={`${ui.trimTool} (T)`}
                        >
                            <ArrowLeftRight size={12} />
                        </button>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    {onUndo && (
                        <button 
                            onClick={onUndo}
                            disabled={!canUndo}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase transition-all ${canUndo ? 'text-razer hover:bg-razer/10' : 'text-gray-600 cursor-not-allowed opacity-50'}`}
                            title={`${ui.undo} (Ctrl+Z)`}
                        >
                            <Undo2 size={10} />
                            <span>{ui.undo}</span>
                        </button>
                    )}

                    <div className="flex items-center gap-2">
                        {isEditingTime ? (
                        <div className="flex items-center gap-1 bg-white/5 rounded-md px-1 border border-white/10">
                            <input 
                                autoFocus
                                type="text"
                                value={timeInput}
                                onChange={(e) => setTimeInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const seconds = timeToSeconds(timeInput);
                                        if (!isNaN(seconds)) onSeek(seconds);
                                        setIsEditingTime(false);
                                    } else if (e.key === 'Escape') {
                                        setIsEditingTime(false);
                                    }
                                }}
                                onBlur={() => setIsEditingTime(false)}
                                className="bg-transparent text-[9px] font-mono text-razer w-20 outline-none py-0.5"
                                placeholder="00:00:00,000"
                            />
                            <button onClick={() => {
                                const seconds = timeToSeconds(timeInput);
                                if (!isNaN(seconds)) onSeek(seconds);
                                setIsEditingTime(false);
                            }} className="text-razer hover:text-white"><Check size={10} /></button>
                        </div>
                    ) : (
                        <button 
                            onClick={() => {
                                setTimeInput(secondsToTime(currentTime));
                                setIsEditingTime(true);
                            }}
                            className="text-[9px] font-mono text-razer hover:bg-white/5 px-2 py-0.5 rounded transition-all cursor-text"
                            title={ui.timecodeJump}
                        >
                            {secondsToTime(currentTime)} / {secondsToTime(duration)}
                        </button>
                    )}
                    </div>
                </div>
            </div>
            
            <div 
                ref={containerRef}
                className={`relative h-24 overflow-x-auto custom-scrollbar ${
                    activeTool === 'split' ? 'cursor-crosshair' : 
                    activeTool === 'trim' ? 'cursor-col-resize' : 
                    'cursor-text'
                }`}
                onClick={handleTimelineClick}
                onMouseMove={handleContainerMouseMove}
                onMouseLeave={() => setHoverTime(null)}
            >
                <div 
                    style={{ width: duration * PIXELS_PER_SECOND, height: '100%', position: 'relative' }}
                    className="bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px)] bg-[size:100px_100%]"
                >
                    {/* Time markers */}
                    {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                        i % 5 === 0 && (
                            <div 
                                key={i} 
                                className="absolute top-0 bottom-0 border-l border-white/10 pointer-events-none"
                                style={{ left: i * PIXELS_PER_SECOND }}
                            >
                                <span className="text-[8px] text-gray-600 ml-1 mt-1 block">{secondsToTime(i).split(',')[0]}</span>
                            </div>
                        )
                    ))}

                    {/* Subtitle Blocks */}
                    {blocks.map((block) => {
                        const start = timeToSeconds(block.start);
                        const end = timeToSeconds(block.end);
                        const width = (end - start) * PIXELS_PER_SECOND;
                        const left = start * PIXELS_PER_SECOND;

                        return (
                            <div
                                key={block.id}
                                className={`absolute top-8 h-10 bg-razer/20 border border-razer/40 rounded-md group hover:bg-razer/30 transition-colors flex items-center overflow-hidden ${
                                    activeTool === 'split' ? 'cursor-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M20 4v16\'/%3E%3Cpath d=\'M4 4v16\'/%3E%3Crect x=\'4\' y=\'8\' width=\'16\' height=\'8\' rx=\'2\'/%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'1\'/%3E%3C/svg%3E"),_pointer]' : 'cursor-move'
                                }`}
                                style={{ left, width, zIndex: dragState?.id === block.id ? 50 : 10 }}
                                onMouseDown={(e) => handleMouseDown(e, block, 'move')}
                            >
                                {/* Left handle */}
                                <div 
                                    className="absolute left-0 top-0 bottom-0 w-2 bg-razer/40 hover:bg-razer cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onMouseDown={(e) => handleMouseDown(e, block, 'start')}
                                />
                                
                                <div className="px-2 truncate w-full">
                                    <p className="text-[9px] font-bold text-razer uppercase truncate">{block.speaker || 'Speaker'}</p>
                                    <p className="text-[10px] text-white truncate leading-tight">{block.originalText}</p>
                                </div>

                                {/* Right handle */}
                                <div 
                                    className="absolute right-0 top-0 bottom-0 w-2 bg-razer/40 hover:bg-razer cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onMouseDown={(e) => handleMouseDown(e, block, 'end')}
                                />
                            </div>
                        );
                    })}

                    {/* Playhead */}
                    <div 
                        className="absolute top-0 bottom-0 w-px bg-red-500 z-40 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                        style={{ left: currentTime * PIXELS_PER_SECOND }}
                    >
                        <div className="w-3 h-3 bg-red-500 rounded-full -ml-1.5 -mt-1.5 shadow-lg border-2 border-white/20" />
                    </div>

                    {/* Split Preview Line */}
                    {activeTool === 'split' && hoverTime !== null && (
                        <div 
                            className="absolute top-0 bottom-0 w-px bg-white/50 z-30 pointer-events-none border-l border-dashed border-white/30"
                            style={{ left: hoverTime * PIXELS_PER_SECOND }}
                        >
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-white text-[8px] text-black px-1 rounded-sm font-bold">
                                {ui.splitTool.toUpperCase()}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Timeline;


import React, { useState } from 'react';
import { X, Folder, Trash2, Clock, Music, Edit2, AlertCircle, Check, Save } from 'lucide-react';
import { SavedProject } from '../types';

interface ProjectPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projects: SavedProject[];
  onLoadProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  activeProjectId: string | null;
  ui: any;
}

const ProjectPanel: React.FC<ProjectPanelProps> = ({ isOpen, onClose, projects, onLoadProject, onDeleteProject, onRenameProject, activeProjectId, ui }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation(); 
    action();
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deleteConfirmId === id) {
        // Confirmed
        onDeleteProject(id);
        setDeleteConfirmId(null);
    } else {
        // First click - Ask for confirmation
        setDeleteConfirmId(id);
        // Auto reset after 3 seconds if not confirmed
        setTimeout(() => {
            setDeleteConfirmId(prev => prev === id ? null : prev);
        }, 3000);
    }
  };

  const startEditing = (project: SavedProject) => {
    setEditingId(project.id);
    setEditName(project.name);
    setDeleteConfirmId(null); // Reset delete state if editing
  };

  const saveEdit = () => {
    if (editingId && editName.trim() !== "") {
        onRenameProject(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };

  return (
    <>
      {/* Backdrop - Z-index 55 to be above AudioPlayer (50) */}
      <div 
          className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[55] transition-opacity duration-500 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={onClose}
      />

      {/* Slide-over Panel - Z-index 60 */}
      <div className={`fixed top-4 bottom-4 right-4 w-80 md:w-96 glass-panel rounded-3xl shadow-2xl z-[60] transform transition-transform duration-500 cubic-bezier(0.32, 0.72, 0, 1) flex flex-col overflow-hidden ${isOpen ? 'translate-x-0' : 'translate-x-[110%]'}`}>
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center shrink-0">
            <h2 className="text-lg font-bold text-white flex items-center gap-3">
                <Folder className="text-razer" size={20} />
                {ui.history}
            </h2>
            <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-gray-500 hover:text-white transition-colors hover:bg-white/10">
                <X size={18} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center mt-20 text-gray-500 gap-4 opacity-50">
                    <AlertCircle size={48} strokeWidth={1} />
                    <span className="text-xs font-bold uppercase tracking-widest">{ui.noProjects}</span>
                </div>
            ) : (
                projects.map((p) => {
                    const isActive = p.id === activeProjectId;
                    const isEditing = editingId === p.id;
                    const isConfirmingDelete = deleteConfirmId === p.id;

                    return (
                        <div 
                            key={p.id}
                            className={`flex flex-col rounded-2xl transition-all overflow-hidden border group
                                ${isActive 
                                    ? 'bg-razer/10 border-razer/40 shadow-[0_0_20px_rgba(68,214,44,0.1)]' 
                                    : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}
                            `}
                        >
                            {/* Card Body */}
                            <div 
                                onClick={() => !isEditing && onLoadProject(p.id)}
                                className="p-5 cursor-pointer flex-1"
                            >
                                <div className="flex justify-between items-start mb-3 min-h-[24px]">
                                    {isEditing ? (
                                        <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onBlur={saveEdit}
                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                autoFocus
                                                className="w-full bg-black/40 border border-razer/50 rounded-md px-2 py-1 text-sm font-bold text-white outline-none focus:ring-1 focus:ring-razer"
                                            />
                                            <button onClick={saveEdit} className="p-1 text-razer hover:bg-razer/20 rounded-md">
                                                <Check size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <h4 className={`font-bold text-sm leading-snug break-words line-clamp-2 ${isActive ? 'text-white' : 'text-gray-200 group-hover:text-white'}`}>
                                                {p.name}
                                            </h4>
                                            {isActive && (
                                                <div className="w-2 h-2 bg-razer rounded-full shadow-[0_0_8px_#44d62c] animate-pulse shrink-0 ml-2 mt-1.5" />
                                            )}
                                        </>
                                    )}
                                </div>
                                
                                <div className="flex items-center gap-3 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                    <span className="flex items-center gap-1.5">
                                        <Clock size={12} className={isActive ? 'text-razer' : ''} />
                                        {new Date(p.date).toLocaleDateString()}
                                    </span>
                                    {p.fileData ? (
                                        <span className="flex items-center gap-1.5 text-razer/80">
                                            <Music size={12} />
                                            AUDIO
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5 text-gray-600">
                                            <Music size={12} />
                                            Text Only
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions Bar (Apple Style Separator) */}
                            <div className="flex items-center border-t border-white/5 bg-black/20 backdrop-blur-md rounded-b-2xl overflow-hidden">
                                <button 
                                    type="button"
                                    onClick={(e) => handleAction(e, () => startEditing(p))}
                                    className="flex-1 py-3.5 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                                >
                                    <Edit2 size={12} />
                                    {ui.rename}
                                </button>
                                <div className="w-px h-full bg-white/5"></div>
                                <button 
                                    type="button"
                                    onClick={(e) => handleDeleteClick(e, p.id)}
                                    className={`flex-1 py-3.5 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all
                                        ${isConfirmingDelete 
                                            ? 'bg-red-500 text-white hover:bg-red-600' 
                                            : 'text-gray-500 hover:text-red-400 hover:bg-red-500/10'}
                                    `}
                                >
                                    {isConfirmingDelete ? <Check size={12} /> : <Trash2 size={12} />}
                                    {isConfirmingDelete ? "CONFIRM?" : ui.delete}
                                </button>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
      </div>
    </>
  );
};

export default ProjectPanel;

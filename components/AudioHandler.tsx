
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Mic, Square, FileAudio } from 'lucide-react';

interface AudioHandlerProps {
  onAudioReady: (file: File | Blob) => void;
  status: string;
  ui: any; 
  currentFileName?: string | null;
}

const AudioHandler: React.FC<AudioHandlerProps> = ({ onAudioReady, status, ui, currentFileName }) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      onAudioReady(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onAudioReady(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const disabled = status === 'processing';

  return (
    <div className="w-full max-w-2xl mx-auto mb-6 px-4">
      <div className="grid grid-cols-2 gap-4">
        {/* File Upload Area */}
        <div 
          className={`relative rounded-3xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer group h-36 md:h-44 border
            ${currentFileName && !isRecording 
              ? 'border-razer/50 bg-razer/5 shadow-[0_0_30px_rgba(68,214,44,0.1)]' 
              : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02]'}
          `}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="audio/*,video/*" 
            className="hidden" 
            disabled={disabled}
          />
          
          {currentFileName && !isRecording ? (
            <>
              <div className="p-3 bg-razer/20 rounded-full mb-3 shadow-glow">
                 <FileAudio className="w-6 h-6 text-razer" />
              </div>
              <p className="text-xs font-bold text-white tracking-wide text-center truncate w-full px-2">{currentFileName}</p>
              <p className="text-[10px] text-razer mt-1 uppercase font-black text-center">{ui.replace}</p>
            </>
          ) : (
            <>
              <div className="p-3 bg-white/5 rounded-full mb-3 group-hover:bg-razer/20 transition-colors border border-white/5 group-hover:border-razer/30">
                 <Upload className="w-6 h-6 text-razer group-hover:text-razer-glow" />
              </div>
              <p className="text-xs font-bold text-gray-300 group-hover:text-white uppercase tracking-wider text-center">{ui.uploadTitle}</p>
              <p className="text-[10px] text-gray-500 mt-1 hidden sm:block text-center">{ui.uploadDesc}</p>
            </>
          )}
        </div>

        {/* Microphone Area */}
        <div 
          className={`relative rounded-3xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer group h-36 md:h-44 border
            ${isRecording 
              ? 'border-red-500/50 bg-red-500/10 animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.2)]' 
              : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02]'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onClick={() => {
             if (disabled) return;
             isRecording ? stopRecording() : startRecording();
          }}
        >
          {isRecording ? (
            <>
              <div className="p-3 bg-red-500/20 rounded-full mb-3">
                <Square className="w-6 h-6 text-red-500" fill="currentColor" />
              </div>
              <p className="text-xs font-bold text-red-400 uppercase tracking-wider text-center">{ui.stopRec}</p>
              <p className="text-[10px] text-red-500/50 mt-1 text-center font-mono">{ui.recording}</p>
            </>
          ) : (
            <>
              <div className="p-3 bg-white/5 rounded-full mb-3 group-hover:bg-razer/20 transition-colors border border-white/5 group-hover:border-razer/30">
                <Mic className="w-6 h-6 text-razer group-hover:text-razer-glow" />
              </div>
              <p className="text-xs font-bold text-gray-300 group-hover:text-white uppercase tracking-wider text-center">{ui.recTitle}</p>
              <p className="text-[10px] text-gray-500 mt-1 hidden sm:block text-center">{ui.recDesc}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioHandler;

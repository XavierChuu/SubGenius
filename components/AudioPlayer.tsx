
import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { timeToSeconds } from '../utils/timeUtils';

interface AudioPlayerProps {
  audioUrl: string | null;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  ui: any;
  externalMediaRef?: React.RefObject<HTMLMediaElement | null>;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, currentTime, onTimeUpdate, ui, externalMediaRef }) => {
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Use external ref if available (e.g., from a video element), otherwise use local audio ref
  const activeMediaRef = externalMediaRef || localAudioRef;

  useEffect(() => {
    const media = activeMediaRef.current;
    if (media) {
        if (Math.abs(media.currentTime - currentTime) > 0.5) {
            media.currentTime = currentTime;
        }
    }
  }, [currentTime, activeMediaRef]);

  const togglePlay = () => {
    const media = activeMediaRef.current;
    if (!media) return;
    if (isPlaying) {
      media.pause();
    } else {
      media.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!audioUrl) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[92%] max-w-xl glass-panel rounded-full px-5 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.5)] z-50 flex items-center gap-5 animate-in slide-in-from-bottom-20 duration-500 border-white/10">
      {/* Only render local audio if no external media is controlling playback */}
      {!externalMediaRef && (
        <audio
          ref={localAudioRef}
          src={audioUrl}
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}
      
      {/* If using external media, we still need to sync its events to update our UI state */}
      {externalMediaRef && externalMediaRef.current && (
          <MediaStateSynchronizer 
            media={externalMediaRef.current} 
            onTimeUpdate={onTimeUpdate}
            onDurationUpdate={setDuration}
            onPlayStateChange={setIsPlaying}
          />
      )}

      <button 
        onClick={togglePlay}
        className="w-12 h-12 flex items-center justify-center rounded-full bg-razer text-black hover:bg-razer-glow transition-all shadow-glow shrink-0 active:scale-90"
      >
        {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-1" />}
      </button>

      <div className="flex-1 flex flex-col justify-center gap-1">
          <div className="flex justify-between items-center px-1">
             <span className="text-[10px] font-bold text-razer font-mono">{formatTime(currentTime)}</span>
             <span className="text-[10px] font-bold text-gray-500 font-mono">{formatTime(duration)}</span>
          </div>
          <div className="group relative flex items-center h-4 cursor-pointer">
             <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={(e) => {
                    const val = Number(e.target.value);
                    if(activeMediaRef.current) activeMediaRef.current.currentTime = val;
                    onTimeUpdate(val);
                }}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-razer focus:outline-none hover:h-2 transition-all"
             />
          </div>
      </div>

      <button onClick={() => {
          if (activeMediaRef.current) activeMediaRef.current.muted = !isMuted;
          setIsMuted(!isMuted);
      }} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-95">
          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
    </div>
  );
};

// Internal component to handle event listeners on external media elements
const MediaStateSynchronizer: React.FC<{
    media: HTMLMediaElement, 
    onTimeUpdate: (t: number) => void,
    onDurationUpdate: (d: number) => void,
    onPlayStateChange: (p: boolean) => void
}> = ({ media, onTimeUpdate, onDurationUpdate, onPlayStateChange }) => {
    useEffect(() => {
        const timeUpdate = () => onTimeUpdate(media.currentTime);
        const durationChange = () => onDurationUpdate(media.duration);
        const play = () => onPlayStateChange(true);
        const pause = () => onPlayStateChange(false);
        const end = () => onPlayStateChange(false);

        media.addEventListener('timeupdate', timeUpdate);
        media.addEventListener('durationchange', durationChange);
        media.addEventListener('play', play);
        media.addEventListener('pause', pause);
        media.addEventListener('ended', end);

        // Init values
        onDurationUpdate(media.duration || 0);
        onPlayStateChange(!media.paused);

        return () => {
            media.removeEventListener('timeupdate', timeUpdate);
            media.removeEventListener('durationchange', durationChange);
            media.removeEventListener('play', play);
            media.removeEventListener('pause', pause);
            media.removeEventListener('ended', end);
        };
    }, [media, onTimeUpdate, onDurationUpdate, onPlayStateChange]);

    return null;
};

export default AudioPlayer;

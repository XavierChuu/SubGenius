
export const timeToSeconds = (timeString: string): number => {
  if (!timeString) return 0;
  
  // Hỗ trợ cả định dạng HH:MM:SS,mmm (chuẩn SRT) và HH:MM:SS:mmm
  const parts = timeString.replace(',', ':').split(':');
  
  if (parts.length < 3) return 0;
  
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseInt(parts[2], 10) || 0;
  const ms = parseInt(parts[3], 10) || 0;
  
  // Xử lý mili giây (đảm bảo ms luôn có 3 chữ số nếu được cung cấp)
  let msVal = ms;
  if (parts[3] && parts[3].length === 2) msVal = ms * 10; // Nếu là frames (2 số) -> xấp xỉ ms
  
  return hours * 3600 + minutes * 60 + seconds + (msVal / 1000);
};

export const secondsToTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  const hh = h.toString().padStart(2, '0');
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  const mmm = ms.toString().padStart(3, '0');
  
  return `${hh}:${mm}:${ss},${mmm}`;
};

export const msToTimeCode = (totalMs: number): string => {
  const seconds = Math.floor(totalMs / 1000);
  const ms = Math.floor(totalMs % 1000);
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const hh = h.toString().padStart(2, '0');
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  const mmm = ms.toString().padStart(3, '0');
  
  return `${hh}:${mm}:${ss},${mmm}`;
};

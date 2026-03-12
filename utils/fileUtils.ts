
import { SubtitleCue, SavedProject, GenerationConfig, SubtitleBlock, SubtitleStyle, Language } from "../types";

// Helper to convert hex to ASS color format (&HAABBGGRR)
const hexToASSColor = (hex: string, opacity: number = 1): string => {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  const alpha = Math.round((1 - opacity) * 255).toString(16).padStart(2, '0').toUpperCase();
  // ASS uses ABGR format
  return `&H${alpha}${b}${g}${r}`;
};

export const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

export const downloadSRT = (cues: SubtitleCue[], filename: string, style?: SubtitleStyle) => {
  const BOM = '\uFEFF';
  let content = '';
  cues.forEach(cue => {
    let text = cue.text;
    if (style) {
      if (style.textColor && style.textColor !== '#ffffff') {
          text = `<font color="${style.textColor}">${text}</font>`;
      }
    }
    content += `${cue.id}\n${cue.start} --> ${cue.end}\n${text}\n\n`;
  });

  const blob = new Blob([BOM + content], { type: 'text/srt;charset=utf-8;' });
  triggerDownload(blob, `${filename}.srt`);
};

export const downloadASS = (blocks: SubtitleBlock[], filename: string, style: SubtitleStyle) => {
  const playResX = 1280;
  const playResY = 720;
  
  const fontName = style.fontFamily.split(',')[0].replace(/"/g, '');
  const fontSize = Math.round(style.fontSize * (playResY / 720)); // Normalized to 720p base
  
  const primaryColor = hexToASSColor(style.textColor);
  const backColor = hexToASSColor(style.backgroundColor, style.showBackground ? style.backgroundOpacity : 0);
  const outlineColor = hexToASSColor(style.backgroundColor, 0.8);

  const bold = style.fontWeight === 'bold' ? -1 : 0;
  const italic = style.fontStyle === 'italic' ? -1 : 0;
  const underline = style.textDecoration === 'underline' ? -1 : 0;

  let alignment = 2; // Default center
  if (style.textAlign === 'left') alignment = 1;
  if (style.textAlign === 'right') alignment = 3;

  const header = `[Script Info]
Title: SubGenius AI Export
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: ${playResX}
PlayResY: ${playResY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},${bold},${italic},${underline},0,100,100,0,0,1,${style.showBackground ? 2 : 1},1,${alignment},10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let events = '';
  blocks.forEach(block => {
    const formatTime = (t: string) => t.replace(',', '.').slice(0, -1);
    const start = formatTime(block.start);
    const end = formatTime(block.end);
    
    const posX = Math.round((style.horizontalPosition / 100) * playResX);
    const posY = Math.round((style.verticalPosition / 100) * playResY);
    const posTag = `{\\pos(${posX},${posY})}`;
    
    let text = block.originalText;
    events += `Dialogue: 0,${start},${end},Default,,0,0,0,,${posTag}${text}\n`;
  });

  const blob = new Blob(['\uFEFF' + header + events], { type: 'text/x-ass;charset=utf-8;' });
  triggerDownload(blob, `${filename}.ass`);
};

export const downloadCSV = (blocks: SubtitleBlock[], filename: string, selectedLangs?: string[]) => {
  const BOM = '\uFEFF';
  const langArray = selectedLangs ? selectedLangs.filter(l => l !== 'original') : [];
  
  let csv = 'ID,Speaker,Start,End,Original';
  langArray.forEach(lang => {
    csv += `,${lang}`;
  });
  csv += '\n';

  blocks.forEach(block => {
    const speaker = block.speaker ? `"${block.speaker.replace(/"/g, '""')}"` : '""';
    const original = `"${block.originalText.replace(/"/g, '""')}"`;
    let row = `${block.id},${speaker},${block.start},${block.end},${original}`;
    
    langArray.forEach(lang => {
        const transText = block.translations[lang as Language] || '';
        row += `,"${transText.replace(/"/g, '""')}"`;
    });
    csv += row + '\n';
  });

  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filename}.csv`);
};

export const downloadDOC = (blocks: SubtitleBlock[], filename: string, activeTab: string) => {
  const groupedBlocks: { speaker: string; blocks: SubtitleBlock[] }[] = [];
  let currentGroup: { speaker: string; blocks: SubtitleBlock[] } | null = null;

  blocks.forEach(block => {
    const speaker = block.speaker || 'Speaker';
    if (!currentGroup || currentGroup.speaker !== speaker) {
      currentGroup = { speaker, blocks: [block] };
      groupedBlocks.push(currentGroup);
    } else {
      currentGroup.blocks.push(block);
    }
  });

  let html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>Subtitle Export</title>
    <style>
      body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; padding: 40px; }
      .speaker-header { color: #44d62c; font-weight: bold; text-transform: uppercase; font-size: 12px; border-bottom: 1px solid #eee; margin-top: 30px; margin-bottom: 10px; padding-bottom: 5px; }
      .content { margin-bottom: 20px; }
      .timestamp { color: #999; font-size: 10px; margin-right: 10px; }
    </style>
    </head>
    <body>
      <h1>Subtitle Export - ${filename}</h1>
      <p>Language: ${activeTab}</p>
  `;

  groupedBlocks.forEach(group => {
    html += `<div class="speaker-header">${group.speaker}</div>`;
    html += `<div class="content">`;
    group.blocks.forEach(block => {
      const text = activeTab === 'original' ? block.originalText : (block.translations[activeTab as Language] || '');
      html += `<span>${text}</span> `;
    });
    html += `</div>`;
  });

  html += `</body></html>`;

  const blob = new Blob([html], { type: 'application/msword' });
  triggerDownload(blob, `${filename}.doc`);
};

export const saveProjectFile = (project: SavedProject) => {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const safeName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  triggerDownload(blob, `${safeName}_project.json`);
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const loadProjectFile = (file: File): Promise<SavedProject> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const project = JSON.parse(text) as SavedProject;
        if (!project || typeof project !== 'object' || !Array.isArray(project.subtitles)) {
           throw new Error("Invalid project file");
        }
        resolve(project);
      } catch (err: any) {
        reject(new Error(err.message || "Failed to parse project JSON"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};

export const parseSRTString = (srtContent: string): { start: string; end: string; text: string }[] => {
    const normalized = srtContent.replace(/\r\n/g, '\n');
    const blocks = normalized.split(/\n\n+/);
    const results = [];
    for (const block of blocks) {
        const lines = block.split('\n');
        if (lines.length >= 3) {
            const timeLine = lines[1];
            const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,:]\d{2,3}) --> (\d{2}:\d{2}:\d{2}[,:]\d{2,3})/);
            if (timeMatch) {
                const text = lines.slice(2).join(' ').trim();
                results.push({
                    start: timeMatch[1],
                    end: timeMatch[2],
                    text: text
                });
            }
        }
    }
    return results;
};

export const parseASSString = (assContent: string): { start: string; end: string; text: string }[] => {
    const lines = assContent.split(/\r?\n/);
    const results: { start: string; end: string; text: string }[] = [];
    for (const line of lines) {
        if (line.startsWith('Dialogue:')) {
            const parts = line.split(',');
            if (parts.length >= 10) {
                const start = parts[1].trim().replace('.', ',');
                const end = parts[2].trim().replace('.', ',');
                // Join the rest as text, but clean up ASS tags like {\pos...}
                let text = parts.slice(9).join(',').replace(/\{[^}]+\}/g, '').trim();
                results.push({ start: `0${start}`, end: `0${end}`, text });
            }
        }
    }
    return results;
};

export const parseCSVString = (csvContent: string): SubtitleBlock[] => {
    const lines = csvContent.split(/\r?\n/);
    if (lines.length < 2) return [];
    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => h.trim());
    const idxStart = headers.indexOf('Start');
    const idxEnd = headers.indexOf('End');
    const idxOriginal = headers.indexOf('Original');
    const idxSpeaker = headers.indexOf('Speaker');

    if (idxStart === -1 || idxEnd === -1 || idxOriginal === -1) {
        throw new Error("Invalid CSV Format.");
    }

    const blocks: SubtitleBlock[] = [];
    const csvSplitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const columns = line.split(csvSplitRegex).map(col => {
            let val = col.trim();
            if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
            return val.replace(/""/g, '"');
        });
        if (columns.length < 3) continue;
        const translations: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            if (!['ID', 'Start', 'End', 'Original', 'Speaker'].includes(header)) {
                 if (columns[j]) translations[header as any] = columns[j];
            }
        }
        blocks.push({
            id: i,
            start: columns[idxStart],
            end: columns[idxEnd],
            originalText: columns[idxOriginal],
            speaker: idxSpeaker !== -1 ? columns[idxSpeaker] : undefined,
            translations: translations
        });
    }
    return blocks;
};

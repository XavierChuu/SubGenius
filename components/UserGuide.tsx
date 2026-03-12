
import React from 'react';
import { X, BookOpen, Mic, FileAudio, Languages, Download, Printer, History, ShieldCheck, Table } from 'lucide-react';

interface UserGuideProps {
  isOpen: boolean;
  onClose: () => void;
  ui: any;
}

const UserGuide: React.FC<UserGuideProps> = ({ isOpen, onClose, ui }) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const g = ui.guide;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 md:p-8 animate-in fade-in duration-300">
      <div className="glass-panel w-full max-w-4xl h-full max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden relative print:bg-white print:text-black print:border-none print:max-h-none print:static">
        
        <button 
          onClick={onClose} 
          className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors z-[110] p-2 bg-white/5 rounded-full hover:bg-white/10 print:hidden"
        >
            <X size={20} />
        </button>

        <div className="flex items-center justify-between p-6 border-b border-white/5 pr-16 print:hidden">
          <div className="flex items-center gap-3">
            <BookOpen className="text-razer" size={20} />
            <h2 className="text-base font-bold text-white uppercase tracking-wider">{g.title}</h2>
          </div>
          <button 
              onClick={handlePrint}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-full text-[10px] font-black tracking-widest transition-all uppercase"
          >
              <Printer size={14} />
              {ui.printBtn}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 custom-scrollbar print:overflow-visible print:p-0">
          
          <div className="hidden print:block text-center mb-6">
            <h1 className="text-3xl font-black mb-1">{ui.appTitle.toUpperCase()}</h1>
            <p className="text-base italic text-gray-600">{g.tagline}</p>
            <p className="mt-3 text-[10px] font-bold">{g.version}</p>
          </div>

          <section className="space-y-3">
            <h3 className="text-razer text-xs font-black uppercase tracking-[0.2em] border-b border-razer/20 pb-2 print:text-black print:border-black">{g.c1.title}</h3>
            <p className="text-gray-300 text-sm leading-relaxed print:text-black">{g.c1.desc}</p>
          </section>

          <section className="space-y-4">
            <h3 className="text-razer text-xs font-black uppercase tracking-[0.2em] border-b border-razer/20 pb-2 print:text-black print:border-black">{g.c2.title}</h3>
            <div className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 print:bg-white print:border-gray-200">
                <ShieldCheck className="text-razer shrink-0" size={20} />
                <div>
                    <h4 className="text-xs font-bold text-white mb-1 print:text-black uppercase tracking-wider">{g.c2.subtitle}</h4>
                    <p className="text-xs text-gray-400 print:text-black leading-relaxed">{g.c2.desc}</p>
                </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-razer text-xs font-black uppercase tracking-[0.2em] border-b border-razer/20 pb-2 print:text-black print:border-black">{g.c3.title}</h3>
            <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 print:bg-white print:border-gray-200">
                    <FileAudio className="text-razer mb-2" size={20} />
                    <h4 className="text-xs font-black text-white mb-1 print:text-black uppercase tracking-wider">{g.c3.uploadTitle}</h4>
                    <p className="text-xs text-gray-400 print:text-black">{g.c3.uploadDesc}</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 print:bg-white print:border-gray-200">
                    <Mic className="text-razer mb-2" size={20} />
                    <h4 className="text-xs font-black text-white mb-1 print:text-black uppercase tracking-wider">{g.c3.recTitle}</h4>
                    <p className="text-xs text-gray-400 print:text-black">{g.c3.recDesc}</p>
                </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-razer text-xs font-black uppercase tracking-[0.2em] border-b border-razer/20 pb-2 print:text-black print:border-black">{g.c4.title}</h3>
            <div className="flex items-start gap-3">
                <Languages className="text-razer shrink-0" size={20} />
                <p className="text-sm text-gray-300 leading-relaxed print:text-black">{g.c4.desc}</p>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-razer text-xs font-black uppercase tracking-[0.2em] border-b border-razer/20 pb-2 print:text-black print:border-black">{g.c5.title}</h3>
            <div className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 print:bg-white print:border-gray-200">
                <History className="text-razer shrink-0" size={20} />
                <div>
                    <h4 className="text-xs font-bold text-white mb-1 print:text-black uppercase tracking-wider">{g.c5.subtitle}</h4>
                    <p className="text-xs text-gray-400 print:text-black leading-relaxed">{g.c5.desc}</p>
                </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-razer text-xs font-black uppercase tracking-[0.2em] border-b border-razer/20 pb-2 print:text-black print:border-black">{g.c6.title}</h3>
            <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1 p-3 bg-white/5 rounded-xl">
                    <h4 className="text-xs font-black text-white flex items-center gap-2 print:text-black uppercase"><Download size={14} className="text-razer"/> {g.c6.srtTitle}</h4>
                    <p className="text-[10px] text-gray-400 print:text-black">{g.c6.srtDesc}</p>
                </div>
                <div className="space-y-1 p-3 bg-white/5 rounded-xl">
                    <h4 className="text-xs font-black text-white flex items-center gap-2 print:text-black uppercase"><Table size={14} className="text-razer"/> {g.c6.csvTitle}</h4>
                    <p className="text-[10px] text-gray-400 print:text-black">{g.c6.csvDesc}</p>
                </div>
            </div>
          </section>

          <section className="space-y-2 pb-6">
            <h3 className="text-razer text-xs font-black uppercase tracking-[0.2em] border-b border-razer/20 pb-2 print:text-black print:border-black">{g.c7.title}</h3>
            <p className="text-xs text-gray-400 print:text-black leading-relaxed">{g.c7.desc}</p>
          </section>
        </div>

        <div className="p-4 border-t border-white/5 bg-black/40 text-center print:hidden backdrop-blur-md">
            <p className="text-[9px] text-gray-500 font-bold tracking-widest uppercase">© 2025 SubGenius AI Technologies. All Rights Reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default UserGuide;

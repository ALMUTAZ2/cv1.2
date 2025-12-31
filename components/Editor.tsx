
import React, { useState, useRef, useEffect } from 'react';
import { ResumeSection } from '../types';
import { 
  ArrowLeft, 
  Download, 
  Sparkles, 
  Zap, 
  Loader2, 
  FileText, 
  FileDown, 
  Bold, 
  List, 
  Eye, 
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { ExportService } from '../services/exportService';
import { GeminiService } from '../services/geminiService';

interface EditorProps {
  sections: ResumeSection[];
  onBack: () => void;
}

const RichEditor: React.FC<{ 
  value: string; 
  onSave: (val: string) => void;
  readOnly?: boolean;
}> = ({ value, onSave, readOnly }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  // Sync editor content only if it's different and not currently being edited
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onSave(editorRef.current.innerHTML);
    }
  };

  const applyStyle = (e: React.MouseEvent, cmd: string) => {
    e.preventDefault(); // Critical: prevents button from stealing focus
    document.execCommand(cmd, false);
    handleInput();
    if (editorRef.current) editorRef.current.focus();
  };

  return (
    <div className="flex flex-col gap-4 group/editor">
      {!readOnly && (
        <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-2xl w-fit shadow-sm transition-opacity group-hover/editor:opacity-100">
          <button 
            onMouseDown={(e) => applyStyle(e, 'bold')}
            className="p-3 hover:bg-white rounded-xl text-slate-700 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center gap-2"
          >
            <Bold size={16} /> <span className="text-[10px] font-black uppercase">Bold</span>
          </button>
          <div className="w-[1px] bg-slate-200 self-stretch" />
          <button 
            onMouseDown={(e) => applyStyle(e, 'insertUnorderedList')}
            className="p-3 hover:bg-white rounded-xl text-slate-700 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center gap-2"
          >
            <List size={16} /> <span className="text-[10px] font-black uppercase">List</span>
          </button>
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        onInput={handleInput}
        className={`min-h-[200px] p-10 rounded-[2.5rem] bg-white border-2 transition-all outline-none font-serif text-lg leading-relaxed shadow-inner ${readOnly ? 'border-transparent bg-slate-50/50 cursor-not-allowed text-slate-400 opacity-60' : 'border-slate-100 focus:border-indigo-400 focus:bg-white text-slate-800'}`}
        style={{ direction: 'ltr' }}
      />
    </div>
  );
};

export const Editor: React.FC<EditorProps> = ({ sections, onBack }) => {
  const [currentSections, setCurrentSections] = useState<ResumeSection[]>(sections);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [peekingIds, setPeekingIds] = useState<Set<string>>(new Set());

  const handleUpdateSection = (id: string, newContent: string) => {
    setCurrentSections(prev => prev.map(s => s.id === id ? { ...s, content: newContent } : s));
  };

  const handleGlobalImprove = async (mode: 'professional' | 'atsOptimized') => {
    const confirmMsg = "سيقوم الذكاء الاصطناعي بإعادة كتابة كافة أقسام السيرة الذاتية الآن. هل تود الاستمرار؟";
    if (!window.confirm(confirmMsg)) return;

    setGlobalLoading(true);
    const gemini = new GeminiService();
    
    try {
      // Improved parallel processing with error handling per section
      const improved = await Promise.all(currentSections.map(async (section) => {
        try {
          const result = await gemini.improveSection(section.title, section.content);
          return { 
            ...section, 
            content: result[mode],
            originalContent: section.originalContent || section.content 
          };
        } catch (err) {
          console.warn(`Section ${section.title} failed to improve, keeping original.`);
          return section;
        }
      }));
      
      setCurrentSections(improved);
    } catch (err) {
      alert("حدث خطأ في محرك الذكاء الاصطناعي. يرجى المحاولة مرة أخرى.");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'docx' | 'txt') => {
    if (format === 'pdf') await ExportService.generatePdf(currentSections);
    else if (format === 'txt') ExportService.generateTxt(currentSections);
    else await ExportService.generateDocx(currentSections);
    setShowExportMenu(false);
  };

  const togglePeek = (id: string) => {
    setPeekingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-40 animate-in fade-in duration-700">
      {/* Universal Control Header - The single source of truth for AI updates */}
      <div className="sticky top-20 z-50 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-[2.5rem] shadow-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-500 transition-all"><ArrowLeft size={20} /></button>
          <div className="h-8 w-[1px] bg-slate-200 hidden md:block" />
          <div className="flex gap-2">
            <button 
              disabled={globalLoading}
              onClick={() => handleGlobalImprove('professional')}
              className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg active:scale-95 group"
            >
              {globalLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="group-hover:animate-bounce" />} 
              Professional Boost (All)
            </button>
            <button 
              disabled={globalLoading}
              onClick={() => handleGlobalImprove('atsOptimized')}
              className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg active:scale-95"
            >
              {globalLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} className="fill-current" />} 
              ATS Optimized (All)
            </button>
          </div>
        </div>

        <div className="relative">
          <button 
            onClick={() => setShowExportMenu(!showExportMenu)} 
            className="px-10 py-3 bg-emerald-600 text-white rounded-2xl font-black text-sm hover:bg-emerald-700 transition-all shadow-xl flex items-center gap-2 active:scale-95"
          >
            <Download size={18} /> Export Results
          </button>
          {showExportMenu && (
            <div className="absolute right-0 mt-3 w-64 bg-white rounded-3xl shadow-2xl border border-slate-100 p-2 z-50 animate-in fade-in zoom-in-95">
              <button onClick={() => handleExport('pdf')} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 rounded-2xl transition-colors text-left group">
                <FileDown size={18} className="text-rose-500" />
                <span className="text-sm font-black text-slate-800">Adobe PDF Document</span>
              </button>
              <button onClick={() => handleExport('docx')} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 rounded-2xl transition-colors text-left group">
                <FileText size={18} className="text-blue-500" />
                <span className="text-sm font-black text-slate-800">Microsoft Word (.docx)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {globalLoading && (
        <div className="flex flex-col items-center justify-center p-24 text-center animate-pulse">
          <div className="relative mb-6">
             <Loader2 size={64} className="text-indigo-600 animate-spin" />
             <RefreshCw size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">إعادة بناء السيرة الذاتية بالكامل...</h3>
          <p className="text-slate-500 mt-2 font-medium">نقوم الآن بتطبيق معايير الذكاء الاصطناعي على كافة الأقسام دفعة واحدة لضمان وحدة اللغة.</p>
        </div>
      )}

      {/* Editor Surface */}
      {!globalLoading && (
        <div className="space-y-24">
          {currentSections.map((section) => {
            const isPeeking = peekingIds.has(section.id);
            return (
              <div key={section.id} className="relative group">
                <div className="absolute -top-5 left-10 z-10 flex items-center gap-2">
                  <div className="bg-slate-900 text-white px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl border border-slate-700">
                    {section.title}
                  </div>
                  {section.originalContent && (
                    <button 
                      onClick={() => togglePeek(section.id)}
                      className={`p-2.5 rounded-2xl border transition-all shadow-lg ${isPeeking ? 'bg-amber-500 border-amber-600 text-white' : 'bg-white border-slate-200 text-slate-400 hover:text-indigo-600'}`}
                      title="Compare with Original"
                    >
                      <Eye size={16} />
                    </button>
                  )}
                </div>

                <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 p-1.5 transition-all group-hover:shadow-2xl group-hover:border-indigo-100">
                  <div className="p-10 md:p-14 pt-16">
                    <RichEditor 
                      value={isPeeking && section.originalContent ? section.originalContent : section.content}
                      readOnly={isPeeking}
                      onSave={(newVal) => handleUpdateSection(section.id, newVal)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!globalLoading && (
        <div className="text-center pt-10">
          <div className="inline-flex items-center gap-4 p-8 bg-indigo-50 border border-indigo-100 rounded-[2.5rem] shadow-sm">
            <CheckCircle2 className="text-indigo-600" size={32} />
            <div className="text-left">
              <p className="text-sm font-black text-slate-800 uppercase tracking-tight">المستند جاهز للمراجعة</p>
              <p className="text-xs font-medium text-slate-600 mt-1">يمكنك التعديل يدوياً أو استخدام أزرار التحسين في الأعلى لتغيير النمط بالكامل.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

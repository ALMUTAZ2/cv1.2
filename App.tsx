
import React, { useState, useEffect, useCallback } from 'react';
import { FileUploader } from './components/FileUploader';
import { Dashboard } from './components/Dashboard';
import { Editor } from './components/Editor';
import { JobMatchModal } from './components/JobMatchModal';
import { AppStep, AnalysisResult, ResumeSection } from './types';
import { GeminiService } from './services/geminiService';
import { DocumentService } from './services/documentService';
import { Cpu, Github, Sparkles, Key, AlertTriangle, ShieldCheck, RefreshCcw } from 'lucide-react';

const STORAGE_KEYS = {
  STEP: 'ats_app_step',
  RESUME_TEXT: 'ats_resume_text',
  ANALYSIS: 'ats_analysis',
  SECTIONS: 'ats_sections'
};

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.STEP);
      return (saved as AppStep) || AppStep.UPLOAD;
    } catch {
      return AppStep.UPLOAD;
    }
  });
  
  const [resumeText, setResumeText] = useState(() => localStorage.getItem(STORAGE_KEYS.RESUME_TEXT) || '');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ANALYSIS);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [sections, setSections] = useState<ResumeSection[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SECTIONS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [showMatchModal, setShowMatchModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiKeySelected, setApiKeySelected] = useState<boolean | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STEP, step);
    localStorage.setItem(STORAGE_KEYS.RESUME_TEXT, resumeText);
    if (analysis) localStorage.setItem(STORAGE_KEYS.ANALYSIS, JSON.stringify(analysis));
    if (sections.length > 0) localStorage.setItem(STORAGE_KEYS.SECTIONS, JSON.stringify(sections));
  }, [step, resumeText, analysis, sections]);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setApiKeySelected(hasKey);
      } else {
        setApiKeySelected(true);
      }
    };
    checkApiKey();
  }, []);

  const handleOpenKeySelector = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setApiKeySelected(true);
    }
  };

  const handleReset = useCallback(() => {
    // 1. Clear all localStorage
    localStorage.removeItem(STORAGE_KEYS.STEP);
    localStorage.removeItem(STORAGE_KEYS.RESUME_TEXT);
    localStorage.removeItem(STORAGE_KEYS.ANALYSIS);
    localStorage.removeItem(STORAGE_KEYS.SECTIONS);
    
    // 2. Reset all states to initial values
    setAnalysis(null);
    setSections([]);
    setResumeText('');
    setStep(AppStep.UPLOAD);
    setShowMatchModal(false);
    setLoading(false);
    
    // 3. Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleUpload = async (file: File) => {
    setLoading(true);
    try {
      const text = await DocumentService.extractText(file);
      setResumeText(text);
      
      const gemini = new GeminiService();
      const result = await gemini.analyzeResume(text);
      
      setAnalysis(result);
      setSections(result.structuredSections);
      setStep(AppStep.DASHBOARD);
    } catch (err: any) {
      console.error("Critical Upload/Analyze error:", err);
      alert('حدث خطأ أثناء فحص السيرة الذاتية. يرجى التأكد من اتصالك ومفتاح الـ API.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTailoring = (tailoredSections: ResumeSection[]) => {
    setSections(tailoredSections);
    setStep(AppStep.EDITOR);
  };

  if (apiKeySelected === false) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white rounded-[3rem] p-12 shadow-2xl">
          <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center text-indigo-600 mx-auto mb-8">
            <Key size={40} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Access Restricted</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">يتطلب النظام مفتاح API نشطاً للقيام بعمليات التحليل المتقدمة.</p>
          <button onClick={handleOpenKeySelector} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black hover:bg-indigo-700 transition-all shadow-xl active:scale-95">Select API Key</button>
        </div>
      </div>
    );
  }

  const isAtStart = step === AppStep.UPLOAD;

  return (
    <div className="min-h-screen flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      <nav className="border-b bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={handleReset}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform">
              <ShieldCheck size={22} />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-900 uppercase">Prophet<span className="text-indigo-600">V4.5</span></span>
          </div>
          <div className="flex items-center gap-4">
            {!isAtStart && (
              <button 
                onClick={handleReset} 
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-black text-rose-500 bg-rose-50/50 hover:bg-rose-50 rounded-xl transition-all border border-rose-100 active:scale-95"
              >
                <RefreshCcw size={16} /> New Analysis
              </button>
            )}
            <button onClick={handleOpenKeySelector} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors rounded-lg" title="Change API Key"><Key size={18} /></button>
            <a href="https://github.com" target="_blank" className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all text-slate-600"><Github size={18} /></a>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto px-6 w-full py-10">
        {loading ? (
          <div className="h-[70vh] flex flex-col items-center justify-center text-center animate-in fade-in duration-500">
            <div className="relative mb-8">
              <div className="w-24 h-24 border-4 border-slate-100 rounded-full animate-pulse"></div>
              <div className="w-24 h-24 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
              <Cpu className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={32} />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">جاري تشغيل محرك التحليل...</h2>
            <p className="text-slate-500 max-w-sm mx-auto leading-relaxed font-mono text-xs opacity-60">Scanning structure for ATS patterns...</p>
          </div>
        ) : (
          <>
            {step === AppStep.UPLOAD && (
              <div className="space-y-12 animate-in fade-in zoom-in-95 duration-700">
                <div className="text-center max-w-2xl mx-auto pt-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-black uppercase mb-6 border border-indigo-100">
                    <Cpu size={12} /> Forensic Intelligence Kernel V4.5
                  </div>
                  <h1 className="text-6xl font-black text-slate-900 mb-6 leading-[1.1] tracking-tight">تخطَّ حواجز الـ <span className="text-indigo-600">Bots</span></h1>
                  <p className="text-xl text-slate-500 leading-relaxed font-medium">يحلل نظام PROPHET سيرتك الذاتية بنفس المنطق الرياضي الذي تستخدمه أنظمة الفرز العالمية.</p>
                </div>
                <FileUploader onUpload={handleUpload} />
              </div>
            )}
            {step === AppStep.DASHBOARD && analysis && (
              <Dashboard result={analysis} onEdit={() => setStep(AppStep.EDITOR)} onOpenMatch={() => setShowMatchModal(true)} onNewScan={handleReset} />
            )}
            {step === AppStep.EDITOR && (
              <Editor sections={sections} onBack={() => setStep(AppStep.DASHBOARD)} />
            )}
          </>
        )}
      </main>

      {showMatchModal && (
        <JobMatchModal resumeText={resumeText} sections={sections} onClose={() => setShowMatchModal(false)} onApplyTailoring={handleApplyTailoring} />
      )}
    </div>
  );
};

export default App;

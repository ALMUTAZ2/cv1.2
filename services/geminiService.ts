import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent } from "../types";

export class GeminiService {
  // ---------------------------------------------------------------------------
  // 1. حساب نقاط ATS (منطق برمجي)
  // ---------------------------------------------------------------------------
  private calculateATSScore(data: any): number {
    let earnedPoints = 25; 
    const sectionsFound = data.structuredSections?.map((s: any) => s.title.toLowerCase()) || [];
    
    // فحص الأقسام الأساسية
    if (sectionsFound.some((s: string) => s.includes('experience') || s.includes('work'))) earnedPoints += 20;
    if (sectionsFound.some((s: string) => s.includes('skills') || s.includes('technologies'))) earnedPoints += 15;
    if (sectionsFound.some((s: string) => s.includes('summary') || s.includes('profile'))) earnedPoints += 10;
    
    // فحص المهارات
    const skillsCount = data.hardSkillsFound?.length || 0;
    earnedPoints += Math.min(skillsCount * 2, 20);

    // فحص جودة النقاط (Metrics)
    const totalBullets = data.metrics?.totalBulletPoints || 0;
    const bulletsWithMetrics = data.metrics?.bulletsWithMetrics || 0;
    if (totalBullets > 0) {
      // نزيد النقاط إذا كانت النقاط تحتوي على أرقام ونتائج
      earnedPoints += Math.min((bulletsWithMetrics / totalBullets) * 20, 20);
    }

    // خصم نقاط للأخطاء
    const penaltyPoints = (data.criticalErrors?.length || 0) * 5;
    
    return Math.max(10, Math.min(100, Math.round(earnedPoints - penaltyPoints)));
  }

  // ---------------------------------------------------------------------------
  // 2. تحليل السيرة الذاتية (تقسيم واستخراج بيانات)
  // ---------------------------------------------------------------------------
  async analyzeResume(text: string): Promise<AnalysisResult> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `
    ROLE: Professional ATS Auditor & Parser.
    TASK: 
    1. Break down the resume into its natural sections (Summary, Experience, Education, Skills, Projects).
    2. Identify Hard Skills (Tools, Tech, Standards) vs Soft Skills.
    3. Detect formatting issues and critical errors (e.g. missing contact info).
    4. Count metrics (how many bullet points have numbers/percentages?).
    OUTPUT: Strict JSON only. Keep 'content' concise but preserve meaning.
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-lite', // نستخدم موديل مستقر وسريع
        contents: systemInstruction + `\n\nINPUT RESUME TEXT:\n${text}`,
        config: {
          temperature: 0.1, // حرارة منخفضة للدقة في التحليل
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedRole: { type: Type.STRING },
              hardSkillsFound: { type: Type.ARRAY, items: { type: Type.STRING } },
              missingHardSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              metrics: {
                type: Type.OBJECT,
                properties: {
                  totalBulletPoints: { type: Type.NUMBER },
                  bulletsWithMetrics: { type: Type.NUMBER },
                  weakVerbsCount: { type: Type.NUMBER },
                  sectionCount: { type: Type.NUMBER }
                },
                required: ["totalBulletPoints", "bulletsWithMetrics", "weakVerbsCount", "sectionCount"]
              },
              formattingIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
              criticalErrors: { type: Type.ARRAY, items: { type: Type.STRING } },
              summaryFeedback: { type: Type.STRING },
              structuredSections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    content: { type: Type.STRING },
                    originalContent: { type: Type.STRING }
                  },
                  required: ["id", "title", "content", "originalContent"]
                }
              }
            },
            required: ["detectedRole", "hardSkillsFound", "metrics", "structuredSections"]
          }
        }
      });

      // معالجة الرد (قد تحتاج لتعديل حسب إصدار الـ SDK لديك، هنا نفترض أن text() موجودة أو الخاصية text)
      const responseText = response.text ? response.text : (response as any).response?.text(); 
      const rawData = JSON.parse(responseText || "{}");
      
      return { ...rawData, overallScore: this.calculateATSScore(rawData) };
    } catch (error: any) {
      console.error("Gemini Analysis Error:", error);
      throw new Error("Analysis failed. Text might be too complex or API limit reached.");
    }
  }

  // ---------------------------------------------------------------------------
  // 3. تحسين الأقسام (المنطق المطور - Smart Rewrite)
  // ---------------------------------------------------------------------------
  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // تحديد نوع القسم لتطبيق القواعد الخاصة
    const lowerTitle = title.toLowerCase();
    const isSummary = lowerTitle.includes('summary') || lowerTitle.includes('profile') || lowerTitle.includes('about');
    const isExperience = lowerTitle.includes('experience') || lowerTitle.includes('work') || lowerTitle.includes('history') || lowerTitle.includes('employment');

    // بناء القواعد بناءً على القسم
    let specificRules = "";

    if (isSummary) {
      specificRules = `
      **RULES FOR SUMMARY REWRITE:**
      1. **The Hook:** Start strictly with: "[Certification/Adjective] [Current Job Title] with [X]+ years of experience in [Industry]."
      2. **Anti-Fluff:** DELETE subjective phrases like "Passionate about", "Looking for", "Hardworking". Replace with concrete hard skills.
      3. **Structure:** Write a concise paragraph (3-4 sentences max). Do NOT use bullet points.
      4. **Keywords:** Keep technical keywords (e.g. PMP, Python, SEC) intact.`;
    } else if (isExperience) {
      specificRules = `
      **RULES FOR EXPERIENCE REWRITE:**
      1. **XYZ Formula:** Apply Google's formula: "Accomplished [X] as measured by [Y], by doing [Z]".
      2. **Action Verbs:** Start EVERY bullet with a strong past-tense verb (e.g., Engineered, Spearheaded, Optimized, Reduced).
      3. **Quantify:** Focus on impact. Add numbers/percentages if implied in context (e.g., "reduced time" -> "reduced time by 20%").
      4. **Formatting:** Return as an HTML list (<ul><li>...</li></ul>). Bold <b> key metrics/results inside the <li>.`;
    } else {
      specificRules = `
      **RULES FOR GENERAL SECTIONS:**
      1. Convert to a clean, professional format.
      2. Fix grammar and clarity.
      3. Use <ul><li> for lists if applicable.`;
    }

    const prompt = `
    You are an elite ATS Resume Strategist.
    
    TASK: Rewrite the provided "${title}" section based on the strict rules below.
    
    INPUT CONTENT:
    "${content}"

    ${specificRules}

    OUTPUT INSTRUCTIONS:
    - Return JSON.
    - "professional": A standard, formal business rewrite.
    - "atsOptimized": The high-impact rewrite strictly following the RULES above (This is the priority).
    - Use HTML tags (<b>, <ul>, <li>) for formatting.
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-lite', 
        contents: prompt,
        config: {
          temperature: 0.3, // تقليل الحرارة لضمان الالتزام بالقواعد الصارمة
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              professional: { type: Type.STRING },
              atsOptimized: { type: Type.STRING }
            },
            required: ["professional", "atsOptimized"]
          }
        }
      });
      
      const responseText = response.text ? response.text : (response as any).response?.text();
      return JSON.parse(responseText || "{}") as ImprovedContent;
    } catch (error) {
      console.error(`Improvement failed for section ${title}:`, error);
      // في حال الفشل نعيد النص الأصلي لتجنب توقف التطبيق
      return { professional: content, atsOptimized: content };
    }
  }

  // ---------------------------------------------------------------------------
  // 4. مطابقة الوصف الوظيفي (Tailoring)
  // ---------------------------------------------------------------------------
  async matchJobDescription(resumeText: string, sections: ResumeSection[], jobDescription: string): Promise<JobMatchResult> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `
    ROLE: ATS Resume Tailoring Expert.
    TASK: Compare the Resume against the Job Description (JD).
    1. Identify matching keywords and missing keywords.
    2. Rewrite the resume sections to better align with the JD (using JD keywords naturally).
    
    JD: ${jobDescription}
    
    RESUME SECTIONS: ${JSON.stringify(sections.map(s => ({ id: s.id, title: s.title, content: s.content })))}
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-lite', 
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matchingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              matchFeedback: { type: Type.STRING },
              tailoredSections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    content: { type: Type.STRING }
                  },
                  required: ["id", "title", "content"]
                }
              }
            },
            required: ["matchingKeywords", "missingKeywords", "matchFeedback", "tailoredSections"]
          }
        }
      });

      const responseText = response.text ? response.text : (response as any).response?.text();
      const data = JSON.parse(responseText || "{}");
      
      const totalK = (data.matchingKeywords?.length || 0) + (data.missingKeywords?.length || 0);
      return { 
        ...data, 
        matchPercentage: totalK > 0 ? Math.round((data.matchingKeywords.length / totalK) * 100) : 0 
      };
    } catch (error) {
      console.error("Job Match Error:", error);
      return { matchPercentage: 0, matchingKeywords: [], missingKeywords: [], matchFeedback: "Tailoring failed.", tailoredSections: sections };
    }
  }
}
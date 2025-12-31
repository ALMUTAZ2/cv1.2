import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent } from "../types";

export class GeminiService {
  private getClient() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private calculateATSScore(data: any): number {
    let earnedPoints = 25; 
    const sectionsFound = data.structuredSections?.map((s: any) => s.title.toLowerCase()) || [];
    
    if (sectionsFound.some((s: string) => s.includes('experience'))) earnedPoints += 20;
    if (sectionsFound.some((s: string) => s.includes('skills'))) earnedPoints += 15;
    
    const skillsCount = data.hardSkillsFound?.length || 0;
    earnedPoints += Math.min(skillsCount * 2, 20);

    const totalBullets = data.metrics?.totalBulletPoints || 0;
    const bulletsWithMetrics = data.metrics?.bulletsWithMetrics || 0;
    if (totalBullets > 0) {
      earnedPoints += Math.min((bulletsWithMetrics / totalBullets) * 20, 20);
    }

    const penaltyPoints = (data.criticalErrors?.length || 0) * 5;
    return Math.max(10, Math.min(100, Math.round(earnedPoints - penaltyPoints)));
  }

  async analyzeResume(text: string): Promise<AnalysisResult> {
    const ai = this.getClient();
    const systemInstruction = `ROLE: Professional ATS Auditor.
    TASK: Break down the resume into its natural sections.
    Identify hard skills and missing ones for the role.
    Ensure 'Experience' and 'Education' are separate.
    OUTPUT: Strict JSON. Keep sections content concise but intact.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-lite', 
        contents: systemInstruction + `\n\nINPUT:\n${text}`,
        config: {
          temperature: 0.1,
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
            required: ["detectedRole", "hardSkillsFound", "missingHardSkills", "metrics", "formattingIssues", "criticalErrors", "summaryFeedback", "structuredSections"]
          }
        }
      });

      const rawData = JSON.parse(response.text || "{}");
      return { ...rawData, overallScore: this.calculateATSScore(rawData) };
    } catch (error: any) {
      console.error("Gemini Analysis Error:", error);
      throw new Error("Analysis failed. Text might be too complex or API limit reached.");
    }
  }

  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    const ai = this.getClient();
    const prompt = `Rewrite this "${title}" resume section.
    1. professional: Executive tone, strong verbs.
    2. atsOptimized: Keyword-dense, focuses on results.
    Use HTML (<b> for bold, <ul>/<li> for lists).
    Content: ${content}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: prompt,
        config: {
          temperature: 0.7,
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
      return JSON.parse(response.text || "{}") as ImprovedContent;
    } catch (error) {
      return { professional: content, atsOptimized: content };
    }
  }

  async matchJobDescription(resumeText: string, sections: ResumeSection[], jobDescription: string): Promise<JobMatchResult> {
    const ai = this.getClient();
    const prompt = `Tailor sections to this JD. Use HTML formatting.
    JD: ${jobDescription}`;

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

      const data = JSON.parse(response.text || "{}");
      const totalK = (data.matchingKeywords?.length || 0) + (data.missingKeywords?.length || 0);
      return { 
        ...data, 
        matchPercentage: totalK > 0 ? Math.round((data.matchingKeywords.length / totalK) * 100) : 0 
      };
    } catch (error) {
      return { matchPercentage: 0, matchingKeywords: [], missingKeywords: [], matchFeedback: "Tailoring failed.", tailoredSections: sections };
    }
  }
}

import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent } from "./types";

export class GeminiService {
  private getClient() {
    // Corrected to use process.env.API_KEY directly as per guidelines
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  /**
   * 🧠 Forensic Scoring Algorithm V4
   * Scores based on proof of impact and industry alignment.
   */
  private calculateScore(data: any): number {
    let score = 15;

    // 1. Structure Bonus
    const hasExperience = data.structuredSections?.some((s: any) => s.title.toLowerCase().includes('experience'));
    const hasEducation = data.structuredSections?.some((s: any) => s.title.toLowerCase().includes('education'));
    const hasSkills = data.structuredSections?.some((s: any) => s.title.toLowerCase().includes('skills'));
    
    if (hasExperience) score += 10;
    if (hasEducation) score += 5;
    if (hasSkills) score += 5;

    // 2. Hard Skills Bonus
    const skillsPoints = Math.min((data.hardSkillsFound?.length || 0) * 2, 25);
    score += skillsPoints;

    // 3. Impact Bonus
    if (data.metrics?.totalBulletPoints > 0) {
      const metricRatio = data.metrics.bulletsWithMetrics / data.metrics.totalBulletPoints;
      const impactPoints = Math.min((metricRatio / 0.3) * 15, 20);
      score += impactPoints;
    }

    // 4. Penalties
    const missingCount = data.missingHardSkills?.length || 0;
    score -= Math.min(missingCount * 3, 15);
    score -= Math.min((data.formattingIssues?.length || 0) * 4, 12);
    score -= Math.min((data.metrics?.weakVerbsCount || 0) * 1, 10);
    score -= (data.criticalErrors?.length || 0) * 15;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  async analyzeResume(text: string): Promise<AnalysisResult> {
    const ai = this.getClient();
    
    const systemInstruction = `
      ROLE: You are "PROPHET," a Forensic ATS Auditor. Your job is purely diagnostic.
      
      CORE RULES:
      1. Structure Check: Identify key resume sections strictly.
      2. Synonyms: React and React.js are the same.
      3. Gap Analysis: Infer role and list truly missing critical skills.
      4. Formatting: Flag non-standard ATS formatting.
      
      OUTPUT: Return RAW DATA in JSON.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview", 
        contents: [
          { role: 'user', parts: [{ text: systemInstruction + `\n\nANALYZE THIS RESUME:\n${text}` }] }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedRole: { type: Type.STRING },
              hardSkillsFound: { type: Type.ARRAY, items: { type: Type.STRING } },
              missingHardSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              softSkillsFound: { type: Type.ARRAY, items: { type: Type.STRING } },
              metrics: {
                type: Type.OBJECT,
                properties: {
                  totalBulletPoints: { type: Type.NUMBER },
                  bulletsWithMetrics: { type: Type.NUMBER },
                  weakVerbsCount: { type: Type.NUMBER },
                  sectionCount: { type: Type.NUMBER }
                },
                required: ["totalBulletPoints", "bulletsWithMetrics", "weakVerbsCount"]
              },
              formattingIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
              criticalErrors: { type: Type.ARRAY, items: { type: Type.STRING } },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
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
            required: ["detectedRole", "hardSkillsFound", "missingHardSkills", "metrics", "formattingIssues", "structuredSections"]
          }
        }
      });

      // Fixed: Use .text property directly
      const rawData = JSON.parse(response.text || "{}");
      const overallScore = this.calculateScore(rawData);
      return { ...rawData, overallScore };
    } catch (error) {
      console.error("Gemini Analysis Error:", error);
      throw new Error("Failed to analyze resume. Please check your API Key.");
    }
  }

  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { role: 'user', parts: [{ text: `Act as an Expert Resume Writer. Rewrite "${title}" section.\nOriginal: "${content}"\nReturn JSON with "professional" and "atsOptimized" keys.` }]}
      ],
      config: {
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
    // Fixed: Use .text property directly
    return JSON.parse(response.text || "{}") as ImprovedContent;
  }

  async matchJobDescription(resumeText: string, sections: ResumeSection[], jobDescription: string): Promise<JobMatchResult> {
    const ai = this.getClient();
    const prompt = `Match Job Description to Resume.\nJD: ${jobDescription}\nResume: ${resumeText}\nSections: ${JSON.stringify(sections)}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{ role: 'user', parts: [{ text: prompt }]}],
      config: {
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

    // Fixed: Use .text property directly
    const data = JSON.parse(response.text || "{}");
    const matchedCount = data.matchingKeywords?.length || 0;
    const missingCount = data.missingKeywords?.length || 0;
    const totalKeywords = matchedCount + missingCount;
    const calculatedMatch = totalKeywords > 0 ? Math.round((matchedCount / totalKeywords) * 100) : 0;

    return { ...data, matchPercentage: calculatedMatch } as JobMatchResult;
  }
}

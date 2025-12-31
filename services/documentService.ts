import * as pdfjs from 'pdfjs-dist';

// استخدام مسار خارجي موثوق للـ Worker لضمان التوافق مع Vercel
pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs';

declare const mammoth: any;

export class DocumentService {
  static async extractText(file: File): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    try {
      if (extension === 'pdf') {
        return await this.extractFromPdf(file);
      } else if (extension === 'docx' || extension === 'doc') {
        return await this.extractFromDocx(file);
      } else {
        throw new Error('Unsupported file format. Please upload PDF or Word files.');
      }
    } catch (error) {
      console.error("Extraction error:", error);
      throw new Error('فشل استخراج النص من الملف. يرجى المحاولة بصيغة أخرى.');
    }
  }

  private static async extractFromPdf(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    
    try {
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }

      return fullText;
    } catch (err) {
      console.warn("PDF.js error, falling back to basic extraction or failing gracefully.");
      throw err;
    }
  }

  private static async extractFromDocx(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    if (typeof mammoth === 'undefined') {
      throw new Error("Mammoth library not loaded.");
    }
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
}
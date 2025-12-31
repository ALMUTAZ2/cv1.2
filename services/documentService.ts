import * as pdfjs from 'pdfjs-dist';

// Setting the worker source directly from CDN to match the exact API version used in index.html
pdfjs.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@5.4.530/build/pdf.worker.mjs';

declare const mammoth: any;

export class DocumentService {
  static async extractText(file: File): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'pdf') {
      return await this.extractFromPdf(file);
    } else if (extension === 'docx' || extension === 'doc') {
      return await this.extractFromDocx(file);
    } else {
      throw new Error('Unsupported file format. Please upload PDF or Word files.');
    }
  }

  private static async extractFromPdf(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    
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
  }

  private static async extractFromDocx(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    // mammoth is still loaded via CDN as requested to only refactor pdf.js
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
}
import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';

// Handle potential default export inconsistency with ESM CDN
const pdfjs: any = (pdfjsLib as any).default || pdfjsLib;

// Initialize worker with the exact version match
if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

const MAX_DIMENSION = 1600; // Sufficient for high-quality OCR while keeping size low
const JPEG_QUALITY = 0.6;   // Aggressive but safe compression for text
const PDF_SCALE = 1.5;      // Rendering scale for PDF pages to ensure text clarity

const optimizeImageToBlob = (
  img: HTMLImageElement | HTMLCanvasElement, 
  mimeType: string = 'image/jpeg'
): Promise<Blob> => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Resize logic
        if (width > height) {
            if (width > MAX_DIMENSION) {
                height = Math.round(height * (MAX_DIMENSION / width));
                width = MAX_DIMENSION;
            }
        } else {
            if (height > MAX_DIMENSION) {
                width = Math.round(width * (MAX_DIMENSION / height));
                height = MAX_DIMENSION;
            }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            // Fallback if canvas fails
            canvas.toBlob(b => resolve(b!), mimeType, JPEG_QUALITY); 
            return;
        }

        // Fill white background (for transparent PNGs/PDF backgrounds)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // Optimization: Grayscale & Contrast
        ctx.filter = 'grayscale(100%) contrast(125%)';
        
        ctx.drawImage(img as any, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
            resolve(blob!);
        }, mimeType, JPEG_QUALITY);
    });
};

const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
};

export const processPdf = async (file: File): Promise<File> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        // Use the resolved pdfjs object which might be the default export
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const doc = new jsPDF();
        
        const totalPages = pdf.numPages;

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: PDF_SCALE });
            
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) continue;

            // Render PDF page to canvas
            await page.render({ canvasContext: ctx, viewport }).promise;

            // Optimize that canvas (grayscale/resize)
            const optimizedBlob = await optimizeImageToBlob(canvas, 'image/jpeg');
            
            // Convert blob to base64 for jsPDF
            const optimizedBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(optimizedBlob);
            });

            // Add to new PDF
            const imgProps = doc.getImageProperties(optimizedBase64);
            const pdfWidth = doc.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            if (i > 1) doc.addPage();
            doc.addImage(optimizedBase64, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            
            // Release PDF page resources
            page.cleanup();
        }

        const optimizedPdfBlob = doc.output('blob');
        return new File([optimizedPdfBlob], file.name, { type: 'application/pdf' });
    } catch (e) {
        console.error("PDF Optimization failed, returning original:", e);
        return file; // Fallback to original if processing fails
    }
};

export const optimizeFile = async (file: File): Promise<File> => {
    // If it's a PDF
    if (file.type === 'application/pdf') {
        return await processPdf(file);
    }
    
    // If it's an Image
    if (file.type.startsWith('image/')) {
        try {
            const img = await loadImage(file);
            const blob = await optimizeImageToBlob(img, 'image/jpeg');
            // Replace extension with .jpg
            const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            return new File([blob], newName, { type: 'image/jpeg' });
        } catch (e) {
            console.error("Image optimization failed:", e);
            return file;
        }
    }

    // Unsupported for optimization, return original
    return file;
};
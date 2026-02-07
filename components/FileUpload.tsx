import React, { useRef, useState } from 'react';
import { DocumentPlusIcon, CloudArrowUpIcon, ExclamationTriangleIcon, SparklesIcon, XCircleIcon, BoltIcon } from '@heroicons/react/24/outline';

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void;
  isProcessing: boolean;
  onOptimizeToggle: (enabled: boolean) => void;
  isOptimizeEnabled: boolean;
}

const EFFICIENCY_WARNING_THRESHOLD = 8 * 1024 * 1024; // 8MB warning
const SUPPORTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'zip'];

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelect, isProcessing, onOptimizeToggle, isOptimizeEnabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [oversizeCount, setOversizeCount] = useState(0);
  const [unsupportedCount, setUnsupportedCount] = useState(0);

  const validateAndUpload = (files: File[]) => {
      const validFiles: File[] = [];
      let unsupported = 0;
      let oversized = 0;

      files.forEach(f => {
          const ext = f.name.split('.').pop()?.toLowerCase() || '';
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
              validFiles.push(f);
              if (f.size > EFFICIENCY_WARNING_THRESHOLD) oversized++;
          } else {
              unsupported++;
          }
      });

      setUnsupportedCount(unsupported);
      setOversizeCount(oversized);

      if (validFiles.length > 0) {
          onFilesSelect(validFiles);
      }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndUpload(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isProcessing) setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndUpload(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="space-y-4">
        <div 
        className={`relative border-2 border-dashed rounded-[2.5rem] p-10 transition-all duration-500 text-center group overflow-hidden
            ${isProcessing 
                ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed' 
                : isDragging 
                    ? 'border-brand-500 bg-brand-50 scale-[1.04] ring-8 ring-brand-100/50 shadow-2xl' 
                    : 'border-slate-300 bg-white hover:bg-brand-50 hover:border-brand-400 cursor-pointer shadow-sm hover:shadow-xl'
            }
        `}
        onClick={(e) => {
            // Prevent click when toggling the switch
            if ((e.target as HTMLElement).closest('.optimize-toggle')) return;
            !isProcessing && fileInputRef.current?.click();
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        >
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleInputChange} 
            accept=".pdf,image/*,.zip" 
            multiple
            className="hidden" 
            disabled={isProcessing}
        />
        
        <div className="flex flex-col items-center justify-center space-y-5 pointer-events-none">
            <div className={`p-5 rounded-[1.5rem] shadow-xl transition-all duration-700 
                ${isDragging ? 'bg-brand-600 text-white scale-125 rotate-6' : 'bg-brand-50 text-brand-600 group-hover:scale-110 group-hover:-rotate-6'}
            `}>
                {isDragging ? <CloudArrowUpIcon className="w-10 h-10" /> : <DocumentPlusIcon className="w-10 h-10" />}
            </div>
            <div className="space-y-1">
                <p className="text-xl font-black text-slate-800 tracking-tight leading-none">
                    {isProcessing ? 'Agent Active' : 'Initialize Batch'}
                </p>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    PDF, JPEG, PNG or ZIP
                </p>
            </div>
        </div>

        {/* Turbo Mode Toggle */}
        <div className="optimize-toggle absolute bottom-4 left-0 right-0 flex justify-center pointer-events-auto">
            <button
                type="button"
                onClick={() => onOptimizeToggle(!isOptimizeEnabled)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all shadow-sm ${
                    isOptimizeEnabled 
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                    : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
                }`}
            >
                <BoltIcon className={`w-3.5 h-3.5 ${isOptimizeEnabled ? 'fill-indigo-500' : ''}`} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                    Turbo Mode: {isOptimizeEnabled ? 'ON' : 'OFF'}
                </span>
            </button>
        </div>
        </div>

        {isOptimizeEnabled && (
            <div className="text-center animate-in fade-in slide-in-from-top-1">
                 <p className="text-[9px] text-indigo-500 font-bold bg-indigo-50 inline-block px-2 py-1 rounded-md">
                    Files will be converted to Grayscale & Compressed for speed
                 </p>
            </div>
        )}

        {unsupportedCount > 0 && (
            <div className="flex items-start gap-4 p-4 bg-red-50 border border-red-100 rounded-2xl animate-in slide-in-from-bottom-2">
                <XCircleIcon className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                    <p className="text-[11px] font-black text-red-900 uppercase">Rejected Files Detected</p>
                    <p className="text-[10px] font-medium text-red-700 mt-0.5">
                        {unsupportedCount} item(s) were skipped. Please upload standard PDF, JPG, PNG, or ZIP files.
                    </p>
                </div>
            </div>
        )}

        {oversizeCount > 0 && !isOptimizeEnabled && (
            <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl animate-in slide-in-from-bottom-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                    <p className="text-[11px] font-black text-amber-900 uppercase">Efficiency Warning</p>
                    <p className="text-[10px] font-medium text-amber-800 mt-0.5 leading-relaxed">
                        {oversizeCount} file(s) exceed 8MB. Enable <span className="font-bold">Turbo Mode</span> above to compress them for faster AI analysis.
                    </p>
                </div>
            </div>
        )}
        
        {!isProcessing && (
            <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase text-slate-300 tracking-widest">
                <SparklesIcon className="w-3 h-3" />
                Gemini 3 Pro Vision Ready
            </div>
        )}
    </div>
  );
};

export default FileUpload;
import React, { useRef, useState } from 'react';
import { DocumentPlusIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void;
  isProcessing: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelect, isProcessing }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      onFilesSelect(files);
    }
    // Reset input to allow selecting the same file again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy'; // Explicitly show copy cursor
    
    if (!isProcessing && !isDragging) {
        setIsDragging(true);
    }
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isProcessing && !isDragging) {
        setIsDragging(true);
    }
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if we are actually leaving the container (and not just entering a child element)
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
    }
    
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (isProcessing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      onFilesSelect(files);
    }
  };

  return (
    <div 
      className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 text-center group
        ${isProcessing 
            ? 'border-gray-300 bg-gray-50 opacity-50 cursor-not-allowed' 
            : isDragging 
                ? 'border-brand-500 bg-brand-50 scale-[1.02] shadow-lg ring-4 ring-brand-100' 
                : 'border-brand-300 bg-white hover:bg-brand-50 hover:border-brand-400 cursor-pointer'
        }
      `}
      onClick={() => !isProcessing && fileInputRef.current?.click()}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleInputChange} 
        accept="image/*,.pdf,.zip,application/zip,application/x-zip-compressed" 
        multiple
        className="hidden" 
        disabled={isProcessing}
      />
      
      {/* pointer-events-none ensures drag events bubble up from children to the parent container smoothly */}
      <div className="flex flex-col items-center justify-center space-y-4 pointer-events-none">
        <div className={`p-4 rounded-full shadow-sm transition-transform duration-200 
            ${isDragging ? 'bg-brand-100 text-brand-600 scale-110' : 'bg-brand-50 text-brand-500 group-hover:scale-110'}
        `}>
             {isDragging ? <CloudArrowUpIcon className="w-8 h-8" /> : <DocumentPlusIcon className="w-8 h-8" />}
        </div>
        <div className="space-y-1">
          <p className="text-lg font-medium text-gray-700">
            {isProcessing ? 'Processing...' : isDragging ? 'Drop files to queue' : 'Click to select or Drop files'}
          </p>
          <p className="text-sm text-gray-500">
             PDF, Images or ZIP (Max 100MB)
          </p>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
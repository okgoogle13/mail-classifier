import React, { useState } from 'react';
import { MailAnalysisResult, ClassificationType } from '../types';
import { uploadFileToDrive } from '../services/googleDriveService';
import { 
  ArchiveBoxIcon, 
  PaperAirplaneIcon, 
  TrashIcon, 
  QuestionMarkCircleIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
  BellAlertIcon,
  Square2StackIcon,
  MapPinIcon,
  CloudArrowUpIcon,
  CheckIcon,
  ArrowPathIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

interface AnalysisCardProps {
  result: MailAnalysisResult;
  originalFile: File;
  itemIndex?: number;
  totalItems?: number;
  driveConfig?: { id: string; name: string } | null;
}

const getCategoryStyles = (category: ClassificationType) => {
  switch (category) {
    case ClassificationType.FORWARD_AYR:
      return { 
        bg: 'bg-blue-50', 
        border: 'border-blue-200', 
        text: 'text-blue-800', 
        icon: <PaperAirplaneIcon className="w-6 h-6" />,
        label: '🇬🇧 Forward to Ayr'
      };
    case ClassificationType.FORWARD_OZ:
      return { 
        bg: 'bg-indigo-50', 
        border: 'border-indigo-200', 
        text: 'text-indigo-800', 
        icon: <PaperAirplaneIcon className="w-6 h-6 rotate-90" />,
        label: '🇦🇺 Forward to Oz'
      };
    case ClassificationType.DIGITAL_STORE_ACTION:
      return { 
        bg: 'bg-orange-50', 
        border: 'border-orange-200', 
        text: 'text-orange-800', 
        icon: <BellAlertIcon className="w-6 h-6" />,
        label: '⚡ Digital (Action Req)'
      };
    case ClassificationType.DIGITAL_STORE:
      return { 
        bg: 'bg-green-50', 
        border: 'border-green-200', 
        text: 'text-green-800', 
        icon: <ArchiveBoxIcon className="w-6 h-6" />,
        label: '💾 Digital Store'
      };
    case ClassificationType.SHRED:
      return { 
        bg: 'bg-gray-50', 
        border: 'border-gray-200', 
        text: 'text-gray-800', 
        icon: <TrashIcon className="w-6 h-6" />,
        label: '🗑️ Shred'
      };
    default:
      return { 
        bg: 'bg-yellow-50', 
        border: 'border-yellow-200', 
        text: 'text-yellow-800', 
        icon: <QuestionMarkCircleIcon className="w-6 h-6" />,
        label: '❓ TBC'
      };
  }
};

const AnalysisCard: React.FC<AnalysisCardProps> = ({ result, originalFile, itemIndex = 1, totalItems = 1, driveConfig }) => {
  const styles = getCategoryStyles(result.classification);
  const isBatch = totalItems > 1;
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState("");

  const copyToClipboard = () => {
    const text = `
ITEM ID: ${result.itemId}
CLASSIFICATION: ${result.classification}
TAG: ${result.tag}
ADDRESSEE: ${result.addressee}
SENDER: ${result.sender}
ORIGINAL ADDRESS: ${result.originalAddress}
REASON: ${result.reason}
DEADLINE: ${result.deadline}
AUTO ACTION: ${result.auto_action || 'N/A'}
    `.trim();
    navigator.clipboard.writeText(text);
    alert("Full extraction details copied to clipboard.");
  };

  const handleDownloadRenamed = () => {
    const url = URL.createObjectURL(originalFile);
    const link = document.createElement('a');
    const extension = originalFile.name.split('.').pop() || 'pdf';
    let filename = result.suggestedFilename || `item_${result.itemId}`;
    if (!filename.toLowerCase().endsWith(`.${extension}`)) {
        filename = `${filename}.${extension}`;
    }
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUploadToDrive = async () => {
      if (!driveConfig) return;
      setUploadStatus('uploading');
      setErrorMessage("");
      
      const extension = originalFile.name.split('.').pop() || 'pdf';
      let filename = result.suggestedFilename || `item_${result.itemId}`;
      if (!filename.toLowerCase().endsWith(`.${extension}`)) {
          filename = `${filename}.${extension}`;
      }

      const description = `Sender: ${result.sender}\nAddressee: ${result.addressee}\nClassification: ${result.classification}\nReason: ${result.reason}`;

      try {
          await uploadFileToDrive(originalFile, driveConfig.id, filename, description);
          setUploadStatus('success');
      } catch (e: any) {
          setUploadStatus('error');
          setErrorMessage(e.message || "Drive Upload Failed: Please check your internet connection and ensure the selected folder is accessible.");
      }
  };

  return (
    <div className={`rounded-3xl border-2 ${styles.border} overflow-hidden shadow-sm transition-all duration-300 group hover:shadow-lg`}>
      {isBatch && (
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-2.5 flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">
             <Square2StackIcon className="w-3.5 h-3.5" />
             Letter Segmentation {itemIndex} of {totalItems}
             {result.week_batch_id && (
                 <span className="ml-auto bg-white border border-slate-200 px-2 py-0.5 rounded text-[10px]">
                     BATCH: {result.week_batch_id}
                 </span>
             )}
        </div>
      )}

      <div className={`${styles.bg} p-6 border-b ${styles.border} flex items-center justify-between`}>
        <div className="flex items-center space-x-4">
          <div className={`p-3 rounded-2xl bg-white shadow-sm ${styles.text}`}>
            {styles.icon}
          </div>
          <div>
            <h2 className={`text-xl font-black ${styles.text} tracking-tight`}>{styles.label}</h2>
            <div className="flex items-center gap-2 mt-0.5">
                <p className={`text-[10px] font-bold uppercase tracking-widest opacity-80 ${styles.text}`}>{result.tag || "Routine"}</p>
                {result.auto_action && (
                    <span className="text-[9px] uppercase font-black px-1.5 py-0.5 bg-white/50 rounded-full text-slate-600 border border-black/5">
                        {result.auto_action.replace(/_/g, ' ')}
                    </span>
                )}
            </div>
          </div>
        </div>
        <button onClick={copyToClipboard} className="p-3 hover:bg-white/60 rounded-xl text-slate-400 hover:text-slate-800 transition-all active:scale-95" title="Copy Metadata">
          <DocumentDuplicateIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 bg-white space-y-6">
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-4">
           <MapPinIcon className="w-5 h-5 text-brand-500 mt-1" />
           <div className="space-y-1">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Address Detected</label>
             <p className="text-sm text-slate-900 font-bold leading-snug">{result.originalAddress}</p>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recipient</label>
            <p className="text-slate-900 font-bold text-sm">{result.addressee}</p>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sender</label>
            <p className="text-slate-900 font-bold text-sm">{result.sender}</p>
          </div>
        </div>

        <div className="pt-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Reasoning Path</label>
          <p className="text-slate-600 leading-relaxed text-xs font-medium mt-2 bg-slate-50 p-4 rounded-xl italic border-l-4 border-slate-200">
            "{result.reason}"
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-100">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Action Deadline</label>
            <p className={`font-black text-sm ${result.deadline !== 'None' ? 'text-red-600' : 'text-slate-500'}`}>
              {result.deadline}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nishant's Ref</label>
            <p className="text-slate-500 font-black text-sm tracking-widest">{result.itemId}</p>
          </div>
        </div>

        {uploadStatus === 'error' && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <ExclamationCircleIcon className="w-4 h-4 text-red-500" />
                <p className="text-[10px] font-bold text-red-700">{errorMessage}</p>
            </div>
        )}

        <div className="pt-6 border-t border-slate-100 bg-slate-50/50 -mx-6 -mb-6 p-6 flex items-center justify-between">
            <div className="text-[9px] text-slate-400 font-black font-mono truncate max-w-[200px]" title={result.suggestedFilename}>
                {result.suggestedFilename}
            </div>
            <div className="flex items-center gap-3">
                {driveConfig && (
                    <button
                        onClick={handleUploadToDrive}
                        disabled={uploadStatus === 'uploading' || uploadStatus === 'success'}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border
                           ${uploadStatus === 'success' 
                               ? 'bg-green-100 text-green-700 border-green-200' 
                               : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-brand-600 hover:border-brand-300'
                           }
                        `}
                    >
                        {uploadStatus === 'uploading' ? (
                             <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                        ) : uploadStatus === 'success' ? (
                             <CheckIcon className="w-3.5 h-3.5" />
                        ) : (
                             <CloudArrowUpIcon className="w-3.5 h-3.5 text-brand-500" />
                        )}
                        {uploadStatus === 'success' ? 'Archived' : 'Save to Drive'}
                    </button>
                )}
                <button
                    onClick={handleDownloadRenamed}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md active:scale-95"
                >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    Renamed PDF
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisCard;
export enum ClassificationType {
  FORWARD_AYR = "FORWARD TO AYR (Dad's mail)",
  FORWARD_OZ = "FORWARD TO OZ (Physical items needed)",
  DIGITAL_STORE = "DIGITAL STORE (Shred physical copy)",
  DIGITAL_STORE_ACTION = "DIGITAL STORE (Action required)",
  SHRED = "SHRED (Junk)",
  TBC = "TBC (Can't determine)"
}

export interface MailAnalysisResult {
  itemId: string;
  classification: ClassificationType;
  tag: string;
  addressee: string;
  sender: string;
  originalAddress: string;
  reason: string;
  deadline: string;
  suggestedFilename: string;
  
  // New Metadata & Routing Fields
  ukpostbox_ref?: string;
  drive_file_id?: string;
  week_batch_id?: string;
  routing?: string;
  importance?: string;
  auto_action?: string;
  document_type?: string;
  account_or_reference?: string;
  confidence?: string;
}

export interface ProcessingState {
  status: 'idle' | 'analyzing' | 'success' | 'error';
  error?: string;
  data?: MailAnalysisResult;
}

export interface BatchItem {
  id: string;
  file?: File; // Optional now, as we might just have a Drive Reference
  driveFileId?: string;
  driveMimeType?: string;
  name: string;
  status: 'idle' | 'analyzing' | 'success' | 'error' | 'needs_manual_review';
  statusMessage?: string; // Granular status text (e.g., "Retrying in 5s...")
  results?: MailAnalysisResult[];
  error?: string;
  previewUrl?: string;
}
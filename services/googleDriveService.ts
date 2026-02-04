// Types for the Google Global Objects
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Scopes: drive.readonly is required to list and read files in a user's existing folder
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];

// Default Credentials (Fallbacks)
const DEFAULT_CLIENT_ID = '867091085935-juv1m57ivbm98selovn02nr9onon6p3o.apps.googleusercontent.com';
const DEFAULT_API_KEY = 'AIzaSyCujDvQWeakswsYBjGa59LaGrE8rs2U16E';
const DEFAULT_APP_ID = '867091085935';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

const getDriveConfig = () => {
    return {
        clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID || localStorage.getItem('ukpostbox_google_client_id') || DEFAULT_CLIENT_ID,
        apiKey: process.env.REACT_APP_GOOGLE_API_KEY || localStorage.getItem('ukpostbox_google_api_key') || DEFAULT_API_KEY,
        appId: process.env.REACT_APP_GOOGLE_APP_ID || localStorage.getItem('ukpostbox_google_app_id') || DEFAULT_APP_ID
    };
};

// Shared wait function for Google Scripts
const waitForScripts = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        // If already loaded
        if (window.gapi && window.google && window.google.accounts) {
            return resolve();
        }

        let attempts = 0;
        const maxAttempts = 100; // 10 seconds
        const interval = setInterval(() => {
            attempts++;
            if (window.gapi && window.google && window.google.accounts) {
                clearInterval(interval);
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                // Last check
                if (window.gapi && window.google && window.google.accounts) {
                    resolve();
                } else {
                    reject(new Error("Timeout waiting for Google GIS scripts. Please check your network or ad blocker."));
                }
            }
        }, 100);
    });
};

export const initGoogleDrive = async (): Promise<boolean> => {
  const { clientId, apiKey } = getDriveConfig();

  if (!clientId || !apiKey) {
    console.warn("Google Drive credentials missing.");
    return false;
  }

  try {
      await waitForScripts();
  } catch (e) {
      console.error(e);
      return false;
  }

  // 2. Initialize GAPI (Client + Picker)
  const initGapi = new Promise<boolean>((resolve) => {
      if (gapiInited) return resolve(true);
      
      window.gapi.load('client:picker', async () => {
          try {
              await window.gapi.client.init({
                  apiKey: apiKey,
                  discoveryDocs: DISCOVERY_DOCS,
              });
              gapiInited = true;
              resolve(true);
          } catch (error) {
              console.error("GAPI Init Error:", error);
              resolve(false);
          }
      });
  });

  // 3. Initialize GIS (Token Client)
  const initGis = new Promise<boolean>((resolve) => {
      if (gisInited) return resolve(true);

      try {
          tokenClient = window.google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: SCOPES,
              callback: '', // defined at request time
          });
          gisInited = true;
          resolve(true);
      } catch (error) {
          console.error("GIS Init Error:", error);
          resolve(false);
      }
  });

  const [gapiResult, gisResult] = await Promise.all([initGapi, initGis]);
  return gapiResult && gisResult;
};

export const authenticateDrive = async (): Promise<string> => {
  // Ensure scripts are loaded before proceeding
  try {
      await waitForScripts();
  } catch (e) {
      throw new Error("Drive not initialized. Google Scripts not loaded.");
  }

  return new Promise((resolve, reject) => {
    // If tokenClient wasn't initialized (e.g. initGoogleDrive failed or wasn't called), try to init now
    if (!tokenClient) {
        const { clientId } = getDriveConfig();
        if (clientId && window.google && window.google.accounts) {
             try {
                 tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: SCOPES,
                    callback: '', 
                });
             } catch (e) {
                 reject(new Error("Failed to initialize Token Client lazily."));
                 return;
             }
        } else {
            reject(new Error("Drive not initialized. Missing Token Client or Google Scripts."));
            return;
        }
    }

    tokenClient.callback = async (resp: any) => {
      if (resp.error) {
        reject(resp);
      }
      resolve(resp.access_token);
    };

    // Use gapi.client.getToken() to check if we already have a valid session, 
    // effectively doing a silent refresh if possible, otherwise prompt.
    if (window.gapi && window.gapi.client && window.gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  });
};

export const openFolderPicker = async (accessToken: string): Promise<{ id: string; name: string } | null> => {
    const { appId, apiKey } = getDriveConfig();
    
    // Ensure Picker API is loaded
    if (!window.google || !window.google.picker) {
        await new Promise<void>((resolve) => window.gapi.load('picker', resolve));
        if (!window.google || !window.google.picker) {
             throw new Error("Google Picker API failed to load");
        }
    }

    // STRICT VALIDATION: App ID (Project Number) must be numeric
    if (!appId || !/^\d+$/.test(appId)) {
        throw new Error("Invalid App ID. The Project Number must be numeric (e.g., 867091085935). Do not use the Project ID string.");
    }

    return new Promise((resolve, reject) => {
        try {
            const pickerCallback = (data: any) => {
                if (data.action === window.google.picker.Action.PICKED) {
                    const doc = data.docs[0];
                    resolve({
                        id: doc.id,
                        name: doc.name
                    });
                } else if (data.action === window.google.picker.Action.CANCEL) {
                    resolve(null);
                }
            };

            const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
                .setSelectFolderEnabled(true)
                .setMimeTypes('application/vnd.google-apps.folder');

            // Dynamic origin calculation to prevent 'Origin mismatch' errors
            const origin = window.location.protocol + '//' + window.location.host;

            const picker = new window.google.picker.PickerBuilder()
                .setAppId(appId)
                .setOAuthToken(accessToken)
                .setDeveloperKey(apiKey)
                .setOrigin(origin)
                .addView(view)
                .setCallback(pickerCallback)
                .setTitle('Select Mail Input Folder')
                .build();

            picker.setVisible(true);
        } catch (error) {
            reject(error);
        }
    });
};

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    thumbnailLink?: string;
    createdTime?: string;
}

export const listFilesInFolder = async (folderId: string): Promise<DriveFile[]> => {
    const accessToken = window.gapi.client.getToken()?.access_token || await authenticateDrive();
    
    // Query: Inside folder AND not trashed AND (is image OR is PDF)
    const query = `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType = 'application/pdf')`;
    
    const response = await window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, thumbnailLink, createdTime)',
        pageSize: 100,
        orderBy: 'createdTime desc'
    });

    return response.result.files || [];
};

export const getFileBase64 = async (fileId: string): Promise<string> => {
    const accessToken = window.gapi.client.getToken()?.access_token || await authenticateDrive();

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) throw new Error("Failed to download file from Drive");

    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onload = () => {
            const base64String = reader.result as string;
            resolve(base64String.split(',')[1]);
        };
        reader.onerror = reject;
    });
};

export const uploadFileToDrive = async (
    file: File | Blob, 
    folderId: string, 
    filename: string, 
    description: string
): Promise<any> => {
    
    const accessToken = window.gapi.client.getToken()?.access_token || await authenticateDrive();
    
    const metadata = {
        name: filename,
        parents: [folderId],
        description: description,
        mimeType: file.type || 'application/pdf'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form
    });

    if (!response.ok) {
        throw new Error('Upload failed: ' + response.statusText);
    }

    return await response.json();
};